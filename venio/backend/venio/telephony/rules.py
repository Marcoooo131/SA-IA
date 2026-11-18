"""Moteur de décision : envoyer ou non un SMS après un appel manqué (05 §A.5).

Fonctions pures (aucun accès base) : les faits sont rassemblés par telephony/service.py.
Les règles s'appliquent dans l'ordre ; la première qui bloque l'emporte, et sa raison est journalisée.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Callable, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from .sms import TEMPLATES

# Bornes légales/professionnelles : l'entreprise ne peut pas en sortir (05 §A.9).
EARLIEST, LATEST = time(8, 0), time(21, 30)

REASONS: dict[str, str] = {
    "sent": "SMS envoyé",
    "simulated": "SMS simulé (ligne de test : rien n'est envoyé)",
    "paid_disabled": "Non envoyé : envois payants désactivés",
    "disabled": "Module désactivé",
    "line_paused": "Ligne en pause",
    "call_answered": "Appel pris en charge",
    "call_uncertain": "Statut de l'appel incertain : pas d'envoi par prudence",
    "masked": "Numéro masqué",
    "not_mobile": "Numéro non joignable par SMS (fixe ou étranger)",
    "excluded": "Numéro exclu",
    "opted_out": "Opposition aux SMS (STOP)",
    "burst": "Déjà contacté récemment (appels rapprochés)",
    "cap": "Plafond de SMS atteint pour ce numéro",
    "called_back": "Rappelé et décroché entre-temps",
    "recent_request": "Demande ou rendez-vous récent pour ce numéro",
    "outside_hours_late": "Hors horaires d'envoi, appel trop ancien",
    "quota": "Crédits SMS du mois épuisés",
    "daily_safety": "Plafond de sécurité journalier atteint",
    "no_page": "Aucune page de réservation publiée",
}


class MissedCallConfig(BaseModel):
    validation_delay_s: int = Field(default=90, ge=30, le=600)
    tone: str = "professionnel"
    custom_text: str | None = Field(default=None, max_length=480)
    stop_mention: str | None = Field(default=None, max_length=40)
    sender: str | None = Field(default=None, pattern=r"^[A-Za-z0-9]{3,11}$")
    send_days: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5, 6])
    send_start: time = time(8, 0)
    send_end: time = time(20, 0)
    skip_holidays: bool = True
    out_of_hours: Literal["defer", "skip"] = "defer"
    max_defer_hours: int = Field(default=12, ge=1, le=48)
    burst_window_hours: int = Field(default=24, ge=1, le=168)
    max_per_number_30d: int = Field(default=3, ge=1, le=10)
    recent_request_days: int = Field(default=7, ge=0, le=30)

    @field_validator("send_days")
    @classmethod
    def _days(cls, v: list[int]) -> list[int]:
        days = sorted(set(v))
        if not days or any(d < 1 or d > 7 for d in days):
            raise ValueError("Jours d'envoi invalides (1 = lundi … 7 = dimanche).")
        return days

    @model_validator(mode="after")
    def _window(self) -> "MissedCallConfig":
        if self.tone != "personnalise" and self.tone not in TEMPLATES:
            raise ValueError("Ton de message inconnu.")
        if self.tone == "personnalise" and not (self.custom_text and "{lien}" in self.custom_text):
            raise ValueError("Le message personnalisé doit contenir {lien}.")
        if self.send_start < EARLIEST or self.send_end > LATEST or self.send_start >= self.send_end:
            raise ValueError("Les envois sont possibles entre 8 h et 21 h 30, et l'heure de début doit précéder l'heure de fin.")
        return self

    def template_text(self) -> str:
        return self.custom_text if self.tone == "personnalise" and self.custom_text else TEMPLATES[self.tone]["text"]


def in_window(local: datetime, cfg: MissedCallConfig, is_holiday: Callable[[date], bool]) -> bool:
    if local.isoweekday() not in cfg.send_days or (cfg.skip_holidays and is_holiday(local.date())):
        return False
    return cfg.send_start <= local.time() < cfg.send_end


def next_window_start(local: datetime, cfg: MissedCallConfig, is_holiday: Callable[[date], bool]) -> datetime | None:
    """Prochain instant d'envoi autorisé (heure locale), dans les 14 jours."""
    if in_window(local, cfg, is_holiday):
        return local
    for offset in range(0, 15):
        day = local.date() + timedelta(days=offset)
        start = datetime.combine(day, cfg.send_start, tzinfo=local.tzinfo)
        if start <= local:
            continue
        if day.isoweekday() in cfg.send_days and not (cfg.skip_holidays and is_holiday(day)):
            return start
    return None


@dataclass
class Facts:
    enabled: bool
    line_active: bool
    outcome: str                      # pending / answered / transferred / missed / abandoned
    from_number: str | None           # E.164 ou None (masqué)
    is_mobile: bool
    excluded: bool
    opted_out: bool
    sent_in_burst_window: int
    sent_30d: int
    called_back: bool
    recent_request: bool
    has_page: bool
    local_now: datetime
    call_ended_local: datetime
    credits_needed: int
    credits_left: int | None          # None = illimité
    sent_today: int
    daily_limit: int
    config: MissedCallConfig = field(default_factory=MissedCallConfig)
    ignore_hours: bool = False        # espace de démonstration uniquement (aucun envoi réel n'y est possible)


@dataclass(frozen=True)
class Decision:
    action: Literal["send", "skip", "defer"]
    reason: str
    run_at_local: datetime | None = None


def decide(f: Facts, is_holiday: Callable[[date], bool]) -> Decision:
    cfg = f.config
    if not f.enabled:
        return Decision("skip", "disabled")
    if not f.line_active:
        return Decision("skip", "line_paused")
    if f.outcome in ("answered", "transferred"):
        return Decision("skip", "call_answered")
    if f.outcome not in ("missed", "abandoned"):
        return Decision("skip", "call_uncertain")
    if not f.from_number:
        return Decision("skip", "masked")
    if not f.is_mobile:
        return Decision("skip", "not_mobile")
    if f.excluded:
        return Decision("skip", "excluded")
    if f.opted_out:
        return Decision("skip", "opted_out")
    if f.sent_in_burst_window > 0:
        return Decision("skip", "burst")
    if f.sent_30d >= cfg.max_per_number_30d:
        return Decision("skip", "cap")
    if f.called_back:
        return Decision("skip", "called_back")
    if f.recent_request:
        return Decision("skip", "recent_request")
    if not f.has_page:
        return Decision("skip", "no_page")
    if not f.ignore_hours and not in_window(f.local_now, cfg, is_holiday):
        nxt = next_window_start(f.local_now, cfg, is_holiday)
        too_late = nxt is None or nxt - f.call_ended_local > timedelta(hours=cfg.max_defer_hours)
        if cfg.out_of_hours == "skip" or too_late:
            return Decision("skip", "outside_hours_late")
        return Decision("defer", "outside_hours", nxt)
    if f.sent_today >= f.daily_limit:
        return Decision("skip", "daily_safety")
    if f.credits_left is not None and f.credits_left < f.credits_needed:
        return Decision("skip", "quota")
    return Decision("send", "sent")
