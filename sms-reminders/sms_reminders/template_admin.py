"""Template administration. Versions are immutable: saving always creates a new version, so a
text already used for a sent SMS can never be modified (each job references its version)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .audit import record
from .models import Service, SmsJob, Step, TemplateSlot, TemplateVersion, utcnow
from .policy import Policy
from .templating import validate


class TemplateError(ValueError):
    pass


def slot_label(slot: TemplateSlot) -> str:
    return f"{Service.LABELS[slot.service]} — {Step.LABELS[slot.step]}"


def save_version(session: Session, slot: TemplateSlot, body: str, *, actor: str) -> TemplateVersion:
    body = body.replace("\r\n", "\n").strip()
    if not body:
        raise TemplateError("Le texte est vide.")
    latest = slot.versions[-1] if slot.versions else None
    if latest and latest.body == body:
        return latest
    number = (session.scalar(select(func.max(TemplateVersion.version)).where(TemplateVersion.slot_id == slot.id)) or 0) + 1
    version = TemplateVersion(slot_id=slot.id, version=number, body=body, created_by=actor)
    session.add(version)
    session.flush()
    session.refresh(slot, ["versions"])
    record(session, actor, "template_saved", f"Template {slot_label(slot)} : version {number} enregistrée (non active).")
    return version


def activate(session: Session, slot: TemplateSlot, version: TemplateVersion, *, actor: str, policy: Policy) -> None:
    if version.slot_id != slot.id:
        raise TemplateError("Version inconnue pour cet emplacement.")
    errors = validate(version.body, policy.max_segments)
    if errors:
        raise TemplateError(" ".join(errors))
    slot.active_version_id = version.id
    slot.active_version = version
    version.activated_at = utcnow()
    version.activated_by = actor
    record(session, actor, "template_activated", f"Template {slot_label(slot)} : version {version.version} activée.")


def deactivate(session: Session, slot: TemplateSlot, *, actor: str) -> None:
    slot.active_version_id = None
    slot.active_version = None
    record(session, actor, "template_deactivated", f"Template {slot_label(slot)} désactivé : envois correspondants bloqués.")


def usage_count(session: Session, version_id: int) -> int:
    return session.scalar(select(func.count(SmsJob.id)).where(SmsJob.template_version_id == version_id)) or 0
