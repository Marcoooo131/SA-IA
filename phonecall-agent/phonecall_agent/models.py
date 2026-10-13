"""Database entities.

Data minimisation: no caller phone number, no customer name and no recording URL are
stored. Transcripts and generated reports are encrypted at rest (``EncryptedText``).
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .crypto import EncryptedText
from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


class CallStatus(str, enum.Enum):
    RECEIVED = "received"  # webhook accepted, job queued
    DOWNLOADING = "downloading"
    DOWNLOADED = "downloaded"
    TRANSCRIBED = "transcribed"
    NEEDS_REVIEW = "needs_review"  # report generated, human validation required
    READY = "ready"  # report generated and passed every automatic check
    APPROVED = "approved"  # validated by a human
    CRM_PENDING = "crm_pending"
    CRM_CONFIRMED = "crm_confirmed"  # write verified by reading it back from the CRM
    COPIED_MANUALLY = "copied_manually"  # advisor copied the text into the CRM themself
    REJECTED = "rejected"
    NO_CONTENT = "no_content"  # nothing usable in the call (silence, voicemail, too short)
    RECORDING_ABSENT = "recording_absent"  # Twilio reported absent/failed
    FAILED = "failed"  # permanent failure after retries


TERMINAL_STATUSES = {
    CallStatus.CRM_CONFIRMED,
    CallStatus.COPIED_MANUALLY,
    CallStatus.REJECTED,
    CallStatus.NO_CONTENT,
    CallStatus.RECORDING_ABSENT,
    CallStatus.FAILED,
}


class Call(Base):
    __tablename__ = "calls"
    __table_args__ = (UniqueConstraint("recording_sid", name="uq_calls_recording_sid"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    account_sid: Mapped[str] = mapped_column(String(64))
    call_sid: Mapped[str] = mapped_column(String(64), index=True)
    recording_sid: Mapped[str] = mapped_column(String(64))  # stable idempotency key
    recording_duration: Mapped[int | None] = mapped_column(Integer)
    recording_channels: Mapped[int | None] = mapped_column(Integer)
    recording_source: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[CallStatus] = mapped_column(Enum(CallStatus, native_enum=False, length=32), index=True)
    status_detail: Mapped[str | None] = mapped_column(String(500))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    category: Mapped[str | None] = mapped_column(String(64))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    processing_ms: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    data_purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Processing lease: prevents two workers from processing the same call concurrently.
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    audio: Mapped[AudioObject | None] = relationship(back_populates="call", uselist=False, cascade="all, delete-orphan")
    transcript: Mapped[Transcript | None] = relationship(
        back_populates="call", uselist=False, cascade="all, delete-orphan"
    )
    reports: Mapped[list[Report]] = relationship(
        back_populates="call", cascade="all, delete-orphan", order_by="Report.version"
    )
    errors: Mapped[list[ProcessingError]] = relationship(back_populates="call", cascade="all, delete-orphan")
    crm_writes: Mapped[list[CrmWrite]] = relationship(back_populates="call", cascade="all, delete-orphan")

    @property
    def latest_report(self) -> Report | None:
        return self.reports[-1] if self.reports else None


class WebhookEvent(Base):
    """Every Twilio callback received (redacted), used for idempotency and duplicate metrics."""

    __tablename__ = "webhook_events"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_webhook_idem"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    idempotency_key: Mapped[str] = mapped_column(String(200))
    recording_sid: Mapped[str] = mapped_column(String(64), index=True)
    recording_status: Mapped[str] = mapped_column(String(32))
    duplicates: Mapped[int] = mapped_column(Integer, default=0)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AudioObject(Base):
    __tablename__ = "audio_objects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id", ondelete="CASCADE"), unique=True)
    storage_path: Mapped[str | None] = mapped_column(String(500))
    sha256: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(Integer)
    content_type: Mapped[str] = mapped_column(String(64))
    downloaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    call: Mapped[Call] = relationship(back_populates="audio")


class Transcript(Base):
    __tablename__ = "transcripts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id", ondelete="CASCADE"), unique=True)
    provider: Mapped[str] = mapped_column(String(64))
    language: Mapped[str] = mapped_column(String(8))
    segments_json: Mapped[str | None] = mapped_column(EncryptedText)  # encrypted
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    uncertain_segments: Mapped[int] = mapped_column(Integer, default=0)
    speaker_labels: Mapped[bool] = mapped_column(default=False)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    call: Mapped[Call] = relationship(back_populates="transcript")


class ReportStatus(str, enum.Enum):
    NEEDS_REVIEW = "needs_review"
    READY = "ready"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (UniqueConstraint("call_id", "version", name="uq_report_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    generator: Mapped[str] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(64))
    prompt_version: Mapped[str] = mapped_column(String(32))
    business_config_version: Mapped[str] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(EncryptedText)  # encrypted
    structured_json: Mapped[str] = mapped_column(EncryptedText)  # encrypted (facts + evidence refs)
    category: Mapped[str | None] = mapped_column(String(64))
    quality_score: Mapped[int] = mapped_column(Integer, default=0)
    quality_flags: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus, native_enum=False, length=32))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    call: Mapped[Call] = relationship(back_populates="reports")
    reviews: Mapped[list[Review]] = relationship(back_populates="report", cascade="all, delete-orphan")


class Review(Base):
    """Human validation / correction of a report."""

    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), index=True)
    reviewer: Mapped[str] = mapped_column(String(128))
    action: Mapped[str] = mapped_column(String(32))  # approve | edit_approve | reject | copy
    edited: Mapped[bool] = mapped_column(default=False)
    edit_ratio: Mapped[float] = mapped_column(Float, default=0.0)  # 0 = unchanged, 1 = rewritten
    comment: Mapped[str | None] = mapped_column(EncryptedText)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    report: Mapped[Report] = relationship(back_populates="reviews")


class CrmWriteStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"  # request accepted, not yet verified
    CONFIRMED = "confirmed"  # verified by reading back
    FAILED = "failed"
    UNKNOWN = "unknown"  # outcome uncertain (timeout) — must be verified before any retry


class CrmWrite(Base):
    __tablename__ = "crm_writes"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_crm_idem"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id", ondelete="CASCADE"), index=True)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"))
    connector: Mapped[str] = mapped_column(String(64))
    idempotency_key: Mapped[str] = mapped_column(String(200))
    status: Mapped[CrmWriteStatus] = mapped_column(Enum(CrmWriteStatus, native_enum=False, length=32))
    external_ref: Mapped[str | None] = mapped_column(String(200))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    call: Mapped[Call] = relationship(back_populates="crm_writes")


class ProcessingError(Base):
    """Sanitised error log per stage (no transcript content, no URL, no secret)."""

    __tablename__ = "processing_errors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id", ondelete="CASCADE"), index=True)
    stage: Mapped[str] = mapped_column(String(32))
    attempt: Mapped[int] = mapped_column(Integer)
    error_code: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(String(500))
    retryable: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    call: Mapped[Call] = relationship(back_populates="errors")


class AuditLog(Base):
    """Administrative and access actions (who viewed / approved / deleted what)."""

    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    actor: Mapped[str] = mapped_column(String(128))
    action: Mapped[str] = mapped_column(String(64))
    target: Mapped[str | None] = mapped_column(String(128))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

