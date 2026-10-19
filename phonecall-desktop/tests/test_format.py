"""« Mettre en forme la transcription »: any transcript (current call or pasted) → team Phone Call."""

import json

from fastapi.testclient import TestClient

from phonecall_desktop.audio.devices import SyntheticFileBackend
from phonecall_desktop.audio.types import Channel
from phonecall_desktop.config import Environment, Settings
from phonecall_desktop.notes.direct import DirectAINoteClient
from phonecall_desktop.notes.local_summary import LocalSummaryNoteClient
from phonecall_desktop.notes.template import load_template
from phonecall_desktop.session import SessionController
from phonecall_desktop.stt.scripted import ScriptedRecognizer
from phonecall_desktop.synthetic import generate_wav
from phonecall_desktop.transcript.enhancer import TextEnhancer
from phonecall_desktop.transcript.parse import parse_transcript_text
from phonecall_desktop.web.server import Hub, create_app

from test_direct_note import KEY, FakeMessages, fake_factory, settings as direct_settings

PASTED = """[00:03] Conseiller : Sector Alarm, télésurveillance, déménagement
[00:06] Interlocuteur : oui bonjour euh j'aimerais transférer le contact d'une personne qui va reprendre mon contrat
la suite de la même phrase
[01:20] Interlocuteur : 0649
[01:37] Interlocuteur : 06, 39, 98, 12, 34 et c'est Monsieur Garnier
[01:56] Conseiller : Ça marche, là je demande à ce qu'on l'appelle tout de suite. …
Client - merci, au revoir"""

TOKEN, PORT = "t" * 43, 5557


def test_pasted_transcript_is_read_back_into_segments():
    segs = parse_transcript_text(PASTED, TextEnhancer())
    assert [s.channel for s in segs] == [Channel.MIC, Channel.SYSTEM, Channel.SYSTEM, Channel.SYSTEM, Channel.MIC,
                                         Channel.SYSTEM]
    assert segs[1].text == ("Oui bonjour j'aimerais transférer le contact d'une personne qui va reprendre mon "
                            "contrat la suite de la même phrase.")
    assert segs[1].t_start == 6 and segs[2].text == "0649"
    assert segs[3].text.startswith("06 39 98 12 34")
    assert segs[4].text.endswith("tout de suite.")  # the « … » of a live line is removed
    assert parse_transcript_text("\n  \n") == []


def controller(tmp_path, note_client, **kw):
    generate_wav("demenagement", tmp_path)
    s = Settings(**{"environment": Environment.TEST, "audio_backend": "test-files", "recognizer": "scripted",
                    "notes_client": "local", **kw})
    return SessionController(s, SyntheticFileBackend(tmp_path, speed=20),
                             ScriptedRecognizer.from_file(tmp_path / "demenagement.script.json"), note_client)


def test_without_key_the_note_without_ai_is_used(tmp_path, monkeypatch):
    monkeypatch.setattr("phonecall_desktop.secrets_store.get_ai_key", lambda s: None)
    ctl = controller(tmp_path, LocalSummaryNoteClient([], "", load_template()))
    r = ctl.format_transcript(PASTED, "movers")
    assert r["engine"] == "local" and r["text"].startswith("Interlocuteur :") and r["segments"] == 6


def test_with_a_saved_key_claude_writes_the_phone_call(tmp_path, monkeypatch):
    monkeypatch.setattr("phonecall_desktop.secrets_store.get_ai_key", lambda s: KEY)
    team = load_template()
    out = {f.id: {"status": "absent", "items": [], "reason": "", "evidence": []} for f in team.all_fields()}
    out["tiers"] = {"status": "present", "items": ["Monsieur Garnier, 06 39 98 12 34"], "reason": "", "evidence": ["S4"]}
    messages = FakeMessages(json.dumps({"direction": "entrant", "variant": "movers", "fields": out}))
    ctl = controller(tmp_path, LocalSummaryNoteClient([], "", team))
    ctl._direct_formatter = DirectAINoteClient(direct_settings(note_template=None), lambda: KEY,
                                               client_factory=fake_factory(messages))
    r = ctl.format_transcript(PASTED, "movers")
    assert r["engine"] == "claude" and "Contact Repreneurs : Monsieur Garnier, 06 39 98 12 34" in r["text"]
    assert any(f["code"] == "numero_variantes" for f in r["flags"])  # « 0649 » was dictated first
    assert "<transcription>" in messages.calls[0]["messages"][0]["content"]


def test_format_endpoint(tmp_path, monkeypatch):
    monkeypatch.setattr("phonecall_desktop.secrets_store.get_ai_key", lambda s: None)
    ctl = controller(tmp_path, LocalSummaryNoteClient([], "", load_template()))
    c = TestClient(create_app(ctl, TOKEN, lambda: PORT, Hub()), base_url=f"http://127.0.0.1:{PORT}")
    c.cookies.set("pcd_session", TOKEN)
    c.headers["X-PCD-Token"] = TOKEN
    r = c.post("/api/format", json={"text": PASTED, "variant": "movers"})
    assert r.status_code == 200 and r.json()["text"].startswith("Interlocuteur :")
    assert c.post("/api/format", json={"text": "   "}).status_code == 400
    assert c.get("/api/ai-key").json()["mode"] == "local"  # the « Clé API » button is shown in this mode
