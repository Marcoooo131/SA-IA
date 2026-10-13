import time

import pytest

from fakes import FakeBackend
from phonecall_desktop.audio.devices import SyntheticFileBackend
from phonecall_desktop.audio.types import Channel
from phonecall_desktop.config import Environment, Settings
from phonecall_desktop.errors import AppError, ErrorCode
from phonecall_desktop.history import History
from phonecall_desktop.notes.client import SimulatedNoteClient
from phonecall_desktop.session import SessionController, StartRequest, State
from phonecall_desktop.stt.scripted import ScriptedRecognizer
from phonecall_desktop.synthetic import generate_wav


@pytest.fixture(scope="module")
def audio_dir(tmp_path_factory):
    d = tmp_path_factory.mktemp("calls")
    generate_wav("demenagement", d)
    return d


def settings(**kw):
    base = dict(environment=Environment.TEST, audio_backend="test-files", recognizer="scripted",
                notes_client="simulated", no_signal_warn_s=30, require_consent_confirmation=True)
    base.update(kw)
    return Settings(**base)


def make(audio_dir, speed=8.0, note_client=None, history=None, **kw):
    events = []
    rec = ScriptedRecognizer.from_file(audio_dir / "demenagement.script.json")
    ctl = SessionController(settings(**kw), SyntheticFileBackend(audio_dir, speed=speed), rec,
                            note_client or SimulatedNoteClient(), history, emit=lambda t, p: events.append((t, p)))
    return ctl, events


def wait_state(ctl, states, timeout=30):
    end = time.time() + timeout
    while time.time() < end:
        if ctl.state in states:
            return ctl.state
        time.sleep(0.05)
    raise AssertionError(f"state stayed {ctl.state}")


def test_consent_required_before_capture(audio_dir):
    ctl, _ = make(audio_dir)
    with pytest.raises(AppError) as exc:
        ctl.start(StartRequest(consent=False))
    assert exc.value.code == ErrorCode.CONSENT_REQUIRED and ctl.state == State.READY and ctl.capture is None


def test_full_conversation(audio_dir):
    ctl, events = make(audio_dir, speed=8.0)
    ctl.start(StartRequest(consent=True))
    assert ctl.state == State.CAPTURING and set(ctl.opened_devices) == {"system", "mic"}
    src = ctl.capture._states[Channel.SYSTEM].source
    assert src.finished.wait(20)  # whole synthetic call played (~45 s at x8)
    ctl.capture._states[Channel.MIC].source.finished.wait(5)
    time.sleep(0.5)
    live = [p for t, p in events if t == "segment"]
    assert live, "text must appear during the capture"
    ctl.stop()
    assert not ctl.capture.capturing
    wait_state(ctl, {State.DONE})
    states = [p["state"] for t, p in events if t == "state"]
    assert states[:2] == ["capturing", "finalizing"] and "generating" in states and states[-1] == "done"
    finals = ctl.assembler.final_segments()
    assert len(finals) == 10 and finals[0].speaker == "advisor" and finals[1].speaker == "remote"
    assert ctl.note_text.startswith("[NOTE SIMULÉE")
    assert ctl.metrics["transcription"]["finals"] >= 10


def test_stop_mid_sentence_keeps_last_words(audio_dir):
    ctl, _ = make(audio_dir, speed=1.0)
    import json

    turn = json.loads((audio_dir / "demenagement.script.json").read_text(encoding="utf-8"))["segments"][1]
    assert turn["channel"] == "system" and turn["end"] - turn["start"] > 3
    ctl.start(StartRequest(consent=True))
    time.sleep(turn["start"] + 1.5)  # stop in the middle of the remote party's sentence
    ctl.stop(wait=True)
    texts = [s.text for s in ctl.assembler.final_segments()]
    assert texts[0] == "Sector Alarm bonjour, je vous écoute."  # turns stay separate in real time
    assert any("déménage" in t for t in texts), texts


def test_no_more_audio_after_stop(audio_dir):
    ctl, _ = make(audio_dir, speed=1.0)
    ctl.start(StartRequest(consent=True))
    time.sleep(0.5)
    sources = [st.source for st in ctl.capture._states.values()]
    ctl.stop(wait=True)
    assert all(not s.is_alive() for s in sources if s) and all(st.source is None for st in ctl.capture._states.values())


def test_no_source_error(audio_dir, tmp_path):
    ctl, _ = make(audio_dir)
    ctl.backend = SyntheticFileBackend(tmp_path)  # empty directory: no device
    with pytest.raises(AppError) as exc:
        ctl.start(StartRequest(consent=True))
    assert exc.value.code == ErrorCode.NO_SOURCE and ctl.state == State.ERROR
    assert "Aucune source audio" in ctl.error["message"]


