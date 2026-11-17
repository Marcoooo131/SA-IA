"""Jours fériés (France métropolitaine). Les autres pays seront ajoutés à la demande."""
from datetime import date, timedelta
from functools import lru_cache


def easter_sunday(year: int) -> date:
    """Algorithme de Meeus/Jones/Butcher (calendrier grégorien)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


@lru_cache(maxsize=64)
def holidays(country: str | None, year: int) -> frozenset[date]:
    if country != "FR":
        return frozenset()
    easter = easter_sunday(year)
    return frozenset({
        date(year, 1, 1), date(year, 5, 1), date(year, 5, 8), date(year, 7, 14),
        date(year, 8, 15), date(year, 11, 1), date(year, 11, 11), date(year, 12, 25),
        easter + timedelta(days=1),   # lundi de Pâques
        easter + timedelta(days=39),  # Ascension
        easter + timedelta(days=50),  # lundi de Pentecôte
    })


def is_holiday(country: str | None, day: date) -> bool:
    return day in holidays(country, day.year)
