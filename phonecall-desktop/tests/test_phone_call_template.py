"""General Phone Call template: central configuration, note without AI, automatic check.

Fictional calls only (tests/call_scripts.py): Movers, Frontline, outgoing call, call without
enough information, call with contradictions, call with several follow-up actions.
"""

import re
import time

import pytest
from call_scripts import ALL, CONTRADICTORY, FRONTLINE, INSUFFICIENT, MOVERS, MULTI_FOLLOW_UP, OUTGOING

from phonecall_desktop import config as config_module
from phonecall_desktop.audio.devices import SyntheticFileBackend
from phonecall_desktop.audio.types import Channel
from phonecall_desktop.config import Environment, Settings
from phonecall_desktop.factory import build_note_client, whisper_model_source
from phonecall_desktop.notes.business import load_categories
from phonecall_desktop.notes.local_summary import NO_CONTENT_TEXT, LocalSummaryNoteClient, summarize
from phonecall_desktop.notes.template import (
    CallContext,
    FieldValue,
    FilledNote,
    check,
    load_template,
    render,
    template_path,
)
from phonecall_desktop.session import SessionController, StartRequest, State
from phonecall_desktop.stt.scripted import ScriptedRecognizer
from phonecall_desktop.synthetic import SCENARIOS, generate_wav
from phonecall_desktop.transcript.assembler import Segment

ABSENT = "Aucune information notifiée"
CATEGORIES = load_categories(Settings(environment=Environment.TEST))
TEMPLATE = load_template()
CLOCK = time.mktime((2026, 10, 14, 10, 32, 0, 0, 0, -1))


def segs(turns, uncertain=()):
    return [Segment(f"u{i}", Channel(ch), i * 5.0, i * 5.0 + 4, text, final=True, uncertain=i in uncertain)
            for i, (ch, text) in enumerate(turns)]


def make_note(turns, uncertain=(), **ctx):
    ctx = {"started_at": CLOCK, "duration_s": len(turns) * 5, **ctx}
    return summarize(segs(turns, uncertain), CallContext(**ctx), CATEGORIES, TEMPLATE)


def value(text, label):
    """Value of a field: the rest of its line plus its bullets."""
    lines = text.splitlines()
    i = next(i for i, line in enumerate(lines) if line.startswith(f"{label} :"))
    out = [lines[i].split(" : ", 1)[1] if " : " in lines[i] else ""]
    for line in lines[i + 1:]:
        if not line.startswith("- "):
            break
        out.append(line)
    return "\n".join(out).strip()


def visible_labels(note_text):
    return [line.split(" :", 1)[0] for line in note_text.splitlines() if " :" in line and not line.startswith("- ")]


# ---------------------------------------------------------------- every scenario


@pytest.mark.parametrize("name", [n for n in ALL if n != "insuffisant"])
def test_every_field_has_a_value_and_only_quotes_what_was_said(name):
    note = make_note(ALL[name])
    text = note.text
    assert text.startswith("COMPTE RENDU D'APPEL")
    for title in [s.title.upper() for s in TEMPLATE.sections]:
        assert title in text  # the 8 sections, in order
    assert [text.index(s.title.upper()) for s in TEMPLATE.sections] == sorted(text.index(s.title.upper()) for s in TEMPLATE.sections)
    labels = visible_labels(text)
    expected = [f.label for f in TEMPLATE.all_fields() if f.label in labels]
    assert labels == expected and len(labels) == len(set(labels))  # each field once, template order
    for label in labels:
        v = value(text, label)
        assert v, f"{label} is empty"
        if "Aucune" in v:
            assert v == ABSENT  # exactly the required wording
    said = " ".join(t for _c, t in ALL[name])
    for q in re.findall(r"« (.+?) »", text):
        assert q.rstrip("…") in said, q  # verbatim, never reworded
    assert not [f for f in note.flags if f["severity"] == "blocking"], note.flags
    assert value(text, "Date et heure de l'appel") == "14/10/2026 à 10:32 (horloge du poste)"


