from __future__ import annotations

import os
import time
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from sms_desktop import app as desk


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    for k in list(os.environ):
        if k.startswith("SMR_"):
            monkeypatch.delenv(k)
    monkeypatch.setenv("SMRD_CONFIG", str(tmp_path / "config.env"))
    monkeypatch.setenv("SMR_WORKER_POLL_SECONDS", "1")
    yield
    for k in list(os.environ):
        if k.startswith("SMR_"):
            os.environ.pop(k, None)


def test_read_config_only_smr_keys(tmp_path):
    f = tmp_path / "config.env"
    f.write_text("# commentaire\nSMR_SMS_PROVIDER=twilio\nPATH=/evil\nSMR_TWILIO_ACCOUNT_SID='AC1'\n\nnot a line\n", encoding="utf-8")
    assert desk.read_config(f) == {"SMR_SMS_PROVIDER": "twilio", "SMR_TWILIO_ACCOUNT_SID": "AC1"}
    assert desk.read_config(tmp_path / "missing.env") == {}


def test_config_cannot_override_security_settings(tmp_path):
    (tmp_path / "config.env").write_text("SMR_ENVIRONMENT=production\nSMR_LOCAL_LOGIN_TOKEN=known\nSMR_COOKIE_SECURE=true\n")
    desk.prepare_environment(tmp_path / "data", "fresh-token")
    assert os.environ["SMR_ENVIRONMENT"] == "desktop"
    assert os.environ["SMR_LOCAL_LOGIN_TOKEN"] == "fresh-token"
    assert os.environ["SMR_DATABASE_URL"].endswith("data/relances.db")


def test_selftest(tmp_path):
    assert desk.selftest(tmp_path / "data") == 0


def test_runtime_serves_locally_and_sends_simulated_reminders(tmp_path, monkeypatch):
    monkeypatch.setenv("SMR_SMS_PROVIDER", "simulation")  # explicit: the default is real sending
    rt = desk.Runtime(tmp_path / "data")
    rt.start()
    try:
        assert rt.base_url.startswith("http://127.0.0.1:")
        with httpx.Client(base_url=rt.base_url, timeout=10) as c:
            assert c.get("/", follow_redirects=False).status_code == 303  # login required
            assert c.get(rt.login_url.replace(rt.base_url, ""), follow_redirects=True).status_code == 200
            assert "Application de bureau" in c.get("/").text
        # An appointment whose 48 h reminder is due now, with configuration completed.
        from sms_reminders.appointments import AppointmentData, create_appointment
        from sms_reminders.db import session_scope
        from sms_reminders.models import ServiceConfig, SmsJob, TemplateSlot
        from sms_reminders.policy import load_policy
        from sms_reminders.template_admin import activate, save_version
        from sms_reminders.timeutil import PARIS

        now = datetime.now(timezone.utc)
        local = (now + timedelta(hours=48, minutes=-1)).astimezone(PARIS)
        with session_scope() as s:
            s.get(ServiceConfig, "movers").sender_id = "SIM"
            p = load_policy(s)
            p.late_policy = "send_within_grace"  # the 48 h step is one minute old: still in its window
            for slot in s.query(TemplateSlot).filter_by(service="movers").all():
                activate(s, slot, save_version(s, slot, "Bonjour {{prenom}}", actor="t"), actor="t", policy=p)
            create_appointment(s, AppointmentData("CLI-1", "Marie", "Dupont", "0600000001", local.date(),
                                                  local.time().replace(second=0, microsecond=0), "movers"),
                               actor="t", policy=p, now=now)
        deadline = time.time() + 15
        status = None
        while time.time() < deadline:
            with session_scope() as s:
                status = s.query(SmsJob).filter_by(step="j2").one().status
            if status == "simulated":
                break
            time.sleep(0.2)
        assert status == "simulated"
    finally:
        rt.stop()
    assert not rt.scheduler.is_alive()


class FakeKeyring:
    def __init__(self):
        self.data = {}

    def get_password(self, service, key):
        return self.data.get((service, key))

    def set_password(self, service, key, value):
        self.data[(service, key)] = value


def test_provider_store_keeps_token_out_of_files(tmp_path):
    from sms_desktop.provider_store import ProviderStore

    cfg = tmp_path / "cfg" / "config.env"
    cfg.parent.mkdir()
    cfg.write_text("SMR_WORKER_POLL_SECONDS=10\nSMR_SMS_PROVIDER=simulation\nSMR_TWILIO_AUTH_TOKEN=old-in-file\n")
    kr = FakeKeyring()
    store = ProviderStore(cfg, kr)
    assert store.describe()["provider"] == "simulation" and not store.describe()["has_token"]
    store.save("twilio", "AC" + "1" * 32, "secret-token")
    text = cfg.read_text()
    assert "secret-token" not in text and "old-in-file" not in text
    assert "SMR_WORKER_POLL_SECONDS=10" in text and "SMR_SMS_PROVIDER=twilio" in text
    d = store.describe()
    assert d["provider"] == "twilio" and d["has_token"] and d["account_sid"] == "AC" + "1" * 32
    store.save("twilio", "AC" + "1" * 32, None)  # keep the existing token
    assert kr.get_password("RelancesSMS", "twilio_auth_token") == "secret-token"


def test_saved_provider_is_used_at_next_launch(tmp_path, monkeypatch):
    from sms_desktop import provider_store

    kr = FakeKeyring()
    monkeypatch.setattr(provider_store, "_default_keyring", lambda: kr)
    store = provider_store.ProviderStore(desk.config_file(), kr)
    store.save("twilio", "AC" + "2" * 32, "tok")
    rt = desk.Runtime(tmp_path / "data")
    try:
        assert rt.container.provider.name == "twilio" and not rt.container.provider.simulated
        assert rt.container.settings.twilio_auth_token.get_secret_value() == "tok"
        assert rt.container.provider_store is not None
    finally:
        rt.stop()


