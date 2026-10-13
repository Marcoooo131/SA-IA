"""Direct mode (key entered in the app): fake Claude client, no network, no real call."""

import json
from types import SimpleNamespace

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from phonecall_desktop import secrets_store
from phonecall_desktop.audio.devices import SyntheticFileBackend
from phonecall_desktop.audio.types import Channel
from phonecall_desktop.config import Environment, Settings
from phonecall_desktop.errors import AppError, ErrorCode
from phonecall_desktop.notes.direct import DirectAINoteClient, business_config_path, validate_key_format
from phonecall_desktop.session import SessionController
from phonecall_desktop.stt.scripted import ScriptedRecognizer
from phonecall_desktop.synthetic import generate_wav
from phonecall_desktop.transcript.assembler import Segment
from phonecall_desktop.web.server import Hub, create_app

pytest.importorskip("phonecall_agent")
from phonecall_agent.demo_data import load_ai_response_fixture, load_transcript_fixture  # noqa: E402

KEY = "sk-ant-api03-" + "x" * 40
REQUEST = httpx.Request("POST", "https://api.anthropic.com/v1/messages")


class FakeMessages:
    def __init__(self, text=None, error=None):
        self.text, self.error, self.calls = text, error, []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(
            content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=self.text)],
            stop_reason="end_turn", usage=SimpleNamespace(input_tokens=3000, output_tokens=800), model="claude-opus-5-5",
        )


class FakeModels:
    def __init__(self, error=None):
        self.error, self.calls = error, []

    def retrieve(self, model):
        self.calls.append(model)
        if self.error:
            raise self.error
        return SimpleNamespace(id=model)


def fake_factory(messages=None, models=None):
    keys = []

    def factory(key):
        keys.append(key)
        return SimpleNamespace(messages=messages, beta=SimpleNamespace(messages=messages), models=models or FakeModels())

    factory.keys = keys
    return factory


def settings(**kw):
    return Settings(environment=Environment.TEST, audio_backend="test-files", recognizer="scripted",
                    notes_client="anthropic", **kw)


def conversation() -> list[Segment]:
    data = load_transcript_fixture("demenagement")
    return [Segment(utterance_id=s["id"], channel=Channel.MIC if s["speaker"] == "advisor" else Channel.SYSTEM,
                    t_start=s["start"], t_end=s["end"], text=s["text"], final=True) for s in data["segments"]]


def status_error(cls, code):
    return cls("error", response=httpx.Response(code, request=REQUEST), body=None)


def test_generates_note_with_shared_prompt_and_checks():
    messages = FakeMessages(load_ai_response_fixture("demenagement"))
    factory = fake_factory(messages)
    client = DirectAINoteClient(settings(), lambda: KEY, client_factory=factory)
    note = client.generate(conversation(), 95, "req-1")
    assert note.category == "demenagement" and note.text and not note.simulated
    assert note.prompt_version and note.model == "claude-opus-5-5" and note.cost_usd > 0
    assert factory.keys == [KEY]
    sent = messages.calls[0]
    assert sent["model"] == "claude-opus-5-5" and sent["output_config"]["effort"] == "medium"
    assert sent["output_config"]["format"]["type"] == "json_schema"
    user = sent["messages"][0]["content"]
    assert "[conseiller]" in user and "[interlocuteur]" in user and "déménage" in user
    assert KEY not in json.dumps(sent, ensure_ascii=False, default=str)


def test_short_transcript_does_not_call_the_ai():
    messages = FakeMessages("{}")
    client = DirectAINoteClient(settings(), lambda: KEY, client_factory=fake_factory(messages))
    seg = Segment("u1", Channel.MIC, 0.0, 1.0, "Allô ?", final=True)
    note = client.generate([seg], 3, "req-2")
    assert note.no_usable_content and messages.calls == []


def test_missing_key_is_a_retryable_user_error():
    client = DirectAINoteClient(settings(), lambda: None, client_factory=fake_factory(FakeMessages("{}")))
    with pytest.raises(AppError) as err:
        client.generate(conversation(), 95, "req-3")
    assert err.value.code == ErrorCode.AI_KEY_MISSING and err.value.retryable


@pytest.mark.parametrize("error, code", [
    (status_error(anthropic.AuthenticationError, 401), ErrorCode.AI_KEY_INVALID),
    (status_error(anthropic.PermissionDeniedError, 403), ErrorCode.AI_KEY_INVALID),
    (anthropic.APIConnectionError(request=REQUEST), ErrorCode.NOTE_NETWORK),
    (status_error(anthropic.RateLimitError, 429), ErrorCode.NOTE_SERVER),
    (status_error(anthropic.BadRequestError, 400), ErrorCode.NOTE_REJECTED),
])
def test_api_errors_are_mapped(error, code):
    client = DirectAINoteClient(settings(), lambda: KEY, client_factory=fake_factory(FakeMessages(error=error)))
    with pytest.raises(AppError) as err:
        client.generate(conversation(), 95, "req-4")
    assert err.value.code == code


def test_invalid_ai_output_is_retried_then_reported():
    messages = FakeMessages(load_ai_response_fixture("invalid_json"))
    client = DirectAINoteClient(settings(), lambda: KEY, client_factory=fake_factory(messages))
    with pytest.raises(AppError) as err:
        client.generate(conversation(), 95, "req-5")
    assert err.value.code == ErrorCode.NOTE_SERVER and err.value.retryable and len(messages.calls) == 2


