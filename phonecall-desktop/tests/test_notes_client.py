import hashlib
import socket
import threading
import time

import httpx
import pytest

from phonecall_desktop.audio.types import Channel
from phonecall_desktop.errors import AppError, ErrorCode
from phonecall_desktop.notes.client import GatewayNoteClient, SimulatedNoteClient
from phonecall_desktop.transcript.assembler import Segment

OK = {"note_text": "Appel – Déménagement.", "category": "demenagement", "no_usable_content": False,
      "quality": {"score": 100, "flags": []}, "points_to_verify": [], "prompt_version": "2026-10-v2", "model": "m",
      "cost_usd": 0.05}
SEGS = [Segment("system-0", Channel.SYSTEM, 1.0, 3.0, "Je déménage.", True)]


def client_with(responses, **kw):
    calls = []

    def handler(request):
        calls.append(request)
        r = responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r

    c = GatewayNoteClient("https://gw.example", lambda: "tok", transport=httpx.MockTransport(handler), sleep=lambda s: None, **kw)
    return c, calls


def test_success_and_payload():
    c, calls = client_with([httpx.Response(200, json=OK)])
    res = c.generate(SEGS, 30, "req-abcdef12")
    assert res.text == "Appel – Déménagement." and res.prompt_version == "2026-10-v2"
    sent = calls[0]
    assert sent.headers["authorization"] == "Bearer tok"
    import json

    body = json.loads(sent.content)
    assert body["segments"][0] == {"start": 1.0, "end": 3.0, "speaker": "remote", "text": "Je déménage.", "uncertain": False}
    assert body["client_request_id"] == "req-abcdef12"


def test_retries_on_server_errors_and_network():
    c, calls = client_with([httpx.Response(503), httpx.ConnectError("down"), httpx.Response(200, json=OK)])
    assert c.generate(SEGS, 30, "req-abcdef12").category == "demenagement"
    assert len(calls) == 3
    ids = {__import__("json").loads(r.content)["client_request_id"] for r in calls}
    assert ids == {"req-abcdef12"}  # same id: the gateway answers retries from its cache


@pytest.mark.parametrize("resp,code", [
    (httpx.Response(401), ErrorCode.NOTE_AUTH),
    (httpx.Response(422), ErrorCode.NOTE_REJECTED),
])
def test_non_retryable_errors(resp, code):
    c, calls = client_with([resp])
    with pytest.raises(AppError) as exc:
        c.generate(SEGS, 30, "req-abcdef12")
    assert exc.value.code == code and len(calls) == 1


def test_timeouts_exhausted():
    c, calls = client_with([httpx.ReadTimeout("slow")] * 3)
    with pytest.raises(AppError) as exc:
        c.generate(SEGS, 30, "req-abcdef12")
    assert exc.value.code == ErrorCode.NOTE_TIMEOUT and exc.value.retryable and len(calls) == 3


def test_missing_token():
    c = GatewayNoteClient("https://gw.example", lambda: None)
    with pytest.raises(AppError) as exc:
        c.generate(SEGS, 30, "x" * 12)
    assert exc.value.code == ErrorCode.NOTE_AUTH


def test_simulated_client_is_labelled():
    res = SimulatedNoteClient().generate(SEGS, 10, "r")
    assert res.simulated and res.text.startswith("[NOTE SIMULÉE")


# ------------------------------------------------------------------ against the real gateway


@pytest.fixture
def gateway(tmp_path, monkeypatch):
    """Runs phonecall-agent (simulated AI) on a local port."""
    pytest.importorskip("phonecall_agent")
    import uvicorn
    from cryptography.fernet import Fernet

    token = "pcn_integration-token"
    agent_dir = __import__("pathlib").Path(__file__).resolve().parents[2] / "phonecall-agent"
    env = {
        "PCA_ENVIRONMENT": "test", "PCA_DATABASE_URL": f"sqlite:///{tmp_path}/gw.db",
        "PCA_GENERATION_PROVIDER": "simulated", "PCA_TRANSCRIPTION_PROVIDER": "simulated",
        "PCA_DATA_ENCRYPTION_KEY": Fernet.generate_key().decode(), "PCA_SESSION_SECRET": "s" * 40,
        "PCA_NOTE_API_TOKENS_SHA256": hashlib.sha256(token.encode()).hexdigest(),
        "PCA_BUSINESS_CONFIG_PATH": str(agent_dir / "config" / "business.example.yaml"),
    }
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    from phonecall_agent import container as cm
    from phonecall_agent.config import get_settings
    from phonecall_agent.db import reset_caches
    from phonecall_agent.web.app import create_app

    get_settings.cache_clear()
    reset_caches()
    cm.set_container(None)
    app = create_app()
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_level="warning"))
    t = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
    t.start()
    while not server.started:
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}", token
    server.should_exit = True
    t.join(5)
    get_settings.cache_clear()
    cm.set_container(None)


def test_end_to_end_with_real_gateway(gateway):
    url, token = gateway
    from phonecall_agent.demo_data import load_transcript_fixture

    segs = [Segment(f"x-{i}", Channel.SYSTEM if s["speaker"] == "customer" else Channel.MIC, s["start"], s["end"], s["text"], True)
            for i, s in enumerate(load_transcript_fixture("demenagement")["segments"])]
    c = GatewayNoteClient(url, lambda: token)
    assert c.health()
    res = c.generate(segs, 60, "req-integration1")
    assert "formulaire" in res.text and res.category == "demenagement"
    assert res.prompt_version == "2026-10-v2"
    assert not [f for f in res.flags if f["severity"] == "blocking"]
    bad = GatewayNoteClient(url, lambda: "pcn_wrong")
    with pytest.raises(AppError) as exc:
        bad.generate(segs, 60, "req-integration2")
    assert exc.value.code == ErrorCode.NOTE_AUTH
