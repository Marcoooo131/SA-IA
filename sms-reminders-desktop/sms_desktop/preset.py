"""Sector Alarm configuration provided by the business (15/10/2026): sender numbers and SMS texts.

Applied once per database, only where nothing is configured yet: a sender or a template already
set in the application is never overwritten. Everything stays editable in Paramètres.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

PRESET_KEY = "desktop_preset"
PRESET_VERSION = 1

SENDERS = {"movers": "+33644645942", "takeovers": "+33757599289"}

TEXT_48H = (
    "Bonjour, confirmation du rdv d'installation de votre alarme prévu le {{date_rendez_vous}}. "
    "Vous recevrez un appel la veille si vous maintenez le rendez-vous sélectionné. "
    "Absence facturée 100 €. Rdv modifiable jusqu'à 17h la veille au 0644645942."
)
TEXT_24H = (
    "Bonjour, nous avons rendez-vous pour la remise de votre système de télésurveillance le {{date_rendez_vous}}. "
    "Je vous remercie de bien vouloir nous rappeler au 0644645942. "
    "Sans confirmation de votre part nous annulerons votre rendez-vous. Cordialement, Sector Alarm."
)
TEXTS = {"j2": TEXT_48H, "j1_first": TEXT_24H, "j1_second": TEXT_24H}


def apply_preset(session: Session, actor: str = "configuration initiale") -> list[str]:
    from sms_reminders.audit import record
    from sms_reminders.models import AppSetting, ServiceConfig, TemplateSlot
    from sms_reminders.policy import load_policy
    from sms_reminders.template_admin import activate, save_version

    marker = session.get(AppSetting, PRESET_KEY)
    if marker is not None and marker.value.get("version", 0) >= PRESET_VERSION:
        return []
    done: list[str] = []
    for service, sender in SENDERS.items():
        cfg = session.get(ServiceConfig, service)
        if cfg is not None and not cfg.sender_id:
            cfg.sender_id, cfg.updated_by = sender, actor
            done.append(f"expéditeur {service}")
    policy = load_policy(session)
    for slot in session.scalars(select(TemplateSlot)).all():
        if slot.active_version_id is None and not slot.versions:
            version = save_version(session, slot, TEXTS[slot.step], actor=actor)
            activate(session, slot, version, actor=actor, policy=policy)
            done.append(f"template {slot.service}/{slot.step}")
    if marker is None:
        session.add(AppSetting(key=PRESET_KEY, value={"version": PRESET_VERSION}, updated_by=actor))
    else:
        marker.value = {"version": PRESET_VERSION}
    if done:
        record(session, actor, "preset_applied", "Configuration Sector Alarm appliquée : " + ", ".join(done) + ".")
    return done