def test_movers_call():
    note = make_note(MOVERS)
    t = note.text
    assert "Movers · Appel entrant" in t.splitlines()[0]
    assert value(t, "Type d'appel").startswith("À confirmer — sens et type détecté(s) automatiquement")
    assert "Madame Durand" in value(t, "Nom et prénom") and value(t, "Nom et prénom").startswith("À confirmer")
    assert value(t, "Agent") == "À confirmer — entendu dans la conversation : Julie"
    assert "12 rue des Lilas à Lyon" in value(t, "Adresse ou nouvelle adresse")
    assert value(t, "Date de déménagement").startswith("le 15 mars")
    assert "centrale" in value(t, "Matériel sur place")
    assert "audit" in value(t, "Audit")
    assert value(t, "Numéro WO").startswith("À confirmer") and "458213" in value(t, "Numéro WO")
    assert "contrat est conservé" in value(t, "Situation contractuelle ou résiliation")
    assert "un mois d'abonnement offert" in value(t, "Offre commerciale")
    assert "nouveaux propriétaires" in value(t, "Contact repreneur ou tiers")
    assert value(t, "Rendez-vous").startswith("Fixé : « J'ai programmé l'audit, le technicien passera le 10 mars")
    actions = value(t, "Actions restantes (responsable)")
    assert "transmettre leurs coordonnées au service commercial. » — responsable : conseiller" in actions
    assert "attestation de vente du logement. » — responsable : client" in actions
    assert "attestation" in value(t, "Documents attendus")
    assert "matin" in value(t, "Contraintes signalées")
    assert "dossier est en cours" in value(t, "État du dossier")
    assert value(t, "Décision du client") == "Accord : « D'accord, ça me va. »"


def test_frontline_call():
    t = make_note(FRONTLINE).text
    assert "Frontline · Appel entrant" in t.splitlines()[0]
    for movers_only in ("Numéro WO", "Adresse ou nouvelle adresse", "Offre commerciale", "Interlocuteur visé"):
        assert f"{movers_only} :" not in t  # conditional fields: only for their type
    assert "sonne toutes les nuits" in value(t, "Demande du client")
    assert "déjà appelé" in value(t, "Historique utile")
    assert "→ « Le défaut n'apparaissait pas encore" in value(t, "Réponses fournies")
    assert "pile faible" in value(t, "Explications apportées")
    assert value(t, "Actions réellement effectuées") == "« J'ai envoyé une nouvelle pile par courrier. »"
    assert "sous 48 heures. » — responsable : Sector Alarm (envoi)" in value(t, "Actions restantes (responsable)")
    assert value(t, "Échéance ou rappel").startswith("sous 48 h")
    assert value(t, "Solutions proposées") == ABSENT and value(t, "Nom et prénom") == ABSENT


def test_outgoing_call():
    t = make_note(OUTGOING).text
    assert "Appel sortant" in t.splitlines()[0]
    assert "Monsieur Martin" in value(t, "Interlocuteur visé")
    assert "au sujet de votre demande de caméra" in value(t, "Objectif de l'appel sortant")
    assert value(t, "Agent") == "À confirmer — entendu dans la conversation : Thomas"
    assert value(t, "Demande du client") == ABSENT  # the refusal is not a request
    assert value(t, "Décision du client").startswith("Refus : « Non merci")
    assert "9 euros par mois" in value(t, "Solutions proposées")


def test_call_without_enough_information():
    note = make_note(INSUFFICIENT)
    assert note.no_usable_content and note.text == NO_CONTENT_TEXT
    assert any(f["code"] == "conversation_insuffisante" for f in note.flags)


def test_contradictions_are_reported_without_choosing():
    note = make_note(CONTRADICTORY)
    t = note.text
    phone = value(t, "Numéro de téléphone")
    assert phone.startswith("Contradiction à vérifier") and "06 12 34 56 78" in phone and "06 12 34 56 79" in phone
    move = value(t, "Date de déménagement")
    assert move.startswith("Contradiction à vérifier") and "le 3 avril" in move and "le 10 avril" in move
    decision = value(t, "Décision du client")
    assert decision.startswith("Contradiction à vérifier") and "je garde le contrat" in decision and "je préfère résilier" in decision
    assert sum("versions contradictoires" in p for p in note.points_to_verify) == 3


def test_several_follow_up_actions_with_their_owner_and_deadline():
    t = make_note(MULTI_FOLLOW_UP).text
    actions = value(t, "Actions restantes (responsable)").splitlines()
    owners = [a.rsplit("responsable : ", 1)[1] for a in actions]
    assert owners == ["conseiller", "client", "technicien", "conseiller", "client"]
    deadlines = value(t, "Échéance ou rappel")
    for d in ("sous 5 jours", "demain", "vendredi"):
        assert d in deadlines
    assert "enveloppe" in value(t, "Documents attendus") and "photo du clavier" in value(t, "Documents attendus")
    assert "5 action(s) de suivi" in value(t, "Résultat de l'appel")


# ---------------------------------------------------------------- authorised metadata


