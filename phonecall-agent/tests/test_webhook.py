from sqlalchemy import func, select

from conftest import ACCOUNT_SID, add_recording, get_call, post_webhook, recording_sid, sign, webhook_params
from phonecall_agent.db import session_scope
from phonecall_agent.models import Call, CallStatus, WebhookEvent


def test_valid_signature_accepted_and_processed(client, container, fake_twilio):
    add_recording(fake_twilio, container, 1)
    r = post_webhook(client, webhook_params(1))
    assert r.status_code == 204
    call = get_call(recording_sid(1))
    assert call.status == CallStatus.NEEDS_REVIEW
    assert call.latest_report is not None


def test_invalid_signature_rejected(client, container, fake_twilio):
    add_recording(fake_twilio, container, 2)
    params = webhook_params(2)
    r = post_webhook(client, params, signature=sign(params, token="wrong-token"))
    assert r.status_code == 403
    assert get_call(recording_sid(2)) is None
    assert fake_twilio.media_requests == 0


def test_missing_signature_rejected(client):
    r = post_webhook(client, webhook_params(3), signature=None)
    assert r.status_code == 403


def test_tampered_parameters_rejected(client):
    params = webhook_params(4)
    sig = sign(params)
    params["RecordingSid"] = recording_sid(99)
    assert post_webhook(client, params, signature=sig).status_code == 403


def test_signature_uses_public_url_not_internal_host(client):
    params = webhook_params(5)
    # Signed for another host: must fail even though the payload is genuine.
    sig = sign(params, url="https://attacker.example/twilio/recording-status")
    assert post_webhook(client, params, signature=sig).status_code == 403


def test_unknown_account_rejected(client):
    params = webhook_params(6, AccountSid="AC" + "b" * 32)
    assert post_webhook(client, params).status_code == 403


def test_malformed_payload_rejected(client):
    params = webhook_params(7, RecordingSid="../../etc/passwd")
    assert post_webhook(client, params).status_code == 400
    params = webhook_params(8, RecordingStatus="weird")
    assert post_webhook(client, params).status_code == 400


def test_recording_url_is_ignored(client, container, fake_twilio):
    add_recording(fake_twilio, container, 9)
    params = webhook_params(9, RecordingUrl="https://evil.example/steal")
    assert post_webhook(client, params).status_code == 204
    # Only the Twilio API (mock) was called, through the SID-based path.
    assert fake_twilio.media_requests == 1


def test_in_progress_event_ignored(client, fake_twilio):
    assert post_webhook(client, webhook_params(10, status="in-progress")).status_code == 204
    assert get_call(recording_sid(10)) is None


def test_absent_recording_marked(client, fake_twilio):
    assert post_webhook(client, webhook_params(11, status="absent")).status_code == 204
    call = get_call(recording_sid(11))
    assert call.status == CallStatus.RECORDING_ABSENT
    assert fake_twilio.media_requests == 0


def test_duplicate_events_processed_once(client, container, fake_twilio):
    add_recording(fake_twilio, container, 12)
    params = webhook_params(12)
    for _ in range(3):
        assert post_webhook(client, params).status_code == 204
    with session_scope() as s:
        assert s.scalar(select(func.count()).select_from(Call).where(Call.recording_sid == recording_sid(12))) == 1
        ev = s.scalar(select(WebhookEvent).where(WebhookEvent.recording_sid == recording_sid(12)))
        assert ev.duplicates == 2
    assert fake_twilio.media_requests == 1
    assert container.generator.calls == 1


def test_signature_disabled_only_when_configured(env, monkeypatch):
    from phonecall_agent.config import Settings

    monkeypatch.setenv("PCA_ENVIRONMENT", "production")
    monkeypatch.setenv("PCA_TWILIO_VALIDATE_SIGNATURE", "false")
    import pytest

    with pytest.raises(RuntimeError, match="twilio_validate_signature"):
        Settings().assert_safe_for_environment()


def test_account_allow_list(env):
    from phonecall_agent.config import Settings

    assert Settings().allowed_account_sids == {ACCOUNT_SID}
