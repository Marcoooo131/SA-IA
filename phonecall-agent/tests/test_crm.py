"""CRM write logic, tested ONLY against the in-memory simulated connector.

These are also the contract tests a real connector must pass (in a non-production CRM
environment) before being enabled.
"""

import pytest

from conftest import add_recording, get_call, login, post_webhook, recording_sid, webhook_params
from phonecall_agent.config import Settings
from phonecall_agent.crm import build_crm_connector
from phonecall_agent.crm.simulated import SimulatedCRMConnector
from phonecall_agent.crm_service import push_to_crm
from phonecall_agent.models import CallStatus, CrmWriteStatus


@pytest.fixture
def sim_crm(container):
    container.settings.crm_connector = "simulated"
    container.crm = SimulatedCRMConnector()
    return container.crm


def process_and_approve(client, container, fake_twilio, n: int, text: str | None = None):
    add_recording(fake_twilio, container, n)
    post_webhook(client, webhook_params(n))
    call = get_call(recording_sid(n))
    csrf = login(client, "alice")
    r = client.post(
        f"/calls/{call.id}/approve",
        data={"text": text or call.latest_report.text, "csrf": csrf},
        follow_redirects=False,
    )
    assert r.status_code == 303, r.text
    return get_call(recording_sid(n))


def test_disabled_connector_means_manual_copy(client, container, fake_twilio):
    call = process_and_approve(client, container, fake_twilio, 1)
    assert call.status == CallStatus.APPROVED
    assert call.crm_writes == []
    page = client.get(f"/calls/{call.id}")
    assert "Copier le texte" in page.text and "Aucune intégration autorisée" in page.text


def test_write_confirmed_only_after_verification(client, container, fake_twilio, sim_crm):
    call = process_and_approve(client, container, fake_twilio, 2)
    assert call.status == CallStatus.CRM_CONFIRMED
    w = call.crm_writes[0]
    assert w.status == CrmWriteStatus.CONFIRMED and w.verified_at is not None and w.external_ref == "PC-1"
    assert len(sim_crm.phone_calls) == 1


def test_dropped_write_never_reported_as_success(client, container, fake_twilio, sim_crm):
    sim_crm.drop_next_writes = 100  # CRM answers OK but never stores anything
    call = process_and_approve(client, container, fake_twilio, 3)
    assert call.status == CallStatus.APPROVED  # back to manual copy
    assert call.crm_writes[0].status != CrmWriteStatus.CONFIRMED
    assert "copie manuelle" in call.status_detail


def test_write_failure_then_success(client, container, fake_twilio, sim_crm):
    sim_crm.fail_next_writes = 2
    call = process_and_approve(client, container, fake_twilio, 4)
    assert call.status == CallStatus.CRM_CONFIRMED
    assert call.crm_writes[0].attempts == 3
    assert [e.stage for e in call.errors] == ["crm", "crm"]


def test_timeout_after_write_does_not_duplicate(client, container, fake_twilio, sim_crm):
    sim_crm.timeout_after_write_next = 1
    call = process_and_approve(client, container, fake_twilio, 5)
    assert call.status == CallStatus.CRM_CONFIRMED
    assert len(sim_crm.phone_calls) == 1
    assert sim_crm.write_calls == 1  # second attempt verified instead of writing again


def test_repeated_push_is_idempotent(client, container, fake_twilio, sim_crm):
    call = process_and_approve(client, container, fake_twilio, 6)
    push_to_crm(call.id, container)  # e.g. duplicated job
    push_to_crm(call.id, container)
    assert len(sim_crm.phone_calls) == 1


def test_crm_outage_falls_back_to_manual(client, container, fake_twilio, sim_crm):
    sim_crm.available = False
    call = process_and_approve(client, container, fake_twilio, 7)
    assert call.status == CallStatus.APPROVED
    assert sim_crm.write_calls == 0


def test_edited_text_is_what_gets_written(client, container, fake_twilio, sim_crm):
    call = process_and_approve(client, container, fake_twilio, 8, text="Texte corrigé par le conseiller, déménagement.")
    assert list(sim_crm.phone_calls.values())[0]["text"] == "Texte corrigé par le conseiller, déménagement."
    review = call.reports[0].reviews[0]
    assert review.edited and review.edit_ratio > 0.5


def test_simulated_connector_refused_in_production(env, monkeypatch):
    monkeypatch.setenv("PCA_ENVIRONMENT", "production")
    monkeypatch.setenv("PCA_CRM_CONNECTOR", "simulated")
    with pytest.raises(RuntimeError):
        build_crm_connector(Settings())


def test_unknown_connector_refused(env, monkeypatch):
    monkeypatch.setenv("PCA_CRM_CONNECTOR", "internal-crm")
    with pytest.raises(ValueError, match="official"):
        build_crm_connector(Settings())


def test_auto_push_of_ready_reports_only_when_enabled(client, container, fake_twilio, sim_crm):
    container.business.validated = True
    container.business.quality.always_human_review = False
    add_recording(fake_twilio, container, 9)
    post_webhook(client, webhook_params(9))
    assert get_call(recording_sid(9)).status == CallStatus.READY
    assert sim_crm.write_calls == 0  # default: never pushed without a human

    container.settings.crm_auto_push_ready = True
    add_recording(fake_twilio, container, 10)
    post_webhook(client, webhook_params(10))
    assert get_call(recording_sid(10)).status == CallStatus.CRM_CONFIRMED
