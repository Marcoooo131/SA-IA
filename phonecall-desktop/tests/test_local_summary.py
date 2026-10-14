"""Note without AI (extractive summary, max 10 lines) and model delivered in the package."""

import re

import pytest

from phonecall_desktop import config as config_module
from phonecall_desktop.audio.devices import SyntheticFileBackend
from phonecall_desktop.audio.types import Channel
from phonecall_desktop.config import Environment, Settings
from phonecall_desktop.factory import build_note_client, whisper_model_source
from phonecall_desktop.notes.business import Category, load_categories
from phonecall_desktop.notes.local_summary import NO_CONTENT_TEXT, LocalSummaryNoteClient, summarize
from phonecall_desktop.session import SessionController, StartRequest, State
from phonecall_desktop.stt.scripted import ScriptedRecognizer
from phonecall_desktop.synthetic import SCENARIOS, generate_wav
from phonecall_desktop.transcript.assembler import Segment

CATEGORIES = load_categories(Settings(environment=Environment.TEST))


def call(turns, uncertain=()):
    return [Segment(f"u{i}", Channel(ch), i * 6.0, i * 6.0 + 5, text, final=True, uncertain=i in uncertain)
            for i, (ch, text) in enumerate(turns)]


def quotes(text):
    return re.findall(r"« (.+?) »", text)


@pytest.mark.parametrize("scenario", list(SCENARIOS))
def test_scenarios_fit_in_ten_lines_and_only_quote_what_was_said(scenario):
    segs = call(SCENARIOS[scenario])
    note = summarize(segs, 95, CATEGORIES)
    lines = note.text.splitlines()
    assert 3 <= len(lines) <= 10 and note.cost_usd == 0 and not note.simulated
    said = " ".join(s.text for s in segs)
    for q in quotes(note.text):
        assert q.rstrip("…") in said  # verbatim, never reworded
    assert lines[0].startswith("Motif : ") and "1 min 35 s" in lines[0]
    assert any(f["code"] == "sans_ia" for f in note.flags)


def test_moving_call():
    note = summarize(call(SCENARIOS["demenagement"]), 95, CATEGORIES)
    assert note.category == "demenagement"
    assert "Demande de l'interlocuteur : « Bonjour, je vous appelle parce que je déménage" in note.text
    assert "Réponse de l'interlocuteur : « Je préfère en parler avec ma compagne" in note.text
    assert "Suite prévue : « Je viens de vous envoyer le formulaire" in note.text
    assert "Sector Alarm bonjour" not in note.text and "au revoir" not in note.text


def test_retention_call():
    note = summarize(call(SCENARIOS["resiliation"]), 120, CATEGORIES)
    assert note.category == "retention"
    assert "« D'accord, dans ce cas je garde le contrat. »" in note.text
    assert "Éléments chiffrés cités : deux mois offerts" in note.text
    assert "Conseiller : « Je peux vous proposer deux mois d'abonnement offerts" in note.text


def test_long_call_is_capped_and_keeps_the_end():
    turns = [("system", "Bonjour, je voudrais savoir pourquoi ma centrale sonne toutes les nuits sans raison.")]
    turns += [("mic", f"Je vérifie le point numéro {i} sur votre installation de détecteurs.") for i in range(30)]
    turns += [("system", f"Est-ce que le détecteur {i} peut être en cause selon vous ?") for i in range(10)]
    turns += [("mic", "Je vais programmer le passage d'un technicien mardi prochain à 14 h.")]
    turns += [("system", "D'accord, ça me va pour mardi.")]
    note = summarize(call(turns), 600, CATEGORIES)
    assert note.category == "sav" and len(note.text.splitlines()) <= 10
    assert note.text.count("peut être en cause") == 1  # near-duplicates quoted once
    lines = summarize(call(turns), 600, CATEGORIES, max_lines=5).text.splitlines()
    assert len(lines) == 5 and lines[0].startswith("Motif")
    assert any(line.startswith("Suite prévue") and "mardi prochain" in line for line in lines)
    assert any(line.startswith("Réponse de l'interlocuteur") for line in lines)
    assert lines[-1].startswith("Éléments chiffrés cités") and "mardi prochain" in lines[-1] and "14 h" in lines[-1]


