"""Business policy stored in the database and editable by an administrator.

Defaults implement the specification (48 h, 24 h, +3 h) and the safest choices for every
open business decision (no retroactive sending, no late sending outside a short grace window,
real sending refused until the compliance review is recorded).
"""

from __future__ import annotations

from datetime import datetime, time

from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AppSetting, Service, ServiceConfig, Step, TemplateSlot, utcnow

POLICY_KEY = "policy"


class Policy(BaseModel):
    # --- Kill switch and compliance
    sending_enabled: bool = True
    # Must be set by an administrator after the legal / DPO review (see docs/CONFORMITE.md).
    # Real (non simulated) sending is refused while it is false.
    compliance_validated: bool = False
    compliance_note: str = ""

    # --- Schedule (absolute durations before the appointment, computed in UTC from Europe/Paris)
    j2_hours_before: int = Field(48, ge=1, le=240)
    j1_hours_before: int = Field(24, ge=1, le=240)
    j1_second_delay_minutes: int = Field(180, ge=1, le=24 * 60)
    # "scheduled": second SMS = planned time of the first + delay (predictable).
    # "actual_send": second SMS = real send time of the first + delay.
    j1_second_anchor: str = "scheduled"

    # --- Validity windows: a job is never sent after scheduled time + grace.
    grace_minutes_j2: int = Field(60, ge=0, le=24 * 60)
    grace_minutes_j1_first: int = Field(60, ge=0, le=24 * 60)
    grace_minutes_j1_second: int = Field(60, ge=0, le=24 * 60)
    grace_minutes_manual: int = Field(15, ge=0, le=24 * 60)
    # Never send less than this before the appointment.
    min_minutes_before_appointment: int = Field(60, ge=0, le=24 * 60)
    # "skip": a step whose time is already past at planning time is never sent.
    # "send_within_grace": sent only if we are still inside its grace window.
    late_policy: str = "skip"

    # --- Provider failures
    max_attempts: int = Field(3, ge=1, le=10)
    retry_delays_minutes: list[int] = Field(default_factory=lambda: [2, 10, 30])
    blocked_recheck_minutes: int = Field(5, ge=1, le=120)

    # --- Duplicate protection
    duplicate_window_hours: int = Field(24, ge=0, le=24 * 14)
    manual_min_interval_minutes: int = Field(60, ge=0, le=24 * 60)

    # --- Optional quiet hours (local time). Disabled by default: business decision.
    quiet_hours_enabled: bool = False
    quiet_start: time = time(21, 0)
    quiet_end: time = time(8, 0)

    # --- Templates
    max_segments: int = Field(3, ge=1, le=10)

    # --- Retention (days after the appointment date). To validate with the DPO.
    retention_days: int = Field(180, ge=1, le=3650)
    import_retention_hours: int = Field(24, ge=1, le=24 * 30)

    @field_validator("j1_second_anchor")
    @classmethod
    def _anchor(cls, v: str) -> str:
        if v not in {"scheduled", "actual_send"}:
            raise ValueError("j1_second_anchor must be 'scheduled' or 'actual_send'")
        return v

    @field_validator("late_policy")
    @classmethod
    def _late(cls, v: str) -> str:
        if v not in {"skip", "send_within_grace"}:
            raise ValueError("late_policy must be 'skip' or 'send_within_grace'")
        return v

    @model_validator(mode="after")
    def _coherent(self) -> Policy:
        if self.j2_hours_before <= self.j1_hours_before:
            raise ValueError("Le SMS J-2 doit précéder le cycle J-1.")
        if self.j1_second_delay_minutes >= self.j1_hours_before * 60 - self.min_minutes_before_appointment:
            raise ValueError("Le second SMS J-1 tomberait après la limite avant rendez-vous.")
        if self.grace_minutes_j1_first >= self.j1_second_delay_minutes:
            raise ValueError("La fenêtre de validité du 1er SMS J-1 doit être plus courte que l'intervalle avec le 2e.")
        if not self.retry_delays_minutes:
            raise ValueError("Au moins un délai de nouvelle tentative est requis.")
        return self

    def grace_minutes(self, step: str) -> int:
        return {
            Step.J2: self.grace_minutes_j2,
            Step.J1_FIRST: self.grace_minutes_j1_first,
            Step.J1_SECOND: self.grace_minutes_j1_second,
        }.get(step, self.grace_minutes_manual)

    def retry_delay(self, attempt: int) -> int:
        """Delay (minutes) after the given failed attempt number (1-based)."""
        delays = self.retry_delays_minutes
        return delays[min(attempt - 1, len(delays) - 1)]

    def in_quiet_hours(self, local: datetime) -> bool:
        if not self.quiet_hours_enabled:
            return False
        t = local.time()
        if self.quiet_start <= self.quiet_end:
            return self.quiet_start <= t < self.quiet_end
        return t >= self.quiet_start or t < self.quiet_end


def load_policy(session: Session) -> Policy:
    row = session.get(AppSetting, POLICY_KEY)
    return Policy.model_validate(row.value) if row else Policy()


def save_policy(session: Session, policy: Policy, actor: str) -> None:
    row = session.get(AppSetting, POLICY_KEY)
    value = policy.model_dump(mode="json")
    if row is None:
        session.add(AppSetting(key=POLICY_KEY, value=value, updated_by=actor))
    else:
        row.value = value
        row.updated_by = actor
        row.updated_at = utcnow()


def ensure_defaults(session: Session) -> None:
    """Create the two services, the six template slots and the default policy (idempotent)."""
    for service in Service.ALL:
        if session.get(ServiceConfig, service) is None:
            session.add(ServiceConfig(service=service, sender_id=None))
        for step in Step.AUTOMATIC:
            exists = session.scalar(
                select(TemplateSlot).where(TemplateSlot.service == service, TemplateSlot.step == step)
            )
            if exists is None:
                session.add(TemplateSlot(service=service, step=step))
    if session.get(AppSetting, POLICY_KEY) is None:
        session.add(AppSetting(key=POLICY_KEY, value=Policy().model_dump(mode="json")))
