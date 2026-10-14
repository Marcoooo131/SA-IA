"""Web UI: authentication, roles, CSRF, every page renders, main user flows."""

from __future__ import annotations

import re
from datetime import timedelta

import pytest
from conftest import PASSWORD, PARIS_NOW, jobs_of, make_appt
from fastapi.testclient import TestClient

from sms_reminders.db import session_scope
from sms_reminders.models import Appointment, BlockedNumber, Event, JobStatus, ServiceConfig, Step, TemplateSlot


@pytest.fixture
def app(container):
    from sms_reminders.web.app import create_app

    return create_app(container)


def client_for(app, login: str | None):
    cl = TestClient(app)
    if login:
        page = cl.get("/login")
        r = cl.post("/login", data={"login": login, "password": PASSWORD, "csrf": csrf_of(page.text)}, follow_redirects=False)
        assert r.status_code == 303
    return cl


def csrf_of(html: str) -> str:
    return re.search(r'name="csrf" value="([^"]+)"', html).group(1)


def post(cl, url, data=None, page="/"):
    token = csrf_of(cl.get(page).text)
    return cl.post(url, data={"csrf": token, **(data or {})}, follow_redirects=False)


def test_login_required_and_failed_login(app):
    cl = TestClient(app)
    assert cl.get("/appointments", follow_redirects=False).headers["location"] == "/login"
    page = cl.get("/login")
    r = cl.post("/login", data={"login": "alice", "password": "wrong", "csrf": csrf_of(page.text)})
    assert "Identifiants invalides" in r.text
    assert cl.post("/login", data={"login": "alice", "password": PASSWORD, "csrf": "bad"}).status_code == 403


def test_security_headers(app):
    r = TestClient(app).get("/login")
    assert "default-src 'self'" in r.headers["content-security-policy"]
    assert r.headers["x-frame-options"] == "DENY" and r.headers["cache-control"] == "no-store"


def test_every_page_renders_for_admin(app, configured):
    appt = make_appt()
    make_appt(customer_ref="CLI-2", service=None)
    cl = client_for(app, "ada")
    with session_scope() as s:
        slot_id = s.query(TemplateSlot).first().id
    urls = ["/", "/?period=7", "/appointments", "/appointments?view=movers", "/appointments?view=takeovers",
            "/appointments?view=confirmed", "/appointments?view=to_confirm", "/appointments?flag=no_service",
            "/appointments?flag=cancelled", "/appointments?flag=past", "/appointments?flag=sms_error",
            "/appointments?q=dupont", "/appointments?q=0600000001", "/appointments?date_from=2026-10-01&date_to=2026-10-31",
            f"/appointments/{appt}", "/appointments/new", "/sms", "/sms?status=error", "/import", "/settings",
            f"/settings/templates/{slot_id}", f"/settings/templates/{slot_id}?appointment={appt}", "/optouts", "/audit",
            "/import/exemple.csv", "/readyz"]
    for url in urls:
        r = cl.get(url)
        assert r.status_code == 200, url
    page = cl.get("/appointments").text
    assert "Dupont" in page and "Programmé" in page
    assert "Service manquant" in cl.get("/appointments?flag=no_service").text


def test_simulation_banner(env, clock):
    from sms_reminders.container import build_container
    from sms_reminders.web.app import create_app

    app = create_app(build_container())
    cl = client_for(app, "alice")
    html = cl.get("/").text
    assert "MODE SIMULATION" in html and "Template non configuré" in html


def test_roles(app, configured):
    appt = make_appt()
    advisor = client_for(app, "alice")
    assert advisor.get("/import").status_code == 403
    assert advisor.get("/settings").status_code == 403
    assert advisor.get("/audit").status_code == 403
    assert post(advisor, f"/appointments/{appt}/cancel", {"reason": "x"}).status_code == 403
    sup = client_for(app, "sam")
    assert sup.get("/settings").status_code == 200
    assert post(sup, "/settings/services", {"sender_movers": "X"}).status_code == 403
    assert post(sup, f"/appointments/{appt}/delete", {"confirm_text": "SUPPRIMER"}).status_code == 403


def test_csrf_enforced_on_actions(app, configured):
    appt = make_appt()
    cl = client_for(app, "alice")
    assert cl.post(f"/appointments/{appt}/confirm", data={"confirmed": "on", "csrf": "nope"}).status_code == 403


