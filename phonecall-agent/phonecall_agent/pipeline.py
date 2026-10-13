"""Processing state machine for one call.

RECEIVED → DOWNLOADED → TRANSCRIBED → (NEEDS_REVIEW | READY) → APPROVED → (CRM_CONFIRMED | COPIED_MANUALLY)
                  ↘ NO_CONTENT / RECORDING_ABSENT / FAILED

Each stage is idempotent and committed separately, so a retry resumes where it stopped
(an audio already downloaded is never downloaded twice).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import or_, update

from .container import Container
from .db import session_scope
from .errors import InvalidAIResponse, PermanentError, PipelineError, RecordingUnavailable
from .generation import GenerationContext, prompt_version
from .logging_setup import safe_error_message
from .models import (
    TERMINAL_STATUSES,
    AudioObject,
    Call,
    CallStatus,
    ProcessingError,
    Report,
    ReportStatus,
    Transcript,
    utcnow,
)
from .quality import ReportValidator
from .transcription.base import TranscriptResult

log = logging.getLogger(__name__)

LEASE = timedelta(minutes=20)
ACTIVE_STATUSES = {CallStatus.RECEIVED, CallStatus.DOWNLOADING, CallStatus.DOWNLOADED, CallStatus.TRANSCRIBED}


class RetryLater(Exception):
    """Raised to the queue so that the job is retried with back-off."""

    def __init__(self, cause: PipelineError):
        super().__init__(f"{cause.code}: retry later")
        self.cause = cause


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:  # SQLite returns naive datetimes
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _claim(call_id: str) -> bool:
    now = utcnow()
    with session_scope() as s:
        res = s.execute(
            update(Call)
            .where(Call.id == call_id, or_(Call.lease_until.is_(None), Call.lease_until < now))
            .values(lease_until=now + LEASE)
        )
        return res.rowcount == 1


def _release(call_id: str) -> None:
    with session_scope() as s:
        s.execute(update(Call).where(Call.id == call_id).values(lease_until=None))


def process_call(call_id: str, c: Container) -> CallStatus | None:
    if not _claim(call_id):
        log.info("call already being processed", extra={"call_id": call_id})
        return None
    try:
        status = _process(call_id, c)
    finally:
        _release(call_id)
    if status == CallStatus.READY and c.settings.crm_auto_push_ready and c.settings.crm_connector != "disabled":
        c.queue.enqueue_crm_push(call_id)  # only when explicitly enabled after the pilot
    return status


def _process(call_id: str, c: Container) -> CallStatus | None:
    with session_scope() as s:
        call = s.get(Call, call_id)
        if call is None:
            return None
        if call.status not in ACTIVE_STATUSES:
            return call.status
        call.attempts += 1
        attempt = call.attempts
        s.commit()

        stage = "download"
        if call.status == CallStatus.DOWNLOADED and not _audio_present(call):
            call.status = CallStatus.RECEIVED  # temporary audio purged before transcription: fetch again
        try:
            if call.status in (CallStatus.RECEIVED, CallStatus.DOWNLOADING):
                _stage_download(s, call, c)
                s.commit()
            if call.status == CallStatus.DOWNLOADED:
                stage = "transcribe"
                _stage_transcribe(s, call, c)
                s.commit()
            if call.status == CallStatus.TRANSCRIBED:
                stage = "generate"
                _stage_generate(s, call, c)
                s.commit()
        except PipelineError as exc:
            s.rollback()
            call = s.get(Call, call_id)
            s.add(
                ProcessingError(
                    call_id=call.id, stage=stage, attempt=attempt, error_code=exc.code,
                    message=safe_error_message(exc), retryable=exc.retryable,
                )
            )
            log.warning("stage failed", extra={"call_id": call.id, "stage": stage, "attempt": attempt})
            if exc.retryable and attempt < c.settings.job_max_attempts:
                call.status_detail = f"Nouvelle tentative prévue ({exc.code})"
                s.commit()
                raise RetryLater(exc) from exc
            call.status = CallStatus.RECORDING_ABSENT if isinstance(exc, RecordingUnavailable) else CallStatus.FAILED
            call.status_detail = f"Échec définitif à l'étape {stage} ({exc.code})"
            _cleanup_audio(call, c)
            s.commit()
            return call.status
        except Exception as exc:  # unexpected bug: keep it visible, never loop forever
            s.rollback()
            call = s.get(Call, call_id)
            s.add(
                ProcessingError(
                    call_id=call.id, stage=stage, attempt=attempt, error_code="unexpected",
                    message=safe_error_message(exc), retryable=attempt < c.settings.job_max_attempts,
                )
            )
            log.exception("unexpected error", extra={"call_id": call.id, "stage": stage})
            if attempt < c.settings.job_max_attempts:
                s.commit()
                raise RetryLater(PipelineError(str(exc), code="unexpected")) from exc
            call.status = CallStatus.FAILED
            call.status_detail = f"Erreur inattendue à l'étape {stage}"
            _cleanup_audio(call, c)
            s.commit()
            return call.status
        return call.status


def _audio_present(call: Call) -> bool:
    return bool(call.audio and call.audio.storage_path and Path(call.audio.storage_path).exists())


def _stage_download(s, call: Call, c: Container) -> None:
    if _audio_present(call):
        call.status = CallStatus.DOWNLOADED  # already downloaded: never fetch twice
        return
    call.status = CallStatus.DOWNLOADING
    client = c.recording_client_factory()
    try:
        meta = client.ensure_completed(call.account_sid, call.recording_sid)
        if meta.duration is not None:
            call.recording_duration = meta.duration
        if meta.channels is not None:
            call.recording_channels = meta.channels
        if call.recording_duration is not None and call.recording_duration < c.settings.audio_min_duration_seconds:
            call.status = CallStatus.NO_CONTENT
            call.status_detail = "Enregistrement trop court"
            call.completed_at = utcnow()
            return
        audio = client.download(call.account_sid, call.recording_sid)
    finally:
        client.close()
    path = c.audio_store.save(call.id, audio.extension, audio.data)
    if call.audio:
        call.audio.storage_path, call.audio.sha256, call.audio.size_bytes = str(path), audio.sha256, audio.size
        call.audio.content_type, call.audio.deleted_at = audio.content_type, None
    else:
        call.audio = AudioObject(
            storage_path=str(path), sha256=audio.sha256, size_bytes=audio.size, content_type=audio.content_type
        )
    call.status = CallStatus.DOWNLOADED
    call.status_detail = None


def _stage_transcribe(s, call: Call, c: Container) -> None:
    data = c.audio_store.load(call.audio.storage_path)
    ext = call.audio.storage_path.split(".")[-2]
    result = c.transcriber.transcribe(data, ext, {"recording_sid": call.recording_sid, "channels": call.recording_channels})
    call.transcript = Transcript(
        provider=result.provider,
        language=result.language,
        segments_json=result.to_json(),
        word_count=result.word_count,
        uncertain_segments=result.uncertain_count,
        speaker_labels=result.speaker_labels,
        cost_usd=result.cost_usd,
    )
    call.cost_usd = (call.cost_usd or 0) + result.cost_usd
    if c.business.retention.delete_audio_after_transcription:
        _cleanup_audio(call, c)
    _delete_remote_recording(call, c)
    if result.word_count < c.business.quality.min_transcript_words:
        call.status = CallStatus.NO_CONTENT
        call.status_detail = "Aucun échange exploitable dans la transcription"
        call.completed_at = utcnow()
        call.processing_ms = _elapsed_ms(call)
        return
    call.status = CallStatus.TRANSCRIBED


def _stage_generate(s, call: Call, c: Container) -> None:
    transcript = TranscriptResult.from_json(call.transcript.segments_json)
    ctx = GenerationContext(
        business=c.business,
        metadata={
            "_recording_sid": call.recording_sid,
            "durée de l'enregistrement (s)": call.recording_duration or "inconnue",
        },
    )
    last: InvalidAIResponse | None = None
    for _ in range(max(1, c.settings.ai_max_attempts)):
        try:
            gen = c.generator.generate(transcript, ctx)
            break
        except InvalidAIResponse as exc:
            last = exc
    else:
        assert last is not None
        raise last

    quality = ReportValidator(c.business).validate(gen.structured, gen.text, transcript)
    status = ReportStatus.NEEDS_REVIEW if quality.needs_review else ReportStatus.READY
    for old in call.reports:
        if old.status in (ReportStatus.NEEDS_REVIEW, ReportStatus.READY):
            old.status = ReportStatus.SUPERSEDED
    report = Report(
        version=len(call.reports) + 1,
        generator=gen.generator,
        model=gen.model,
        prompt_version=prompt_version(c.business),
        business_config_version=c.business.version,
        text=gen.text,
        structured_json=gen.structured.model_dump_json(),
        category=gen.structured.category,
        quality_score=quality.score,
        quality_flags=quality.flags_as_dicts(),
        status=status,
        input_tokens=gen.input_tokens,
        output_tokens=gen.output_tokens,
        cost_usd=gen.cost_usd,
    )
    call.reports.append(report)
    call.category = gen.structured.category
    call.cost_usd = (call.cost_usd or 0) + gen.cost_usd
    call.status = CallStatus.NEEDS_REVIEW if quality.needs_review else CallStatus.READY
    call.status_detail = None
    call.completed_at = utcnow()
    call.processing_ms = _elapsed_ms(call)


def regenerate(call_id: str, c: Container) -> CallStatus:
    """Supervisor action: generate a new version of the report from the stored transcript."""
    with session_scope() as s:
        call = s.get(Call, call_id)
        if call is None or call.transcript is None or call.transcript.segments_json is None:
            raise PermanentError("no transcript available", code="no_transcript")
        if call.status in TERMINAL_STATUSES and call.status != CallStatus.REJECTED:
            raise PermanentError("call already closed", code="closed")
        _stage_generate(s, call, c)
        return call.status


def _elapsed_ms(call: Call) -> int:
    return int((utcnow() - _aware(call.received_at)).total_seconds() * 1000)


def _cleanup_audio(call: Call, c: Container) -> None:
    if call.audio and call.audio.storage_path:
        c.audio_store.delete(call.audio.storage_path)
        call.audio.storage_path = None
        call.audio.deleted_at = utcnow()


def _delete_remote_recording(call: Call, c: Container) -> None:
    """Delete the recording at Twilio once the transcript is stored (only if the retention policy says so)."""
    if c.settings.twilio_delete_recording_after_processing:
        client = c.recording_client_factory()
        try:
            client.delete_recording(call.account_sid, call.recording_sid)
        except PipelineError:
            log.warning("could not delete Twilio recording", extra={"call_id": call.id})
        finally:
            client.close()


def requeue_stale(c: Container, older_than: timedelta = timedelta(minutes=45)) -> int:
    """Re-enqueue calls stuck in an active status (worker crash, lost job). Safe thanks to the lease."""
    from sqlalchemy import select

    limit = utcnow() - older_than
    with session_scope() as s:
        ids = [
            call.id
            for call in s.scalars(select(Call).where(Call.status.in_(ACTIVE_STATUSES)))
            if _aware(call.updated_at) < limit and (call.lease_until is None or _aware(call.lease_until) < utcnow())
            and call.attempts < c.settings.job_max_attempts
        ]
    for call_id in ids:
        c.queue.enqueue_process(call_id)
    return len(ids)


def report_structured(report: Report) -> dict:
    return json.loads(report.structured_json) if report.structured_json else {}
