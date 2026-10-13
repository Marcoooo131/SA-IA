import os
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from phonecall_desktop.audio.devices import SyntheticFileBackend
from phonecall_desktop.config import Environment, Settings
from phonecall_desktop.notes.client import SimulatedNoteClient
from phonecall_desktop.session import SessionController
from phonecall_desktop.stt.scripted import ScriptedRecognizer
from phonecall_desktop.synthetic import generate_wav
from phonecall_desktop.web.server import Hub, create_app

TOKEN = "t" * 43
PORT = 5555


@pytest.fixture
def client(tmp_path):
    generate_wav("demenagement", tmp_path)
    s = Settings(environment=Environment.TEST, audio_backend="test-files", recognizer="scripted", notes_client="simulated")
    ctl = SessionController(s, SyntheticFileBackend(tmp_path, speed=20), ScriptedRecognizer.from_file(tmp_path / "demenagement.script.json"),
                            SimulatedNoteClient())
    app = create_app(ctl, TOKEN, lambda: PORT, Hub())
    c = TestClient(app, base_url=f"http://127.0.0.1:{PORT}")
    c.ctl = ctl
    return c


def authed(c):
    c.cookies.set("pcd_session", TOKEN)
    c.headers["X-PCD-Token"] = TOKEN
    return c


def test_token_login_sets_cookie(client):
    r = client.get(f"/?t={TOKEN}", follow_redirects=False)
    assert r.status_code == 303 and "httponly" in r.headers["set-cookie"].lower() and "samesite=strict" in r.headers["set-cookie"].lower()
    page = client.get("/")
    assert page.status_code == 200 and TOKEN in page.text and "Démarrer" in page.text
    assert client.get("/?t=wrong").status_code == 401


def test_api_requires_cookie_and_header(client):
    assert client.get("/api/state").status_code == 401
    client.cookies.set("pcd_session", TOKEN)
    assert client.get("/api/state").status_code == 401  # cookie alone (CSRF) is not enough
    assert client.get("/api/state", headers={"X-PCD-Token": TOKEN}).status_code == 200


def test_dns_rebinding_and_foreign_origin_blocked(client):
    authed(client)
    assert client.get("/api/state", headers={"Host": "evil.example"}).status_code == 403
    assert client.post("/api/start", json={"consent": True}, headers={"Origin": "http://evil.example"}).status_code == 403
    assert client.ctl.capture is None


def test_websocket_requires_token_and_origin(client):
    authed(client)
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws?t=bad", headers={"Origin": f"http://127.0.0.1:{PORT}", "Host": f"127.0.0.1:{PORT}"}) as ws:
            ws.receive_text()
    with client.websocket_connect(f"/ws?t={TOKEN}", headers={"Origin": f"http://127.0.0.1:{PORT}", "Host": f"127.0.0.1:{PORT}"}) as ws:
        assert '"snapshot"' in ws.receive_text()


def test_csp_and_no_cache(client):
    r = client.get(f"/?t={TOKEN}")
    assert "default-src 'self'" in r.headers["content-security-policy"] and r.headers["cache-control"] == "no-store"


def test_flow_through_api(client):
    authed(client)
    r = client.post("/api/start", json={"consent": False})
    assert r.status_code == 400 and r.json()["error"]["code"] == "consent_required"
    assert client.post("/api/start", json={"consent": True}).json()["state"] == "capturing"
    assert client.post("/api/start", json={"consent": True}).status_code == 409
    client.ctl.capture._states[next(iter(client.ctl.capture._states))].source.finished.wait(10)
    assert client.post("/api/stop").json()["state"] == "finalizing"
    end = time.time() + 15
    while client.get("/api/state").json()["state"] != "done" and time.time() < end:
        time.sleep(0.1)
    state = client.get("/api/state").json()
    assert state["state"] == "done" and state["note"] and state["transcript"]
    assert client.post("/api/note", json={"text": "Note modifiée"}).json()["ok"]
    assert client.get("/api/state").json()["note"] == "Note modifiée"
    assert client.get("/api/history").json() == {"enabled": False, "items": []}
    assert client.post("/api/new").json()["state"] == "ready"


# ------------------------------------------------------------------ real browser (Playwright)

CHROMIUM = next((p for p in [os.environ.get("PCD_CHROMIUM"), "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"] if p and Path(p).exists()), None)
try:
    import playwright  # noqa: F401

    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False


