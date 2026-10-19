"""Queue of calls: a new call starts while the previous one finishes; transcript copy."""

import threading
import time

import pytest
from fastapi.testclient import TestClient

from phonecall_desktop.audio.devices import SyntheticFileBackend
from phonecall_desktop.config import Environment, Settings
from phonecall_desktop.errors import AppError
from phonecall_desktop.notes.client import SimulatedNoteClient
from phonecall_desktop.session import MAX_CALLS, SessionController, StartRequest, State
from phonecall_desktop.stt.scripted import ScriptedRecognizer
from phonecall_desktop.synthetic import generate_wav
from phonecall_desktop.web.server import Hub, create_app


class GatedNoteClient(SimulatedNoteClient):
    """The first note waits until the test releases it: that call stays « generating »."""

    def __init__(self):
        super().__init__()
        self.gate = threading.Event()
        self.first = True

    def generate(self, segments, duration_s, request_id, meta=None):
        if self.first:
            self.first = False
            assert self.gate.wait(30)
        note = super().generate(segments, duration_s, request_id, meta)
        note.text = f"{note.text}\n[{len(segments)} segments, {meta.get('variant') if meta else None}]"
        return note


@pytest.fixture(scope="module")
def audio_dir(tmp_path_factory):
    d = tmp_path_factory.mktemp("calls")
    generate_wav("demenagement", d)
    return d


def make(audio_dir, note_client=None):
    events = []
    s = Settings(environment=Environment.TEST, audio_backend="test-files", recognizer="scripted",
                 notes_client="simulated", require_consent_confirmation=False, no_signal_warn_s=30)
    ctl = SessionController(s, SyntheticFileBackend(audio_dir, speed=8.0),
                            ScriptedRecognizer.from_file(audio_dir / "demenagement.script.json"),
                            note_client or GatedNoteClient(), emit=lambda t, p: events.append((t, p)))
    return ctl, events


def wait(cond, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.05)
    raise AssertionError("timeout")


def capture_some(ctl, n=3):
    wait(lambda: len(ctl.assembler.final_segments()) >= n)


def test_new_call_while_the_previous_one_finishes(audio_dir):
    ctl, events = make(audio_dir)
    ctl.start(StartRequest(call_type="movers"))
    a = ctl.current
    capture_some(ctl)
    ctl.stop()
    wait(lambda: a.state == State.GENERATING)  # blocked on the gate: still finishing
    # the next call starts at once
    ctl.start(StartRequest(call_type="frontline"))
    b = ctl.current
    assert b is not a and ctl.state == State.CAPTURING
    assert [c["id"] for c in ctl.calls_summary()] == [b.id, a.id]  # newest first
    assert ctl.snapshot_state()["queue_busy"] == 1
    # the previous call finishes in the background, without touching the call on screen
    ctl.note_client.gate.set()
    wait(lambda: a.state == State.DONE)
    assert "movers" in a.note_text and ctl.current is b and ctl.note_text == ""
    assert any(t == "notice" and "Note prête pour l'appel" in p["message"] for t, p in events)
    assert not any(t == "note" for t, p in events)  # the note of A is not pushed onto B's screen
    capture_some(ctl)
    ctl.stop()
    wait(lambda: b.state == State.DONE)
    assert "frontline" in b.note_text and "movers" in a.note_text
    assert a.assembler is not b.assembler and a.transcriber is not b.transcriber
    # segments sent to the screen belong to the call shown at that time
    seg_calls = {p["call_id"] for t, p in events if t == "segment"}
    assert seg_calls <= {a.id, b.id}


def test_cannot_start_two_captures(audio_dir):
    ctl, _ = make(audio_dir, SimulatedNoteClient())
    ctl.start(StartRequest())
    with pytest.raises(AppError):
        ctl.start(StartRequest())
    ctl.stop(wait=True)


