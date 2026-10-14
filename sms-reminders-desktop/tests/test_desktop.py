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


def test_runtime_serves_locally_and_sends_simulated_reminders(tmp_path):
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