def test_silent_call_gives_empty_transcript_error(audio_dir):
    events = []
    backend = FakeBackend()
    ctl = SessionController(settings(no_signal_warn_s=0.3), backend, ScriptedRecognizer([]), SimulatedNoteClient(),
                            emit=lambda t, p: events.append((t, p)))
    ctl.start(StartRequest(consent=True))
    time.sleep(0.8)
    ctl.stop(wait=True)
    assert ctl.state == State.ERROR and ctl.error["code"] == "empty_transcript"
    assert any(t == "notice" and p["code"] == "no_signal" for t, p in events)


def test_generation_failure_keeps_transcript_and_retry_works(audio_dir):
    client = SimulatedNoteClient(fail_times=1)
    ctl, _ = make(audio_dir, speed=10.0, note_client=client)
    ctl.start(StartRequest(consent=True))
    ctl.capture._states[Channel.SYSTEM].source.finished.wait(20)
    ctl.stop(wait=True)
    assert ctl.state == State.ERROR and ctl.error["code"] == "note_network" and ctl.error["retryable"]
    assert ctl.assembler.final_segments()
    ctl.regenerate()
    wait_state(ctl, {State.DONE})
    assert client.calls == 2


def test_edit_copy_new_conversation_and_history(audio_dir, tmp_path):
    from cryptography.fernet import Fernet

    hist = History(tmp_path / "h.db", Fernet.generate_key(), retention_days=7, store_transcript=False)
    ctl, _ = make(audio_dir, speed=10.0, history=hist)
    ctl.start(StartRequest(consent=True))
    ctl.capture._states[Channel.SYSTEM].source.finished.wait(20)
    ctl.stop(wait=True)
    wait_state(ctl, {State.DONE})
    ctl.update_note("Note corrigée par le conseiller.")
    ctl.mark_copied()
    items = hist.list()
    assert len(items) == 1 and items[0]["status"] == "copied" and not items[0]["has_transcript"]
    assert hist.get(items[0]["id"])["note"] == "Note corrigée par le conseiller."
    ctl.new_conversation()
    assert ctl.state == State.READY and ctl.note_text == "" and ctl.assembler.snapshot() == []


def test_cannot_start_twice_and_new_conversation_blocked_during_capture(audio_dir):
    ctl, _ = make(audio_dir)
    ctl.start(StartRequest(consent=True))
    with pytest.raises(AppError):
        ctl.start(StartRequest(consent=True))
    with pytest.raises(AppError):
        ctl.new_conversation()
    ctl.emergency_stop()
    assert not ctl.capture.capturing


def test_max_duration_auto_stop(audio_dir):
    ctl, events = make(audio_dir, speed=1.0, max_session_minutes=0.01)  # 0.6 s
    ctl.start(StartRequest(consent=True))
    wait_state(ctl, {State.FINALIZING, State.GENERATING, State.DONE, State.ERROR}, timeout=5)
    assert any(t == "notice" and "automatiquement" in p["message"] for t, p in events)


def test_production_config_refuses_test_components():
    s = Settings(environment=Environment.PRODUCTION, audio_backend="test-files", notes_client="simulated", gateway_url="http://x")
    with pytest.raises(AppError) as exc:
        s.assert_safe()
    assert "audio_backend" in exc.value.detail and "gateway_url" in exc.value.detail


def test_history_retention_and_encryption(tmp_path):
    from cryptography.fernet import Fernet

    key = Fernet.generate_key()
    h = History(tmp_path / "h.db", key, retention_days=7, store_transcript=True)
    sid = h.save(duration_s=10, status="generated", note="Le client déménage.", transcript="Interlocuteur : je déménage")
    raw = (tmp_path / "h.db").read_bytes()
    assert b"d\xc3\xa9m\xc3\xa9nage" not in raw
    assert h.get(sid)["transcript"]
    import sqlite3

    with sqlite3.connect(tmp_path / "h.db") as db:
        db.execute("UPDATE sessions SET created_at = created_at - 8*86400")
    assert h.purge() == 1 and h.list() == []
    h.save(duration_s=1, status="x", note="a", transcript=None)
    assert h.delete() == 1
    other = History(tmp_path / "h.db", Fernet.generate_key(), 7, False)
    other.save(duration_s=1, status="x", note="b", transcript=None)
    assert History(tmp_path / "h.db", key, 7, False).list()[0]["preview"] == ""  # wrong key: unreadable, no crash