class FakeProcess:
    def __init__(self, ends_after: float | None):
        self.start = time.time()
        self.ends_after = ends_after

    def poll(self):
        if self.ends_after is not None and time.time() - self.start >= self.ends_after:
            return 0
        return None


def test_quit_button_stops_the_application(tmp_path):
    rt = desk.Runtime(tmp_path / "data")
    rt.start()
    try:
        with httpx.Client(base_url=rt.base_url, timeout=10, follow_redirects=True) as c:
            page = c.get(rt.login_url.replace(rt.base_url, "")).text
            assert "Quitter l'application" in page and "Déconnexion" not in page
            import re

            csrf = re.search(r'name="csrf" value="([^"]+)"', page).group(1)
            r = c.post("/desktop/quit", data={"csrf": csrf})
            assert r.status_code == 200 and "est fermé" in r.text
        desk.wait_until_closed(rt, FakeProcess(None))  # returns once « Quitter » took effect
        assert rt.quit_requested.is_set()
    finally:
        rt.stop()


def test_window_close_stops_but_handed_over_window_keeps_running(tmp_path):
    import threading

    rt = desk.Runtime(tmp_path / "data")
    try:
        desk.wait_until_closed(rt, FakeProcess(ends_after=0.6), handoff_seconds=0.2)  # window closed: returns
        assert not rt.quit_requested.is_set()
        threading.Timer(0.8, rt.quit_requested.set).start()
        t0 = time.time()
        desk.wait_until_closed(rt, FakeProcess(ends_after=0), handoff_seconds=5)  # handed over: waits for « Quitter »
        assert rt.quit_requested.is_set() and time.time() - t0 >= 0.7
    finally:
        rt.stop()


def test_find_edge(tmp_path, monkeypatch):
    exe = tmp_path / "Microsoft" / "Edge" / "Application" / "msedge.exe"
    exe.parent.mkdir(parents=True)
    exe.write_text("")
    monkeypatch.setenv("PROGRAMFILES(X86)", str(tmp_path))
    assert desk.find_edge() == str(exe)


def test_quit_route_absent_on_servers():
    from fastapi.testclient import TestClient

    os.environ.update(SMR_ENVIRONMENT="test", SMR_DATABASE_URL="sqlite://", SMR_COOKIE_SECURE="false")
    from sms_reminders.config import get_settings
    from sms_reminders.container import Container
    from sms_reminders.db import reset_caches
    from sms_reminders.providers.simulation import SimulationProvider
    from sms_reminders.web.app import create_app

    get_settings.cache_clear()
    reset_caches()
    c = Container(settings=get_settings(), provider=SimulationProvider())
    cl = TestClient(create_app(c))
    assert cl.post("/desktop/quit", data={}).status_code in (401, 403, 404)


def test_preset_senders_and_templates_real_mode_by_default(tmp_path):
    from sms_reminders.db import session_scope
    from sms_reminders.models import ServiceConfig, TemplateSlot

    rt = desk.Runtime(tmp_path / "data")
    try:
        # Real provider by default, blocked (not simulated) until the credentials are entered.
        assert rt.container.provider.name == "twilio" and not rt.container.provider.simulated
        assert rt.container.provider.ready is False
        with session_scope() as s:
            assert s.get(ServiceConfig, "movers").sender_id == "+33644645942"
            assert s.get(ServiceConfig, "takeovers").sender_id == "+33757599289"
            slots = s.query(TemplateSlot).all()
            assert len(slots) == 6 and all(sl.active_version is not None for sl in slots)
            j2 = next(sl for sl in slots if sl.service == "movers" and sl.step == "j2").active_version.body
            assert "installation de votre alarme" in j2 and "{{date_rendez_vous}}" in j2
            # Edited by the user: never overwritten (preset applied once).
            s.get(ServiceConfig, "movers").sender_id = "SectorAlarm"
    finally:
        rt.stop()
    rt2 = desk.Runtime(tmp_path / "data")
    try:
        with session_scope() as s:
            assert s.get(ServiceConfig, "movers").sender_id == "SectorAlarm"
            assert all(len(sl.versions) == 1 for sl in s.query(TemplateSlot).all())
    finally:
        rt2.stop()


def test_reminder_blocked_not_simulated_without_credentials(tmp_path):
    from datetime import datetime, timedelta, timezone

    from sms_reminders.appointments import AppointmentData, create_appointment
    from sms_reminders.db import session_scope
    from sms_reminders.models import SmsJob
    from sms_reminders.policy import load_policy
    from sms_reminders.scheduler import run_due
    from sms_reminders.timeutil import PARIS

    rt = desk.Runtime(tmp_path / "data")
    try:
        now = datetime.now(timezone.utc)
        local = (now + timedelta(hours=72)).astimezone(PARIS)
        with session_scope() as s:
            create_appointment(s, AppointmentData("CLI-1", "Marie", "Dupont", "0600000001", local.date(),
                                                  local.time().replace(second=0, microsecond=0), "movers"),
                               actor="t", policy=load_policy(s), now=now)
        run_due(rt.container, now + timedelta(hours=24, minutes=1))
        with session_scope() as s:
            job = s.query(SmsJob).filter_by(step="j2").one()
            assert job.status == "blocked" and "identifiants" in job.status_reason and not job.simulated
    finally:
        rt.stop()
