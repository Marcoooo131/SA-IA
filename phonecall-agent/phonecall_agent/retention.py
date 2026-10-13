"""Retention policy and data deletion. Durations come from the business config and must be
validated by the DPO before production."""

from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import select

from .audit import audit
from .container import Container
from .db import session_scope
from .models import AudioObject, Call, Report, Transcript, utcnow
from .pipeline import _aware

log = logging.getLogger(__name__)


def purge_expired(c: Container, actor: str = "system:retention") -> dict:
    r = c.business.retention
    now = utcnow()
    counts = {"audio": 0, "transcripts": 0, "reports": 0}
    with session_scope() as s:
        for audio in s.scalars(select(AudioObject).where(AudioObject.storage_path.is_not(None))):
            if _aware(audio.downloaded_at) < now - timedelta(hours=r.audio_hours):
                c.audio_store.delete(audio.storage_path)
                audio.storage_path, audio.deleted_at = None, now
                counts["audio"] += 1
        for t in s.scalars(select(Transcript).where(Transcript.purged_at.is_(None))):
            if _aware(t.created_at) < now - timedelta(days=r.transcript_days):
                t.segments_json, t.purged_at = None, now
                counts["transcripts"] += 1
        for rep in s.scalars(select(Report).where(Report.purged_at.is_(None))):
            if _aware(rep.created_at) < now - timedelta(days=r.report_days):
                rep.text, rep.structured_json, rep.purged_at = "", "{}", now
                counts["reports"] += 1
        if any(counts.values()):
            audit(s, actor, "retention_purge", None, **counts)
    log.info("retention purge done %s", counts)
    return counts


def delete_call_data(call_id: str, c: Container, actor: str) -> bool:
    """Erase everything stored for a call (e.g. data subject request). Keeps an audit trace only."""
    with session_scope() as s:
        call = s.get(Call, call_id)
        if call is None:
            return False
        if call.audio and call.audio.storage_path:
            c.audio_store.delete(call.audio.storage_path)
        recording_sid = call.recording_sid
        s.delete(call)
        audit(s, actor, "delete_call_data", call_id, recording_sid=recording_sid)
    return True