def test_call_type_chosen_by_the_advisor():
    t = make_note(FRONTLINE, direction="sortant", variant="movers").text
    assert value(t, "Type d'appel") == "Appel sortant — Movers (choisi par le conseiller)"
    assert "Interlocuteur visé :" in t and "Numéro WO :" in t  # fields of both types


def test_agent_and_date_come_from_the_pc_not_from_the_conversation():
    turns = FRONTLINE + [("system", "Nous sommes le 3 mars, il est 8 h."), ("mic", "Je suis Paul, au revoir.")]
    t = make_note(turns, agent_name="Marc D.").text
    assert value(t, "Agent") == "Marc D. (paramètre du poste)"
    assert value(t, "Date et heure de l'appel") == "14/10/2026 à 10:32 (horloge du poste)"
    t = make_note(turns, started_at=None).text
    assert value(t, "Date et heure de l'appel") == ABSENT  # never taken from the conversation


def test_uncertain_passage_is_marked():
    t = make_note(FRONTLINE, uncertain={1}).text
    assert "À confirmer (passage mal compris) : « Bonjour, ma centrale sonne" in t
    assert "passage(s) de la transcription mal compris" in value(t, "Informations complémentaires")


# ---------------------------------------------------------------- automatic check


def filled(**values):
    v = {f.id: FieldValue.absent() for f in TEMPLATE.all_fields()}
    v.update(values)
    return FilledNote(TEMPLATE, "entrant", "frontline", "choisi par le conseiller", v)


TRANSCRIPT = "Bonjour, je voudrais résilier. Je vous propose deux mois offerts. Mon numéro est le 06 11 22 33 44."


def test_check_normalises_absent_wording_and_missing_fields():
    note = filled(historique=FieldValue("present", ["Non précisé"]), situation=FieldValue("present", []))
    del note.values["contraintes"]
    flags = check(note, TRANSCRIPT)
    text = render(note)
    assert value(text, "Historique utile") == ABSENT and value(text, "Situation actuelle") == ABSENT
    assert value(text, "Contraintes signalées") == ABSENT
    assert any(f["code"] == "champs_manquants" and "Contraintes signalées" in f["message"] for f in flags)
    assert any(f["code"] == "absents_normalises" for f in flags)


def test_check_flags_unreliable_or_unsupported_data():
    note = filled(
        nom=FieldValue("present", ["Jean Dupont"], source="claude"),
        telephone=FieldValue("present", ["06 11 22 33 44"], source="claude"),
        date_heure=FieldValue("present", ["3 mars 2026"], source="claude"),
        solutions=FieldValue("present", ["Trois mois offerts pour 49 euros"], source="claude"),
        demande=FieldValue("present", ["« je voudrais résilier mon contrat »"], source="claude"),
        actions_effectuees=FieldValue("present", ["Je vous propose deux mois offerts"], source="claude"),
    )
    flags = {f["code"]: f for f in check(note, TRANSCRIPT, "")}
    assert note.values["nom"].status == "uncertain" and note.values["telephone"].status == "uncertain"
    assert note.values["date_heure"].status == "absent" and "source_non_autorisee" in flags
    assert "49" in flags["chiffre_non_trouve"]["message"]
    assert "citation_introuvable" in flags
    assert "action_non_effectuee" in flags
    assert "pas_de_suite" in flags


def test_numbers_from_the_pc_are_an_authorised_source():
    note = filled(date_heure=FieldValue("present", ["14/10/2026 à 10:32 (horloge du poste)"], source="poste"))
    assert not [f for f in check(note, "rien", "14/10/2026 à 10:32") if f["code"] == "chiffre_non_trouve"]


# ---------------------------------------------------------------- central configuration


CUSTOM = """
version: test-1
title: CR TEST
call_types: {movers: {label: Movers, keywords: [déménage]}, frontline: {label: Frontline}, autre: {label: Autre}}
directions: {entrant: Appel entrant, sortant: Appel sortant}
sections:
  - title: Bloc A
    fields:
      - {id: demande, label: Ce que veut le client, rule: {quotes: {speaker: remote, markers: [je voudrais], max: 1}}}
      - {id: piece, label: Pièce concernée, when: [movers], rule: {quotes: {speaker: any, markers: [salon, garage], max: 1}}}
  - title: Bloc B
    fields:
      - {id: rien, label: Champ sans règle}
"""


