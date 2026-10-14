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


def section(text, title):
    """Lines under a heading of the template, up to the next blank line."""
    block = text.split(f"\n{title}\n", 1)[1]
    return block.split("\n\n", 1)[0].splitlines()


def field(text, label):
    return next(line for line in text.splitlines() if line.startswith(f"{label} :")).split(" : ", 1)[1]


TEMPLATE = ["FRONTLINE", "Interlocuteur :", "Nom :", "Numéro de téléphone :", "Agent :", "Service concernée :",
            "Raison de l'appel :", "Situation :", "Réponse apporté :", "Informations Complémentaires :"]


@pytest.mark.parametrize("scenario", list(SCENARIOS))
def test_follows_the_company_template_and_only_quotes_what_was_said(scenario):
    segs = call(SCENARIOS[scenario])
    note = summarize(segs, 95, CATEGORIES)
    positions = [note.text.find(h) for h in TEMPLATE]
    assert -1 not in positions and positions == sorted(positions)  # every heading, in the template order
    said = " ".join(s.text for s in segs)
    for q in quotes(note.text):
        assert q.rstrip("…") in said  # verbatim, never reworded
    assert "- Durée de l'appel : 1 min 35 s" in note.text
    assert note.cost_usd == 0 and not note.simulated and any(f["code"] == "sans_ia" for f in note.flags)


def test_moving_call():
    note = summarize(call(SCENARIOS["demenagement"]), 95, CATEGORIES)
    t = note.text
    assert note.category == "demenagement" and field(t, "Service concernée") == "Déménagement"
    assert section(t, "Raison de l'appel :")[0].startswith("- « Bonjour, je vous appelle parce que je déménage")
    assert "- « Dans une maison, un peu plus grande que mon appartement actuel. »" in section(t, "Situation :")
    answers = section(t, "Réponse apporté :")
    assert "- « Je peux vous proposer un rendez-vous avec un technicien. »" in answers
    assert answers[-1].startswith("- Décision de l'interlocuteur : « Je préfère en parler avec ma compagne")
    assert not any("?" in line for line in answers)  # the advisor's questions are not answers
    assert section(t, "Informations Complémentaires :")[0].startswith("- Suite prévue : « Je viens de vous envoyer le formulaire")
    assert "Sector Alarm bonjour" not in t and "au revoir" not in t
    assert field(t, "Nom") == "" and field(t, "Numéro de téléphone") == ""  # not said: left for the advisor


def test_retention_call():
    t = summarize(call(SCENARIOS["resiliation"]), 120, CATEGORIES).text
    assert field(t, "Service concernée") == "Rétention"
    assert "- Décision de l'interlocuteur : « D'accord, dans ce cas je garde le contrat. »" in section(t, "Réponse apporté :")
    assert "- Éléments chiffrés cités : deux mois offerts" in section(t, "Informations Complémentaires :")


def test_name_phone_and_agent_when_said():
    turns = [("mic", "Sector Alarm, Julie bonjour, je vous écoute."),
             ("system", "Bonjour, je m’appelle Madame Durand, j'ai un problème avec ma centrale qui sonne la nuit."),
             ("mic", "Je vais vous envoyer un technicien demain matin, Madame Durand."),
             ("system", "Vous pouvez me joindre au 06.12.34.56.78 si besoin.")]
    note = summarize(call(turns), 60, CATEGORIES)
    t = note.text
    assert field(t, "Nom") == "Madame Durand (à vérifier)"
    assert field(t, "Numéro de téléphone") == "06 12 34 56 78 (à vérifier)"
    assert field(t, "Agent") == "Julie"
    assert not any("06" in line for line in section(t, "Situation :"))
    assert any("Nom et numéro" in p for p in note.points_to_verify)
    assert field(summarize(call(turns), 60, CATEGORIES, agent_name="Marc D.").text, "Agent") == "Marc D."


def test_advisor_addressing_the_customer_gives_the_name():
    turns = [("mic", "Bonjour Monsieur Martin, que puis-je faire pour vous aujourd'hui ?"),
             ("system", "Je voudrais une attestation pour mon assurance habitation s'il vous plaît."),
             ("mic", "Je vous envoie l'attestation par e-mail dans la journée.")]
    t = summarize(call(turns), 50, CATEGORIES).text
    assert field(t, "Nom") == "Monsieur Martin (à vérifier)" and field(t, "Agent") == ""
    assert field(t, "Service concernée") == "Demande administrative"


def test_long_call_keeps_many_words_without_duplicates():
    turns = [("system", "Bonjour, je voudrais savoir pourquoi ma centrale sonne toutes les nuits sans raison.")]
    turns += [("mic", f"Je vérifie le point numéro {i} sur votre installation de détecteurs.") for i in range(30)]
    turns += [("system", f"Le détecteur du salon {i} clignote aussi depuis la semaine dernière.") for i in range(10)]
    turns += [("mic", "Je vais programmer le passage d'un technicien mardi prochain à 14 h.")]
    turns += [("system", "D'accord, ça me va pour mardi.")]
    t = summarize(call(turns), 600, CATEGORIES).text
    assert field(t, "Service concernée") == "Service après-vente"
    assert t.count("clignote aussi") == 1 and t.count("Je vérifie le point") == 1  # near-duplicates quoted once
    info = section(t, "Informations Complémentaires :")
    assert info[0].startswith("- Suite prévue : « Je vais programmer le passage d'un technicien mardi prochain à 14 h")
    assert any("mardi prochain" in line and "14 h" in line for line in info)
    assert "- Durée de l'appel : 10 min 00 s" in info


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
    line = next(x for x in summarize(call(turns), 60, CATEGORIES).text.splitlines() if "Éléments chiffrés" in x)
    for v in ("149 euros", "quarante-neuf euros par mois", "trois mois", "le 12 avril"):
        assert v in line


def test_unknown_service_is_left_empty_and_flagged():
    turns = [("system", "Bonjour, je voudrais parler à la personne qui m'a appelé hier matin."),
             ("mic", "Je vais regarder qui a essayé de vous joindre et je vous rappelle dans la journée.")]
    note = summarize(call(turns), 40, [Category("x", "X", ["inexistant"])])
    assert note.category is None and field(note.text, "Service concernée") == ""
    assert any(f["code"] == "service_indetermine" for f in note.flags)


def test_no_content():
    note = summarize(call([("mic", "Allô ?"), ("system", "Oui bonjour.")]), 5, CATEGORIES)
    assert note.no_usable_content and note.text == NO_CONTENT_TEXT


def test_very_long_sentences_are_cut():
    long = "Je voudrais " + " ".join(["vraiment"] * 150) + " comprendre."
    note = summarize(call([("system", long), ("mic", "Je vais vous envoyer un courrier détaillé dès demain matin.")]), 30, CATEGORIES)
    assert all(len(q) <= 405 for q in quotes(note.text)) and "…" in note.text


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
    assert ctl.note_text.startswith("FRONTLINE") and "Service concernée : Déménagement" in ctl.note_text


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
