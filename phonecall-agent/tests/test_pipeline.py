import json
from pathlib import Path

from conftest import add_recording, get_call, post_webhook, recording_sid, webhook_params
from phonecall_agent.db import session_scope
from phonecall_agent.models import Call, CallStatus, ReportStatus
from phonecall_agent.pipeline import process_call
from phonecall_agent.transcription.base import TranscriptResult


def test_end_to_end_happy_path(client, container, fake_twilio):
    add_recording(fake_twilio, container, 1)
    post_webhook(client, webhook_params(1))
    call = get_call(recording_sid(1))
    assert call.status == CallStatus.NEEDS_REVIEW  # business config not validated → human review
    report = call.latest_report
    assert report.status == ReportStatus.NEEDS_REVIEW
    assert report.category == "demenagement"
    assert report.quality_score == 100
    assert "formulaire" in report.text
    structured = json.loads(report.structured_json)
    assert structured["actions_done"][0]["evidence"] == ["S9"]
    assert call.processing_ms is not None and call.processing_ms >= 0


def test_temporary_audio_deleted_after_transcription(client, container, fake_twilio):
    add_recording(fake_twilio, container, 2)
    post_webhook(client, webhook_params(2))
    call = get_call(recording_sid(2))
    assert call.audio.storage_path is None and call.audio.deleted_at is not None
    assert list(Path(container.settings.audio_temp_dir).glob("*.enc")) == []


def test_retry_does_not_download_twice(client, container, fake_twilio):
    add_recording(fake_twilio, container, 3)
    container.transcriber.fail_next = 2
    post_webhook(client, webhook_params(3))
    call = get_call(recording_sid(3))
    assert call.status == CallStatus.NEEDS_REVIEW
    assert fake_twilio.media_requests == 1
    assert [e.stage for e in call.errors] == ["transcribe", "transcribe"]


def test_incomplete_transcript_flags_uncertainty(client, container, fake_twilio):
    add_recording(fake_twilio, container, 4, transcript="incomplet", ai="incomplet")
    post_webhook(client, webhook_params(4))
    call = get_call(recording_sid(4))
    assert call.transcript.uncertain_segments == 3
    codes = {f["code"] for f in call.latest_report.quality_flags}
    assert {"transcript_low_quality", "points_to_verify"} <= codes
    assert call.status == CallStatus.NEEDS_REVIEW


def test_call_without_usable_content(client, container, fake_twilio):
    add_recording(fake_twilio, container, 5, transcript="sans_contenu", ai="sans_contenu")
    post_webhook(client, webhook_params(5))
    call = get_call(recording_sid(5))
    assert call.status == CallStatus.NO_CONTENT
    assert call.reports == []
    assert container.generator.calls == 0  # no AI cost for an empty call


def test_invalid_ai_json_is_retried(client, container, fake_twilio):
    add_recording(fake_twilio, container, 6, ai=["invalid_json", "demenagement"])
    post_webhook(client, webhook_params(6))
    call = get_call(recording_sid(6))
    assert call.status == CallStatus.NEEDS_REVIEW
    assert container.generator.calls == 2


def test_invalid_ai_schema_always_fails_cleanly(client, container, fake_twilio):
    add_recording(fake_twilio, container, 7, ai="invalid_schema")
    post_webhook(client, webhook_params(7))
    call = get_call(recording_sid(7))
    assert call.status == CallStatus.FAILED
    assert call.reports == []
    assert {e.error_code for e in call.errors} == {"ai_schema"}
    assert len(call.errors) == container.settings.job_max_attempts


def test_generation_outage_retried(client, container, fake_twilio):
    add_recording(fake_twilio, container, 8)
    container.generator.fail_next = 1
    post_webhook(client, webhook_params(8))
    call = get_call(recording_sid(8))
    assert call.status == CallStatus.NEEDS_REVIEW
    assert [e.error_code for e in call.errors] == ["generation_failed"]


def test_hallucinated_report_is_blocked(client, container, fake_twilio):
    add_recording(fake_twilio, container, 9, ai="demenagement_hallucination")
    post_webhook(client, webhook_params(9))
    report = get_call(recording_sid(9)).latest_report
    codes = {f["code"] for f in report.quality_flags if f["severity"] == "blocking"}
    assert {"possible_action_as_done", "unsupported_number", "done_and_todo"} <= codes
    assert report.quality_score < 50
    assert report.status == ReportStatus.NEEDS_REVIEW


def test_concurrent_processing_prevented(client, container, fake_twilio):
    from datetime import timedelta

    from phonecall_agent.models import utcnow

    add_recording(fake_twilio, container, 10)
    post_webhook(client, webhook_params(10, status="absent"))  # create the call without processing
    with session_scope() as s:
        call = s.query(Call).filter_by(recording_sid=recording_sid(10)).one()
        call.status = CallStatus.RECEIVED
        call.lease_until = utcnow() + timedelta(minutes=5)  # another worker holds it
        call_id = call.id
    assert process_call(call_id, container) is None
    assert fake_twilio.media_requests == 0


def test_transcript_and_report_encrypted_at_rest(client, container, fake_twilio):
    add_recording(fake_twilio, container, 11)
    post_webhook(client, webhook_params(11))
    from sqlalchemy import text

    with session_scope() as s:
        raw_t = s.execute(text("SELECT segments_json FROM transcripts")).scalar()
        raw_r = s.execute(text("SELECT text FROM reports")).scalar()
    assert b"d\xc3\xa9m\xc3\xa9nage" not in bytes(raw_t) and b"formulaire" not in bytes(raw_r)
    call = get_call(recording_sid(11))
    assert "déménage" in TranscriptResult.from_json(call.transcript.segments_json).full_text()


def test_audio_encrypted_on_disk(container):
    path = container.audio_store.save("abc", "mp3", b"ID3 secret audio")
    assert b"secret audio" not in path.read_bytes()
    assert container.audio_store.load(path) == b"ID3 secret audio"
    assert container.audio_store.delete(path) and not path.exists()


def test_stuck_call_is_requeued(client, container, fake_twilio):
    from datetime import timedelta

    from phonecall_agent.models import utcnow
    from phonecall_agent.pipeline import requeue_stale

    add_recording(fake_twilio, container, 12)
    post_webhook(client, webhook_params(12, status="absent"))
    with session_scope() as s:
        call = s.query(Call).filter_by(recording_sid=recording_sid(12)).one()
        call.status = CallStatus.DOWNLOADING  # worker died mid-download
    with session_scope() as s:
        s.query(Call).filter_by(recording_sid=recording_sid(12)).update({"updated_at": utcnow() - timedelta(hours=2)})
    assert requeue_stale(container) == 1
    assert get_call(recording_sid(12)).status == CallStatus.NEEDS_REVIEW
    assert requeue_stale(container) == 0