def test_template_is_configuration(tmp_path):
    path = tmp_path / "phone_call_template.yaml"
    path.write_text(CUSTOM, encoding="utf-8")
    t = load_template(path)
    turns = [("system", "Bonjour, je voudrais changer le détecteur du garage parce que je déménage bientôt.")]
    text = summarize(segs(turns * 3), CallContext(duration_s=10), CATEGORIES, t).text
    assert text.startswith("CR TEST — Movers")
    assert "BLOC A" in text and "BLOC B" in text
    assert value(text, "Ce que veut le client").startswith("« Bonjour, je voudrais changer")
    assert "garage" in value(text, "Pièce concernée") and value(text, "Champ sans règle") == ABSENT
    frontline = summarize(segs([("system", "Bonjour, je voudrais changer le badge de mon garage, merci beaucoup.")] * 3),
                          CallContext(variant="frontline"), CATEGORIES, t).text
    assert "Pièce concernée" not in frontline


def test_template_location_and_validation(tmp_path, monkeypatch):
    s = Settings(environment=Environment.TEST)
    assert template_path(s).name == "phone_call_template.yaml" and template_path(s).parent.name == "template"
    monkeypatch.setattr(config_module, "install_dir", lambda: tmp_path)
    monkeypatch.setattr("phonecall_desktop.notes.template.install_dir", lambda: tmp_path)
    (tmp_path / "phone_call_template.yaml").write_text(CUSTOM, encoding="utf-8")
    assert template_path(s) == tmp_path / "phone_call_template.yaml"  # copy next to the .exe wins
    assert template_path(s.model_copy(update={"note_template": tmp_path / "x.yaml"})) == tmp_path / "x.yaml"
    bad = tmp_path / "bad.yaml"
    bad.write_text(CUSTOM.replace("id: rien", "id: demande"), encoding="utf-8")
    with pytest.raises(ValueError, match="duplicate"):
        load_template(bad)


def test_default_template_has_the_required_structure():
    assert [s.title for s in TEMPLATE.sections] == [
        "1. Identification de l'appel", "2. Motif de l'appel", "3. Situation du client",
        "4. Échanges et informations communiquées", "5. Actions et solutions apportées", "6. Résultat de l'appel",
        "7. Suivi et prochaines étapes", "8. Informations complémentaires"]
    movers = {f.label for f in TEMPLATE.all_fields() if f.when == frozenset({"movers"})}
    assert movers == {"Adresse ou nouvelle adresse", "Date de déménagement", "Matériel sur place", "Audit", "Numéro WO",
                      "Situation contractuelle ou résiliation", "Offre commerciale", "Contact repreneur ou tiers"}
    assert {f.label for f in TEMPLATE.all_fields() if f.when == frozenset({"sortant"})} == {
        "Interlocuteur visé", "Objectif de l'appel sortant"}


# ---------------------------------------------------------------- application


def test_factory_and_production_accept_local_mode():
    s = Settings(environment=Environment.PRODUCTION, notes_client="local", agent_name="Julie")
    s.assert_safe()
    client = build_note_client(s)
    assert isinstance(client, LocalSummaryNoteClient) and client.describe()["fields"] == len(TEMPLATE.all_fields())


def test_end_to_end_session_keeps_transcript_and_note_separate(tmp_path):
    generate_wav("demenagement", tmp_path)
    s = Settings(environment=Environment.TEST, audio_backend="test-files", recognizer="scripted", notes_client="local",
                 require_consent_confirmation=False)
    ctl = SessionController(s, SyntheticFileBackend(tmp_path, speed=8), ScriptedRecognizer.from_file(tmp_path / "demenagement.script.json"),
                            build_note_client(s))
    ctl.start(StartRequest(call_direction="entrant", call_type="movers"))
    deadline = time.time() + 60
    while ctl.state == State.CAPTURING and time.time() < deadline:
        if len(ctl.assembler.final_segments()) >= len(SCENARIOS["demenagement"]) - 1:
            break
        time.sleep(0.1)
    ctl.stop()
    while ctl.state not in {State.DONE, State.ERROR} and time.time() < deadline:
        time.sleep(0.05)
    assert ctl.state == State.DONE, ctl.error
    assert value(ctl.note_text, "Type d'appel") == "Appel entrant — Movers (choisi par le conseiller)"
    assert value(ctl.note_text, "Date et heure de l'appel").endswith("(horloge du poste)")
    snap = ctl.snapshot()
    assert snap["note"] == ctl.note_text and len(snap["transcript"]) >= 8  # raw transcript kept beside the note
    assert snap["transcript"][1]["text"].startswith("Bonjour, je vous appelle parce que je déménage")


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
