from __future__ import annotations

import os
import re

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from twilio.request_validator import RequestValidator

ACCOUNT_SID = "AC" + "a" * 32
AUTH_TOKEN = "test-auth-token-0123456789"
PASSWORD = "correct horse battery"


def recording_sid(n: int) -> str:
    return "RE" + f"{n:032x}"


@pytest.fixture
def env(tmp_path, monkeypatch):
    from phonecall_agent.web.auth import hash_password

    pw = hash_password(PASSWORD, n=2**10)  # cheap hash for tests
    values = {
        "PCA_ENVIRONMENT": "test",
        # Set PCA_TEST_DATABASE_URL (e.g. postgresql+psycopg://...) to run the suite on PostgreSQL.
        "PCA_DATABASE_URL": os.environ.get("PCA_TEST_DATABASE_URL") or f"sqlite:///{tmp_path}/test.db",
        "PCA_QUEUE_BACKEND": "inline",
        "PCA_TWILIO_ACCOUNT_SID": ACCOUNT_SID,
        "PCA_TWILIO_AUTH_TOKEN": AUTH_TOKEN,
        "PCA_TWILIO_API_KEY_SID": "",
        "PCA_PUBLIC_BASE_URL": "https://agent.example.test",
        "PCA_DATA_ENCRYPTION_KEY": Fernet.generate_key().decode(),
        "PCA_AUDIO_TEMP_DIR": str(tmp_path / "audio"),
        "PCA_TRANSCRIPTION_PROVIDER": "simulated",
        "PCA_GENERATION_PROVIDER": "simulated",
        "PCA_CRM_CONNECTOR": "disabled",
        "PCA_SESSION_SECRET": "s" * 40,
        "PCA_COOKIE_SECURE": "false",
        "PCA_UI_USERS": f"alice:advisor:{pw};sam:supervisor:{pw};ada:admin:{pw}",
        "PCA_METRICS_TOKEN": "metrics-token",
        "PCA_BUSINESS_CONFIG_PATH": "config/business.example.yaml",
    }
    for k, v in values.items():
        monkeypatch.setenv(k, v)
    _reset()
    if os.environ.get("PCA_TEST_DATABASE_URL"):
        from phonecall_agent.db import Base, get_engine, init_db

        init_db()
        Base.metadata.drop_all(get_engine())
    yield values
    _reset()


def _reset():
    from phonecall_agent import container as container_mod
    from phonecall_agent.config import get_settings
    from phonecall_agent.crypto import get_fernet
    from phonecall_agent.db import reset_caches

    get_settings.cache_clear()
    get_fernet.cache_clear()
    reset_caches()
    container_mod.set_container(None)


@pytest.fixture
def fake_twilio(env):
    from phonecall_agent.fake_twilio import FakeTwilio

    return FakeTwilio(ACCOUNT_SID)


@pytest.fixture
def container(env, fake_twilio):
    from phonecall_agent.config import get_settings
    from phonecall_agent.container import build_container, set_container
    from phonecall_agent.db import init_db
    from phonecall_agent.twilio.recordings import TwilioRecordingClient

    settings = get_settings()
    c = build_container(settings)
    c.recording_client_factory = lambda: TwilioRecordingClient(
        settings, transport=fake_twilio.transport(), sleep=lambda s: None
    )
    set_container(c)
    init_db()
    return c


@pytest.fixture
def app(container):
    from phonecall_agent.web.app import create_app

    return create_app(container)


@pytest.fixture
def client(app):
    return TestClient(app, base_url="https://agent.example.test")


def webhook_params(n: int, status: str = "completed", **extra) -> dict:
    params = {
        "AccountSid": ACCOUNT_SID,
        "CallSid": "CA" + f"{n:032x}",
        "RecordingSid": recording_sid(n),
        "RecordingStatus": status,
        "RecordingDuration": "60",
        "RecordingChannels": "2",
        "RecordingSource": "DialVerb",
    }
    params.update(extra)
    return params


def sign(params: dict, url: str = "https://agent.example.test/twilio/recording-status", token: str = AUTH_TOKEN) -> str:
    return RequestValidator(token).compute_signature(url, params)


def post_webhook(client, params: dict, signature: str | None = "auto"):
    headers = {}
    if signature == "auto":
        signature = sign(params)
    if signature is not None:
        headers["X-Twilio-Signature"] = signature
    return client.post("/twilio/recording-status", data=params, headers=headers)


def add_recording(fake_twilio, container, n: int, transcript: str = "demenagement", ai: str | list = "demenagement", **kw):
    from phonecall_agent.fake_twilio import FakeRecording

    sid = recording_sid(n)
    fake_twilio.recordings[sid] = FakeRecording(**kw)
    container.transcriber.mapping[sid] = transcript
    container.generator.mapping[sid] = ai
    return sid


def login(client, user: str):
    page = client.get("/login")
    csrf = re.search(r'name="csrf" value="([^"]+)"', page.text).group(1)
    r = client.post("/login", data={"login": user, "password": PASSWORD, "csrf": csrf}, follow_redirects=False)
    assert r.status_code == 303, r.text
    # The session is renewed at login: fetch the new CSRF token.
    page = client.get("/calls")
    return re.search(r'name="csrf" value="([^"]+)"', page.text).group(1)


def get_call(recording: str):
    from sqlalchemy import select

    from phonecall_agent.db import session_scope
    from phonecall_agent.models import Call

    with session_scope() as s:
        call = s.scalar(select(Call).where(Call.recording_sid == recording))
        if call is not None:
            # load relationships before the session closes
            _ = (call.audio, call.transcript, list(call.reports), list(call.errors), list(call.crm_writes))
            for r in call.reports:
                _ = list(r.reviews)
        return call