def test_confirmation_checkbox_flow(app, configured):
    appt = make_appt()
    cl = client_for(app, "alice")
    r = post(cl, f"/appointments/{appt}/confirm", {"confirmed": "on", "next": "/appointments"}, page="/appointments")
    assert r.status_code == 303 and r.headers["location"] == "/appointments"
    with session_scope() as s:
        a = s.get(Appointment, appt)
        assert a.confirmation == "confirmed" and a.confirmed_by == "alice" and a.confirmation_source == "team"
    assert {j.status for j in jobs_of(appt).values()} == {JobStatus.CANCELLED}
    html = cl.get("/appointments?view=confirmed").text
    assert "Dupont" in html
    assert "Dupont" not in cl.get("/appointments?view=to_confirm").text
    detail = cl.get(f"/appointments/{appt}").text
    assert "pas une réponse du client" in detail
    # Unchecking: no automatic reactivation, explicit resume required.
    r = post(cl, f"/appointments/{appt}/confirm", {"next": "/appointments"}, page="/appointments")
    assert r.headers["location"].endswith("#reprise")
    assert {j.status for j in jobs_of(appt).values()} == {JobStatus.CANCELLED}
    detail = cl.get(f"/appointments/{appt}").text
    assert "Valider la reprise" in detail
    assert post(cl, f"/appointments/{appt}/resume", {}).status_code == 303
    assert {j.status for j in jobs_of(appt).values()} == {JobStatus.CANCELLED}  # checkbox not ticked
    post(cl, f"/appointments/{appt}/resume", {"acknowledge": "on"})
    assert {j.status for j in jobs_of(appt).values()} == {JobStatus.SCHEDULED}


def test_suspend_cancel_reactivate_and_erase(app, configured):
    appt = make_appt()
    sup = client_for(app, "sam")
    post(sup, f"/appointments/{appt}/suspend", {"reason": "litige"})
    assert {j.status for j in jobs_of(appt).values()} == {JobStatus.CANCELLED}
    post(sup, f"/appointments/{appt}/cancel", {"reason": "annulé par le client"})
    with session_scope() as s:
        assert s.get(Appointment, appt).status == "cancelled"
    post(sup, f"/appointments/{appt}/reactivate")
    with session_scope() as s:
        a = s.get(Appointment, appt)
        assert a.status == "active" and a.resume_pending
    admin = client_for(app, "ada")
    post(admin, f"/appointments/{appt}/delete", {"confirm_text": "non"})
    with session_scope() as s:
        assert s.get(Appointment, appt) is not None
    post(admin, f"/appointments/{appt}/delete", {"confirm_text": "SUPPRIMER", "reason": "demande d'effacement"})
    with session_scope() as s:
        assert s.get(Appointment, appt) is None
        assert s.query(Event).filter(Event.appointment_id == appt).count() == 0
        assert s.query(Event).filter_by(kind="appointment_deleted").count() == 1


def test_manual_reminder_via_ui(app, configured, provider):
    appt = make_appt()
    sup = client_for(app, "sam")
    page = sup.get(f"/appointments/{appt}").text
    nonce = re.search(r'name="nonce" value="([^"]+)"', page).group(1)
    post(sup, f"/appointments/{appt}/manual", {"template_step": Step.J1_FIRST, "nonce": nonce}, page=f"/appointments/{appt}")
    assert provider.calls == []  # verification box not ticked
    post(sup, f"/appointments/{appt}/manual", {"template_step": Step.J1_FIRST, "nonce": nonce, "acknowledge": "on"})
    post(sup, f"/appointments/{appt}/manual", {"template_step": Step.J1_FIRST, "nonce": nonce, "acknowledge": "on"})
    assert len(provider.calls) == 1  # same nonce: no second SMS


def test_edit_appointment_replans(app, configured):
    appt = make_appt()
    cl = client_for(app, "alice")
    post(cl, f"/appointments/{appt}/edit", {"customer_ref": "CLI-1", "first_name": "Marie", "last_name": "Dupont", "phone": "0600000001",
                                            "service": "takeovers", "appointment_date": "2026-10-18", "appointment_time": "10:00"})
    with session_scope() as s:
        a = s.get(Appointment, appt)
        assert a.service == "takeovers" and a.schedule_revision == 2
    assert jobs_of(appt)[Step.J2].revision == 2


def test_create_appointment_form(app, configured):
    sup = client_for(app, "sam")
    r = post(sup, "/appointments/new", {"customer_ref": "CLI-77", "first_name": "Léa", "last_name": "Blanc", "phone": "0600000007",
                                        "service": "movers", "appointment_date": "2026-10-20", "appointment_time": "11:00"})
    assert r.status_code == 303
    r = post(sup, "/appointments/new", {"customer_ref": "CLI-77", "first_name": "Léa", "last_name": "Blanc", "phone": "0600000007",
                                        "service": "movers", "appointment_date": "2026-10-20", "appointment_time": "11:00"})
    assert "existe déjà" in r.text