@pytest.fixture
def running_app(tmp_path):
    env = {**os.environ, "PCD_ENVIRONMENT": "dev", "PCD_AUDIO_BACKEND": "test-files", "PCD_RECOGNIZER": "scripted",
           "PCD_NOTES_CLIENT": "simulated", "PCD_TEST_AUDIO_DIR": str(tmp_path / "audio"), "PCD_TEST_AUDIO_SPEED": "4",
           "PCD_NO_SIGNAL_WARN_S": "60", "HOME": str(tmp_path)}
    port_file = tmp_path / "port"
    proc = subprocess.Popen([sys.executable, "-m", "phonecall_desktop", "--port-file", str(port_file)], env=env)
    end = time.time() + 30
    while not port_file.exists() or len(port_file.read_text().split()) < 2:
        assert time.time() < end and proc.poll() is None
        time.sleep(0.1)
    port, token = port_file.read_text().split()
    yield f"http://127.0.0.1:{port}/?t={token}", proc
    proc.terminate()
    proc.wait(10)


@pytest.mark.skipif(not HAS_PLAYWRIGHT or os.environ.get("PCD_SKIP_UI_TESTS") == "1", reason="UI tests disabled")
def test_ui_end_to_end(running_app, tmp_path):
    from playwright.sync_api import expect, sync_playwright

    url, _ = running_app
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM)
        ctx = browser.new_context(viewport={"width": 1400, "height": 900})
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=url.split("/?")[0])
        page = ctx.new_page()
        page.goto(url)
        expect(page.locator("#state-badge")).to_have_text("Prêt")
        expect(page.locator("#test-banner")).to_be_visible()
        expect(page.locator("#btn-start")).to_be_disabled()  # consent not ticked
        page.check("#consent")
        page.click("#btn-start")
        expect(page.locator("#state-badge")).to_have_text("Capture en cours")
        expect(page.locator("#capture-banner")).to_be_visible()
        expect(page.locator("#transcript .seg").first).to_be_visible(timeout=15000)  # live text
        expect(page.locator("#meter-system-label")).to_contain_text("son détecté", timeout=15000)
        page.wait_for_timeout(4000)
        page.screenshot(path=str(tmp_path / "capturing.png"))
        n_live = page.locator("#transcript .seg").count()
        page.click("#btn-stop")
        expect(page.locator("#capture-banner")).to_be_hidden()
        expect(page.locator("#state-badge")).to_have_text("Terminé", timeout=20000)
        assert page.locator("#transcript .seg").count() >= n_live
        note = page.locator("#note").input_value()
        assert note.startswith("[NOTE SIMULÉE")
        page.click("#btn-copy")
        expect(page.locator("#btn-copy")).to_have_text("Copié ✓")
        assert page.evaluate("navigator.clipboard.readText()") == note
        page.click("#btn-edit")
        page.fill("#note", "Note corrigée.")
        page.click("#btn-edit")
        expect(page.locator("#btn-edit")).to_have_text("Modifier la note")
        page.screenshot(path=str(tmp_path / "done.png"))
        page.once("dialog", lambda d: d.accept())
        page.click("#btn-new")
        expect(page.locator("#state-badge")).to_have_text("Prêt")
        expect(page.locator("#note")).to_have_value("")
        browser.close()
    import shutil

    out = Path(os.environ.get("PCD_SCREENSHOT_DIR", tmp_path))
    if out != tmp_path:
        out.mkdir(parents=True, exist_ok=True)
        for f in ("capturing.png", "done.png"):
            shutil.copy(tmp_path / f, out / f)


@pytest.mark.skipif(not HAS_PLAYWRIGHT or os.environ.get("PCD_SKIP_UI_TESTS") == "1", reason="UI tests disabled")
def test_closing_the_interface_stops_capture(running_app):
    from playwright.sync_api import expect, sync_playwright

    url, proc = running_app
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM)
        page = browser.new_page()
        page.goto(url)
        page.check("#consent")
        page.click("#btn-start")
        expect(page.locator("#state-badge")).to_have_text("Capture en cours")
        browser.close()  # window closed during the capture
    token = url.split("t=")[1]
    base = url.split("/?")[0]
    end = time.time() + 40
    state = None
    while time.time() < end:
        state = httpx.get(base + "/api/state", cookies={"pcd_session": token}, headers={"X-PCD-Token": token}).json()["state"]
        if state != "capturing":
            break
        time.sleep(0.5)
    assert state != "capturing"