def test_uncertain_passages_are_not_quoted_and_their_figures_are_to_verify():
    turns = [("system", "Bonjour, je souhaite modifier mon prélèvement mensuel s'il vous plaît."),
             ("mic", "Votre abonnement passera à 39 euros par mois à partir du 1er mars."),
             ("system", "D'accord, ça me va très bien comme ça.")]
    note = summarize(call(turns, uncertain={1}), 60, CATEGORIES)
    assert "39 euros" not in note.text
    assert any("39 euros par mois" in p for p in note.points_to_verify)


def test_amounts_dates_and_durations_are_extracted():
    turns = [("system", "Je voudrais savoir combien coûte la caméra supplémentaire pour mon garage."),
             ("mic", "Elle coûte 149 euros, ou quarante-neuf euros par mois pendant trois mois, livrée le 12 avril.")]
    note = summarize(call(turns), 60, CATEGORIES)
    line = note.text.splitlines()[-1]
    assert line.startswith("Éléments chiffrés cités")
    for v in ("149 euros", "quarante-neuf euros par mois", "trois mois", "le 12 avril"):
        assert v in line


def test_unknown_motive_is_flagged():
    turns = [("system", "Bonjour, je voudrais parler à la personne qui m'a appelé hier matin."),
             ("mic", "Je vais regarder qui a essayé de vous joindre et je vous rappelle dans la journée.")]
    note = summarize(call(turns), 40, [Category("x", "X", ["inexistant"])])
    assert note.category is None and "Motif : non déterminé" in note.text
    assert any(f["code"] == "motif_indetermine" for f in note.flags)


def test_no_content():
    note = summarize(call([("mic", "Allô ?"), ("system", "Oui bonjour.")]), 5, CATEGORIES)
    assert note.no_usable_content and note.text == NO_CONTENT_TEXT


def test_long_sentences_are_cut():
    long = "Je voudrais " + " ".join(["vraiment"] * 80) + " comprendre."
    note = summarize(call([("system", long), ("mic", "Je vais vous envoyer un courrier détaillé dès demain matin.")]), 30, CATEGORIES)
    assert all(len(q) <= 175 for q in quotes(note.text)) and "…" in note.text


def test_factory_and_production_accept_local_mode():
    s = Settings(environment=Environment.PRODUCTION, notes_client="local")
    s.assert_safe()
    client = build_note_client(s)
    assert isinstance(client, LocalSummaryNoteClient) and client.describe()["categories"] == len(CATEGORIES) > 0


def test_end_to_end_session_with_local_note(tmp_path):
    generate_wav("demenagement", tmp_path)
    s = Settings(environment=Environment.TEST, audio_backend="test-files", recognizer="scripted", notes_client="local",
                 require_consent_confirmation=False)
    ctl = SessionController(s, SyntheticFileBackend(tmp_path, speed=8), ScriptedRecognizer.from_file(tmp_path / "demenagement.script.json"),
                            build_note_client(s))
    ctl.start(StartRequest())
    end_states = {State.DONE, State.ERROR}
    import time

    deadline = time.time() + 60
    while ctl.state == State.CAPTURING and time.time() < deadline:
        if len(ctl.assembler.final_segments()) >= len(SCENARIOS["demenagement"]) - 1:
            break
        time.sleep(0.1)
    ctl.stop()
    while ctl.state not in end_states and time.time() < deadline:
        time.sleep(0.05)
    assert ctl.state == State.DONE, ctl.error
    assert ctl.note_text.startswith("Motif : Déménagement") and len(ctl.note_text.splitlines()) <= 10


# ---------------------------------------------------------------- model delivered in the package

def test_bundled_model_is_used_offline(tmp_path, monkeypatch):
    s = Settings(environment=Environment.TEST, whisper_model="small")
    monkeypatch.setattr(config_module, "install_dir", lambda: tmp_path)
    assert whisper_model_source(s) == ("small", False)  # nothing delivered: download
    (tmp_path / "models" / "small").mkdir(parents=True)
    (tmp_path / "models" / "small" / "model.bin").write_bytes(b"x")
    assert whisper_model_source(s) == (str(tmp_path / "models" / "small"), True)
    it = tmp_path / "it"
    assert whisper_model_source(s.model_copy(update={"whisper_model_dir": it})) == (str(it / "small"), True)