def test_new_key_rebuilds_the_client():
    keys = iter([KEY, KEY, KEY + "b"])
    factory = fake_factory(FakeMessages(load_ai_response_fixture("demenagement")))
    client = DirectAINoteClient(settings(), lambda: next(keys), client_factory=factory)
    for i in range(3):
        client.generate(conversation(), 95, f"req-{i}")
    assert factory.keys == [KEY, KEY + "b"]


def test_describe_for_selftest():
    info = DirectAINoteClient(settings(), lambda: None, client_factory=fake_factory()).describe()
    assert info["prompt_version"] and info["prompt_chars"] > 1000 and info["categories"] > 0
    assert info["key"] == "absent" and info["model"] == "claude-opus-5-5"


def test_check_key():
    models = FakeModels()
    client = DirectAINoteClient(settings(), lambda: None, client_factory=fake_factory(models=models))
    client.check_key(KEY)
    assert models.calls == ["claude-opus-5-5"]
    bad = DirectAINoteClient(settings(), lambda: None,
                             client_factory=fake_factory(models=FakeModels(status_error(anthropic.AuthenticationError, 401))))
    with pytest.raises(AppError) as err:
        bad.check_key(KEY)
    assert err.value.code == ErrorCode.AI_KEY_INVALID


@pytest.mark.parametrize("key", ["", "abc", "sk-ant-court", "sk-ant-api03-" + "x" * 20 + " y", "sk-" + "x" * 40])
def test_key_format_is_validated(key):
    with pytest.raises(AppError):
        validate_key_format(key)
    assert validate_key_format(f"  {KEY}\n") == KEY


def test_business_config_found_in_sources(tmp_path):
    assert business_config_path(settings()).name == "business.example.yaml"
    own = tmp_path / "metier.yaml"
    own.write_text("version: x\n", encoding="utf-8")
    assert business_config_path(settings(business_config=own)) == own


def test_production_accepts_direct_mode():
    Settings(environment=Environment.PRODUCTION, notes_client="anthropic").assert_safe()
    with pytest.raises(AppError):
        Settings(environment=Environment.PRODUCTION, notes_client="simulated").assert_safe()


def test_production_ignores_key_from_environment(monkeypatch):
    monkeypatch.setenv("PCD_ANTHROPIC_API_KEY", KEY)
    monkeypatch.setattr("keyring.get_password", lambda *a: None)
    assert secrets_store.get_ai_key(Settings(environment=Environment.TEST)) == KEY
    assert secrets_store.get_ai_key(Settings(environment=Environment.PRODUCTION)) is None


# ---------------------------------------------------------------- key endpoints (write-only)

TOKEN = "t" * 43
PORT = 5556


@pytest.fixture
def vault(monkeypatch):
    store = {}
    monkeypatch.setattr(secrets_store, "get_ai_key", lambda s: store.get("key"))
    monkeypatch.setattr(secrets_store, "set_ai_key", lambda k: store.__setitem__("key", k))
    monkeypatch.setattr(secrets_store, "delete_ai_key", lambda: store.pop("key", None))
    return store


def make_client(tmp_path, notes_client, models=None):
    generate_wav("demenagement", tmp_path)
    s = settings() if notes_client == "anthropic" else Settings(environment=Environment.TEST, notes_client=notes_client)
    note_client = DirectAINoteClient(s, lambda: None, client_factory=fake_factory(models=models))
    if notes_client != "anthropic":
        from phonecall_desktop.notes.client import SimulatedNoteClient

        note_client = SimulatedNoteClient()
    ctl = SessionController(s, SyntheticFileBackend(tmp_path, speed=20),
                            ScriptedRecognizer.from_file(tmp_path / "demenagement.script.json"), note_client)
    c = TestClient(create_app(ctl, TOKEN, lambda: PORT, Hub()), base_url=f"http://127.0.0.1:{PORT}")
    c.cookies.set("pcd_session", TOKEN)
    c.headers["X-PCD-Token"] = TOKEN
    return c


def test_key_endpoints_store_but_never_return_the_key(tmp_path, vault):
    c = make_client(tmp_path, "anthropic")
    assert c.get("/api/ai-key").json() == {"mode": "anthropic", "model": "claude-opus-5-5", "configured": False}
    r = c.put("/api/ai-key", json={"key": KEY})
    assert r.status_code == 200 and r.json()["configured"] and KEY not in r.text
    assert vault["key"] == KEY
    assert KEY not in c.get("/api/ai-key").text and KEY not in c.get("/api/state").text
    assert c.delete("/api/ai-key").json()["configured"] is False and "key" not in vault


def test_rejected_key_is_not_stored(tmp_path, vault):
    c = make_client(tmp_path, "anthropic", models=FakeModels(status_error(anthropic.AuthenticationError, 401)))
    r = c.put("/api/ai-key", json={"key": KEY})
    assert r.status_code == 400 and r.json()["error"]["code"] == "ai_key_invalid" and "key" not in vault
    r = c.put("/api/ai-key", json={"key": "pas-une-cle"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "ai_key_format" and "key" not in vault


def test_key_endpoints_require_direct_mode_and_auth(tmp_path, vault):
    c = make_client(tmp_path, "simulated")
    assert c.get("/api/ai-key").json()["configured"] is False
    assert c.put("/api/ai-key", json={"key": KEY}).status_code == 409 and "key" not in vault
    c.headers.pop("X-PCD-Token")
    assert c.put("/api/ai-key", json={"key": KEY}).status_code == 401
