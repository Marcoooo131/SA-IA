"""Europe/Paris local time <-> UTC, with explicit handling of daylight-saving transitions.

Reminder offsets are absolute durations (48 h = 172,800 s), computed in UTC. Across a DST
change, the local clock time of a reminder therefore differs by one hour from the
appointment's clock time — that is what "exactly 48 hours before" means.
"""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")


class LocalTimeError(ValueError):
    pass


def local_to_utc(d: date, t: time, tz: ZoneInfo = PARIS) -> tuple[datetime, str | None]:
    """Return (UTC datetime, warning). Raise for a local time that does not exist."""
    naive = datetime.combine(d, t.replace(tzinfo=None))
    first = naive.replace(tzinfo=tz, fold=0)
    second = naive.replace(tzinfo=tz, fold=1)
    roundtrip = first.astimezone(timezone.utc).astimezone(tz).replace(tzinfo=None)
    if roundtrip != naive:
        raise LocalTimeError(
            f"L'heure {t:%H:%M} n'existe pas le {d:%d/%m/%Y} (passage à l'heure d'été)."
        )
    warning = None
    if first.utcoffset() != second.utcoffset():
        warning = (
            f"L'heure {t:%H:%M} existe deux fois le {d:%d/%m/%Y} (passage à l'heure d'hiver) : "
            "la première occurrence (heure d'été) est retenue."
        )
    return first.astimezone(timezone.utc), warning


def to_local(dt: datetime | None, tz: ZoneInfo = PARIS) -> datetime | None:
    return dt.astimezone(tz) if dt else None


def fmt(dt: datetime | None, with_seconds: bool = False) -> str:
    if dt is None:
        return "—"
    return to_local(dt).strftime("%d/%m/%Y %H:%M:%S" if with_seconds else "%d/%m/%Y %H:%M")


def fmt_short(dt: datetime | None) -> str:
    return to_local(dt).strftime("%d/%m %H:%M") if dt else "—"


def fmt_date_fr(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def fmt_time_fr(t: time) -> str:
    return f"{t.hour}h{t.minute:02d}"