def test_new_conversation_keeps_a_finishing_call(audio_dir):
    ctl, _ = make(audio_dir)
    ctl.start(StartRequest())
    a = ctl.current
    capture_some(ctl)
    ctl.stop()
    wait(lambda: a.state == State.GENERATING)
    ctl.new_conversation()  # empty screen, A keeps finishing in the list
    assert ctl.state == State.READY and a in ctl.calls
    with pytest.raises(AppError):
        ctl.remove(a.id)  # not finished yet
    ctl.note_client.gate.set()
    wait(lambda: a.state == State.DONE)
    # open it, then clear it like before
    snap = ctl.select(a.id)
    assert snap["note"] == a.note_text and snap["call_id"] == a.id
    ctl.new_conversation()
    assert a not in ctl.calls


def test_select_and_remove(audio_dir):
    ctl, _ = make(audio_dir, SimulatedNoteClient())
    ctl.start(StartRequest())
    a = ctl.current
    capture_some(ctl)
    ctl.stop(wait=True)
    ctl.start(StartRequest())
    with pytest.raises(AppError):
        ctl.select(a.id)  # the live call stays on screen
    details = ctl.call_details(a.id)
    assert details["note"] and "Interlocuteur :" in details["transcript"]
    capture_some(ctl)
    ctl.stop(wait=True)
    ctl.select(a.id)
    assert ctl.current is a
    ctl.remove(a.id)
    assert a not in ctl.calls and ctl.state == State.READY


def test_transcript_text_includes_live_partials(audio_dir):
    ctl, _ = make(audio_dir, SimulatedNoteClient())
    ctl.start(StartRequest())
    capture_some(ctl, 2)
    live = ctl.transcript_text()
    assert live.startswith("[00:00] Conseiller : Sector Alarm bonjour")
    assert "\n[00:0" in live and "Interlocuteur : Bonjour, je vous appelle" in live
    ctl.stop(wait=True)
    final = ctl.transcript_text()
    assert " …" not in final and len(final.splitlines()) >= len(live.splitlines())


def test_memory_is_bounded(audio_dir):
    ctl, _ = make(audio_dir, SimulatedNoteClient())
    for _ in range(MAX_CALLS + 2):
        ctl.start(StartRequest())
        capture_some(ctl, 1)
        ctl.stop(wait=True)
    assert len(ctl.calls) == MAX_CALLS


TOKEN = "q" * 43


def test_endpoints(audio_dir):
    ctl, _ = make(audio_dir)
    c = TestClient(create_app(ctl, TOKEN, lambda: 5558, Hub()), base_url="http://127.0.0.1:5558")
    c.cookies.set("pcd_session", TOKEN)
    c.headers["X-PCD-Token"] = TOKEN
    assert c.get("/api/transcript/text").json() == {"text": "", "chars": 0}
    c.post("/api/start", json={})
    capture_some(ctl)
    live = c.get("/api/transcript/text").json()
    assert live["chars"] > 20 and "Conseiller :" in live["text"]
    a_id = ctl.current.id
    c.post("/api/stop")
    wait(lambda: ctl.state == State.GENERATING)
    assert c.post("/api/start", json={}).status_code == 200  # queue: allowed while A finishes
    calls = c.get("/api/calls").json()
    assert calls["current_id"] != a_id and [x["state"] for x in calls["calls"]] == ["capturing", "generating"]
    assert c.delete(f"/api/calls/{a_id}").status_code == 409
    assert c.post(f"/api/calls/{a_id}/select").status_code == 409  # capture running
    assert c.get(f"/api/calls/{a_id}").json()["transcript"]
    ctl.note_client.gate.set()
    wait(lambda: ctl._call(a_id).state == State.DONE)
    assert c.get(f"/api/transcript/text?call={a_id}").json()["chars"] > 20
    capture_some(ctl)
    c.post("/api/stop")
    wait(lambda: ctl.state == State.DONE)
    assert c.post(f"/api/calls/{a_id}/select").json()["call_id"] == a_id
    assert c.delete(f"/api/calls/{a_id}").status_code == 200
    assert c.get("/api/calls/unknown").status_code == 409
