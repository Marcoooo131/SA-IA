from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from venio.scheduling.holidays import easter_sunday
from venio.scheduling.slots import ResourceSchedule, ServiceSpec, compute_slots

PARIS = ZoneInfo("Europe/Paris")
MONDAY = date(2030, 6, 3)  # lundi ordinaire
NOW = datetime(2030, 1, 2, 8, 0, tzinfo=timezone.utc)


def at(d: date, h: int, m: int = 0) -> datetime:
    return datetime.combine(d, time(h, m), PARIS).astimezone(timezone.utc)


def morning(rid="r1", busy=None):
    return ResourceSchedule(rid, [(1, time(9), time(12))], busy or [])


def starts(slots):
    return [s.start.astimezone(PARIS).strftime("%H:%M") for s in slots]


def test_basic_slots_fit_inside_window():
    slots = compute_slots(ServiceSpec(60, slot_interval_min=60, max_horizon_days=365), [morning()], MONDAY, MONDAY, "Europe/Paris", NOW)
    assert starts(slots) == ["09:00", "10:00", "11:00"]


def test_busy_and_buffers_block_neighbouring_slots():
    busy = [(at(MONDAY, 10), at(MONDAY, 11))]
    spec = ServiceSpec(60, buffer_after_min=30, slot_interval_min=30, max_horizon_days=365)
    # 09:00 + 60 min + 30 min de tampon = 10:30 → chevauche ; 11:00 libre
    assert starts(compute_slots(spec, [morning(busy=busy)], MONDAY, MONDAY, "Europe/Paris", NOW)) == ["11:00"]


def test_min_notice_and_horizon():
    now = at(MONDAY, 9, 15)
    spec = ServiceSpec(30, slot_interval_min=30, min_notice_min=60)
    assert starts(compute_slots(spec, [morning()], MONDAY, MONDAY, "Europe/Paris", now)) == ["10:30", "11:00", "11:30"]
    far = ServiceSpec(30, max_horizon_days=1)
    assert compute_slots(far, [morning()], MONDAY + timedelta(days=7), MONDAY + timedelta(days=7), "Europe/Paris", now) == []


def test_holidays_are_closed_unless_disabled():
    easter_monday = easter_sunday(2030) + timedelta(days=1)
    res = [ResourceSchedule("r1", [(1, time(9), time(10))])]
    assert compute_slots(ServiceSpec(60, max_horizon_days=365), res, easter_monday, easter_monday, "Europe/Paris", NOW) == []
    assert len(compute_slots(ServiceSpec(60, max_horizon_days=365), res, easter_monday, easter_monday, "Europe/Paris", NOW, None)) == 1


def test_multiple_resources_are_merged():
    r1 = morning("r1", busy=[(at(MONDAY, 9), at(MONDAY, 12))])
    r2 = morning("r2")
    slots = compute_slots(ServiceSpec(60, slot_interval_min=60, max_horizon_days=365), [r1, r2], MONDAY, MONDAY, "Europe/Paris", NOW)
    assert [s.resource_ids for s in slots] == [("r2",)] * 3


def test_daylight_saving_day_uses_local_time():
    dst = date(2030, 3, 31)  # passage à l'heure d'été (dimanche)
    res = [ResourceSchedule("r1", [(7, time(9), time(10))])]
    slots = compute_slots(ServiceSpec(60, max_horizon_days=365), res, dst, dst, "Europe/Paris", NOW, None)
    assert starts(slots) == ["09:00"] and slots[0].start.hour == 7  # UTC+2
