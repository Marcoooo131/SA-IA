"""Reminder time written by hand in a task's description (template filled by the advisor).

The template line carries a label (« Horaire », « Rappel », « Créneau »…, configurable) followed by a
date and a time in the usual French forms:

    Horaire de rappel : 29/10/2026 à 14h30
    Rappel : mardi 29 octobre 14h - 15h
    Créneau : demain entre 9h et 10h30
    Date de rappel :            ← value on the next line also accepted
    29/10 14:30

Only labelled lines are read, so other dates of the text (date of the move, of the contract…) are never
taken for the reminder. The text is read in memory only, never stored.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from .config import normalize_name

MONTHS = {
    "janvier": 1, "janv": 1, "jan": 1, "fevrier": 2, "fevr": 2, "fev": 2, "mars": 3, "avril": 4, "avr": 4,
    "mai": 5, "juin": 6, "juillet": 7, "juil": 7, "aout": 8, "septembre": 9, "sept": 9, "sep": 9,
    "octobre": 10, "oct": 10, "novembre": 11, "nov": 11, "decembre": 12, "dec": 12,
}
_MONTH_RE = "|".join(sorted(MONTHS, key=len, reverse=True))
NUMERIC_DATE = re.compile(r"(?<!\d)(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{4}|\d{2}))?(?![\d/])")
TEXT_DATE = re.compile(rf"(?<!\d)(\d{{1,2}})(?:er)?\s+({_MONTH_RE})\.?(?:\s+(\d{{4}}))?\b")
RELATIVE = {"aujourd'hui": 0, "aujourd\u2019hui": 0, "aujourd hui": 0, "ce jour": 0, "apres-demain": 2, "apres demain": 2, "demain": 1}
# 14h30, 14 h 30, 14h, 14:30 — never a bare number (avoids reading « 29/10 » or a phone number as an hour)
TIME = re.compile(r"(?<![\d:/])([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?(?!\d)")


@dataclass(frozen=True)
class Reminder:
    start: datetime          # aware, UTC
    end: datetime | None     # aware, UTC — when the template gives a range (« 14h - 15h »)


def _segments(text: str, labels: tuple[str, ...]) -> list[str]:
    """Normalized text following each label (rest of the line, or the next line when the line ends there)."""
    lines = [normalize_name(line) for line in (text or "").splitlines()]
    keys = [normalize_name(lbl) for lbl in labels if lbl.strip()]
    out = []
    for i, line in enumerate(lines):
        hits = [line.find(k) for k in keys if k in line]
        if not hits:
            continue
        pos = min(hits)
        rest = line[pos:]
        label = re.match(r"[^:\d]*:", rest)        # « Horaire de rappel : » — not the colon of « 14:30 »
        rest = rest[label.end():] if label else rest
        if not re.search(r"\d|demain|aujourd|ce jour", rest):
            nxt = next((nl for nl in lines[i + 1:] if nl.strip()), "")
            rest = f"{rest} {nxt}"
        out.append(rest)
    return out


def _date(segment: str, today: date) -> tuple[date | None, str, bool]:
    """First date of the segment, the segment without it (so its digits are not read as an hour), and
    whether a written date was impossible (31/02) — then nothing is booked."""
    m = NUMERIC_DATE.search(segment)
    t = TEXT_DATE.search(segment)
    if t and (not m or t.start() < m.start()):
        day, month, year = int(t.group(1)), MONTHS[t.group(2)], int(t.group(3)) if t.group(3) else None
        span = t.span()
    elif m:
        day, month = int(m.group(1)), int(m.group(2))
        year = int(m.group(3)) if m.group(3) else None
        if year is not None and year < 100:
            year += 2000
        span = m.span()
    else:
        for word, delta in RELATIVE.items():
            if word in segment:
                return today + timedelta(days=delta), segment.replace(word, " ", 1), False
        return None, segment, False
    try:
        found = date(year or today.year, month, day)
    except ValueError:
        return None, segment, True
    if year is None and found < today - timedelta(days=7):
        found = date(today.year + 1, month, day)      # « 03/01 » written in late December
    return found, segment[:span[0]] + " " + segment[span[1]:], False


def _times(segment: str) -> list[time]:
    return [time(int(h), int(mm or 0)) for h, mm in TIME.findall(segment)]


def _eu_to_utc(local: datetime) -> datetime:
    """Central European time without the tz database: UTC+1, UTC+2 from the last Sunday of March 2:00
    to the last Sunday of October 3:00."""
    def last_sunday(month: int) -> date:
        d = date(local.year, month, 31)
        return d - timedelta(days=(d.weekday() + 1) % 7)
    summer = datetime.combine(last_sunday(3), time(2)) <= local < datetime.combine(last_sunday(10), time(3))
    return (local - timedelta(hours=2 if summer else 1)).replace(tzinfo=timezone.utc)


def to_utc(local: datetime, zone: str) -> datetime:
    try:
        from zoneinfo import ZoneInfo
        return local.replace(tzinfo=ZoneInfo(zone)).astimezone(timezone.utc)
    except Exception:  # noqa: BLE001 — Windows without tzdata: Central European rule
        return _eu_to_utc(local)


def parse_reminder(text: str, labels: tuple[str, ...], zone: str = "Europe/Paris",
                   now: datetime | None = None) -> Reminder | None:
    """The reminder written in the task's text, or None when no labelled line gives a time."""
    now_utc = now or datetime.now(timezone.utc)
    try:
        from zoneinfo import ZoneInfo
        today = now_utc.astimezone(ZoneInfo(zone)).date()
    except Exception:  # noqa: BLE001
        today = (now_utc + timedelta(hours=1)).date()
    for segment in _segments(text, labels):
        # Hours first (« 14h30 », « 14:30 » never look like a date), then the date in what is left:
        # « 14h30-28/10 » written without spaces must not be read as the date « 30-28 »
        hours = _times(segment)
        day, _, impossible = _date(TIME.sub(" ", segment), today)
        if impossible or not hours:
            continue
        day = day or today
        start = to_utc(datetime.combine(day, hours[0]), zone)
        end = to_utc(datetime.combine(day, hours[1]), zone) if len(hours) > 1 and hours[1] > hours[0] else None
        return Reminder(start, end)
    return None
