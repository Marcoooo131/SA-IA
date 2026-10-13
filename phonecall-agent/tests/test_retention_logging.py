import logging
from datetime import timedelta

import pytest

from conftest import add_recording, get_call, post_webhook, recording_sid, webhook_params
from phonecall_agent.config import Settings
from phonecall_agent.db import session_scope
from phonecall_agent.logging_setup import RedactingFilter, redact, safe_error_message
from phonecall_agent.models import AudioObject, AuditLog, Call, Report, Transcript, utcnow
from phonecall_agent.retention import delete_call_data, purge_expired


def age_everything(days: int):
    with session_scope() as s:
        past = utcnow() - timedelta(days=days)
        for model, col in ((AudioObject, "downloaded_at"), (Transcript, "created_at"), (Report, "created_at")):
            for row in s.query(model):
                setattr(row, col, past)


def test_purge_respects_retention(client, container, fake_twilio):
    container.business.retention.delete_audio_after_transcription = False
    add_recording(fake_twilio, container, 1)
    post_webhook(client, webhook_params(1))
    assert get_call(recording_sid(1)).audio.storage_path is not None

    assert purge_expired(container) == {"audio": 0, "transcripts": 0, "reports": 0}
    age_everything(days=40)
    counts = purge_expired(container)
    assert counts == {"audio": 1, "transcripts": 1, "reports": 0}
    call = get_call(recording_sid(1))
    assert call.audio.storage_path is None
    assert call.transcript.segments_json is None and call.transcript.purged_at
    assert call.latest_report.text  # report kept (365 days)
    with session_scope() as s:
        assert s.query(AuditLog).filter_by(action="retention_purge").count() == 1


def test_delete_call_data(client, container, fake_twilio):
    add_recording(fake_twilio, container, 2)
    post_webhook(client, webhook_params(2))
    call = get_call(recording_sid(2))
    assert delete_call_data(call.id, container, actor="dpo")
    with session_scope() as s:
        assert s.get(Call, call.id) is None
        assert s.query(Transcript).count() == 0 and s.query(Report).count() == 0
        log = s.query(AuditLog).filter_by(action="delete_call_data").one()
        assert log.actor == "dpo"


def test_twilio_recording_deleted_when_configured(client, container, fake_twilio):
    container.settings.twilio_delete_recording_after_processing = True
    add_recording(fake_twilio, container, 3, transcript="sans_contenu")
    post_webhook(client, webhook_params(3))
    assert fake_twilio.deleted == [recording_sid(3)]


@pytest.mark.parametrize(
    "raw,leak",
    [
        ("GET https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1.mp3", "api.twilio.com"),
        ("url https://user:pass@host.example/x", "user:pass"),
        ("Authorization: Basic QUMxOnRva2Vu", "QUMxOnRva2Vu"),
        ("key sk-ant-api03-abcdef", "sk-ant-api03"),
        ("caller +33612345678", "+33612345678"),
        ("mail jean.dupont@example.com", "jean.dupont"),
    ],
)
def test_redaction(raw, leak):
    assert leak not in redact(raw)


def test_log_filter_redacts_records(caplog):
    logger = logging.getLogger("test.redaction")
    logger.addFilter(RedactingFilter())
    with caplog.at_level(logging.INFO, logger="test.redaction"):
        logger.info("fetching %s", "https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1.mp3")
    assert "api.twilio.com" not in caplog.text


def test_stored_error_messages_are_sanitised():
    exc = RuntimeError("failed GET https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1.mp3 " + "x" * 500)
    msg = safe_error_message(exc)
    assert "twilio.com" not in msg and len(msg) <= 300


@pytest.mark.parametrize(
    "overrides,expected",
    [
        ({"PCA_CRM_CONNECTOR": "simulated"}, "crm_connector"),
        ({"PCA_TRANSCRIPTION_PROVIDER": "simulated"}, "simulated providers"),
        ({"PCA_DATA_ENCRYPTION_KEY": ""}, "data_encryption_key"),
        ({"PCA_QUEUE_BACKEND": "inline"}, "queue_backend"),
    ],
)
def test_unsafe_production_config_refused(env, monkeypatch, overrides, expected):
    monkeypatch.setenv("PCA_ENVIRONMENT", "production")
    monkeypatch.setenv("PCA_QUEUE_BACKEND", "rq")
    monkeypatch.setenv("PCA_TRANSCRIPTION_PROVIDER", "faster_whisper")
    monkeypatch.setenv("PCA_GENERATION_PROVIDER", "anthropic")
    for k, v in overrides.items():
        monkeypatch.setenv(k, v)
    with pytest.raises(RuntimeError, match=expected):
        Settings().assert_safe_for_environment()