def test_import_flow_via_ui(app, configured):
    sup = client_for(app, "sam")
    token = csrf_of(sup.get("/import").text)
    csv = "Numéro client;Nom et prénom;Téléphone;Date;Heure;Service\nCLI-1;DUPONT Marie;0600000001;17/10/2026;14:00;Movers\n"
    r = sup.post("/import", data={"csrf": token}, files={"file": ("rdv.csv", csv.encode(), "text/csv")}, follow_redirects=False)
    assert r.status_code == 303
    review = sup.get(r.headers["location"]).text
    assert "1 nouveaux rendez-vous" in review
    batch_url = r.headers["location"]
    post(sup, batch_url + "/commit", page=batch_url)
    with session_scope() as s:
        assert s.query(Appointment).count() == 1
    bad = sup.post("/import", data={"csrf": token}, files={"file": ("x.pdf", b"x", "application/pdf")})
    assert "Format non pris en charge" in bad.text


def test_admin_settings_and_templates(app, container):
    admin = client_for(app, "ada")
    post(admin, "/settings/services", {"sender_movers": "+33600000900", "enabled_movers": "on", "enabled_takeovers": "on"}, page="/settings")
    with session_scope() as s:
        assert s.get(ServiceConfig, "movers").sender_id == "+33600000900"
        assert s.get(ServiceConfig, "takeovers").sender_id is None
        slot_id = s.query(TemplateSlot).filter_by(service="movers", step="j2").one().id
    r = post(admin, f"/settings/templates/{slot_id}", {"body": "Bonjour {{prenom}}, RDV le {{date_rendez_vous}}"}, page="/settings")
    page = admin.get(r.headers["location"]).text
    assert "Bonjour Marie, RDV le 24/12/2026" in page and "segment" in page
    vid = int(r.headers["location"].split("version=")[1])
    post(admin, f"/settings/templates/{slot_id}/activate/{vid}", {}, page="/settings")
    with session_scope() as s:
        assert s.get(TemplateSlot, slot_id).active_version_id is None  # acknowledgement missing
    post(admin, f"/settings/templates/{slot_id}/activate/{vid}", {"acknowledge": "on"}, page="/settings")
    with session_scope() as s:
        assert s.get(TemplateSlot, slot_id).active_version_id == vid
    r = post(admin, "/settings/policy", {"section": "policy", "sending_enabled": "on", "j2_hours_before": "12", "j1_hours_before": "24"}, page="/settings")
    assert "refusés" in admin.get("/settings").text
    post(admin, "/settings/policy", {"section": "compliance", "compliance_validated": "on", "compliance_note": "DPO 2026-10-01"}, page="/settings")
    from sms_reminders.policy import load_policy

    with session_scope() as s:
        p = load_policy(s)
        assert p.compliance_validated and p.j2_hours_before == 48


def test_optout_flow(app, configured):
    appt = make_appt()
    cl = client_for(app, "alice")
    post(cl, "/optouts", {"phone": "06 00 00 00 01", "reason": "STOP", "next": f"/appointments/{appt}"})
    with session_scope() as s:
        assert s.query(BlockedNumber).count() == 1
    assert "liste d'opposition" in cl.get(f"/appointments/{appt}").text


def test_webhook_unknown_for_simulation(app):
    assert TestClient(app).post("/webhooks/sms/simulation/status", data={}).status_code == 404


def test_delivery_webhook_twilio(env, clock, monkeypatch):
    from sms_reminders.config import get_settings
    from sms_reminders.container import Container
    from sms_reminders.models import SmsJob
    from sms_reminders.providers.twilio import TwilioProvider, twilio_signature
    from sms_reminders.web.app import create_app

    sid = "AC" + "a" * 32
    monkeypatch.setenv("SMR_TWILIO_ACCOUNT_SID", sid)
    monkeypatch.setenv("SMR_TWILIO_AUTH_TOKEN", "tok")
    get_settings.cache_clear()
    settings = get_settings()
    c = Container(settings=settings, provider=TwilioProvider(settings), clock=clock)
    app = create_app(c)
    appt = make_appt()
    with session_scope() as s:
        job = s.query(SmsJob).filter_by(appointment_id=appt, step="j2").one()
        job.provider_message_id = "SM1"
    params = {"AccountSid": sid, "MessageSid": "SM1", "MessageStatus": "undelivered", "ErrorCode": "30005"}
    url = "https://sms.example.test/webhooks/sms/twilio/status"
    cl = TestClient(app)
    assert cl.post("/webhooks/sms/twilio/status", data=params, headers={"X-Twilio-Signature": "bad"}).status_code == 403
    r = cl.post("/webhooks/sms/twilio/status", data=params, headers={"X-Twilio-Signature": twilio_signature("tok", url, params)})
    assert r.status_code == 204
    with session_scope() as s:
        job = s.query(SmsJob).filter_by(provider_message_id="SM1").one()
        assert job.delivery_status == "undelivered" and job.error_code == "30005"
