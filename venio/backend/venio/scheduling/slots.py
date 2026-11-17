"""Calcul des créneaux disponibles (fonctions pures, sans base de données).

Un créneau est proposé pour un collaborateur si :
- le rendez-vous [début, fin] tient dans une plage d'ouverture du jour (heure locale de l'entreprise),
- le jour n'est pas férié (si l'entreprise l'a activé),
- le bloc complet [début - tampon avant, fin + tampon après] ne chevauche aucune occupation
  (congés, rendez-vous confirmés ou en cours de réservation, agendas externes),
- il respecte le délai minimum de prévenance et l'horizon maximum.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from .holidays import is_holiday

Interval = tuple[datetime, datetime]


@dataclass(frozen=True)
class ServiceSpec:
    duration_min: int
    buffer_before_min: int = 0
    buffer_after_min: int = 0
    slot_interval_min: int = 30
    min_notice_min: int = 120
    max_horizon_days: int = 60

    def block(self, start: datetime) -> Interval:
        return (start - timedelta(minutes=self.buffer_before_min),
                start + timedelta(minutes=self.duration_min + self.buffer_after_min))


@dataclass
class ResourceSchedule:
    resource_id: str
    rules: list[tuple[int, time, time]]  # (jour ISO 1-7, début, fin) en heure locale
    busy: list[Interval] = field(default_factory=list)  # UTC


@dataclass(frozen=True)
class Slot:
    start: datetime
    end: datetime
    resource_ids: tuple[str, ...]


def _overlaps(a: Interval, b: Interval) -> bool:
    return a[0] < b[1] and b[0] < a[1]


def compute_slots(
    service: ServiceSpec,
    resources: list[ResourceSchedule],
    day_from: date,
    day_to: date,
    tz_name: str,
    now: datetime,
    holidays_country: str | None = "FR",
) -> list[Slot]:
    tz = ZoneInfo(tz_name)
    earliest = now + timedelta(minutes=service.min_notice_min)
    latest = now + timedelta(days=service.max_horizon_days)
    step = timedelta(minutes=service.slot_interval_min)
    duration = timedelta(minutes=service.duration_min)
    by_start: dict[datetime, list[str]] = {}

    day = day_from
    while day <= day_to:
        if not is_holiday(holidays_country, day):
            weekday = day.isoweekday()
            for res in resources:
                busy = sorted(res.busy)
                for wd, start_t, end_t in res.rules:
                    if wd != weekday:
                        continue
                    # fold=0 : en cas d'heure ambiguë (changement d'heure), on prend la première occurrence.
                    win_start = datetime.combine(day, start_t, tz).astimezone(timezone.utc)
                    win_end = datetime.combine(day, end_t, tz).astimezone(timezone.utc)
                    t = win_start
                    while t + duration <= win_end:
                        if earliest <= t <= latest:
                            block = service.block(t)
                            if not any(_overlaps(block, b) for b in busy):
                                by_start.setdefault(t, []).append(res.resource_id)
                        t += step
        day += timedelta(days=1)

    return [Slot(s, s + duration, tuple(dict.fromkeys(ids))) for s, ids in sorted(by_start.items())]
