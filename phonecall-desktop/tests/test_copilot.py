"""Microsoft 365 Copilot Chat by copy and paste: prompt built from the template, answer checked."""

import time

import pytest
from call_scripts import FRONTLINE, MOVERS, OUTGOING
from fastapi.testclient import TestClient

from phonecall_desktop.audio.devices import SyntheticFileBackend
from phonecall_desktop.audio.types import Channel
from phonecall_desktop.config import Environment, Settings
from phonecall_desktop.factory import build_note_client
from phonecall_desktop.notes.business import load_categories
from phonecall_desktop.notes.copilot import build_prompt, check_answer
from phonecall_desktop.notes.local_summary import metadata_text, transcript_text
from phonecall_desktop.notes.template import DEFAULT_TEMPLATE, CallContext, load_template, section_heading
from phonecall_desktop.session import SessionController, StartRequest, State
from phonecall_desktop.stt.scripted import ScriptedRecognizer
from phonecall_desktop.synthetic import SCENARIOS, generate_wav
from phonecall_desktop.transcript.assembler import Segment
from phonecall_desktop.web.server import Hub, create_app

T = load_template(DEFAULT_TEMPLATE.with_name("phone_call_template_general.yaml"))  # 8-section option
TEAM = load_template()  # default: team format
CATEGORIES = load_categories(Settings(environment=Environment.TEST))
CLOCK = time.mktime((2026, 10, 14, 10, 32, 0, 0, 0, -1))
ABSENT = "Aucune information notifiée"


def segs(turns):
    return [Segment(f"u{i}", Channel(ch), i * 5.0, i * 5.0 + 4, text, final=True) for i, (ch, text) in enumerate(turns)]


def ctx(**kw):
    return CallContext(**{"started_at": CLOCK, "duration_s": 95, **kw})


def answer_for(prompt, template=T, **values):
    """A well-formed answer: every expected field, absent unless given."""
    lines = [prompt.title] if prompt.title else []
    current = None
    for f in prompt.fields:
        section = next(section_heading(template, s) for s in template.sections if f in s.fields)
        if section != current:
            lines += ["", section] if lines and template.blank_lines else [section]
            current = section
        if f.bare:
            if f.id in values:
                lines.append(values[f.id])
        else:
            lines.append(f"{f.label} : {values.get(f.id, prompt.prefilled.get(f.id, template.absent))}")
    return "\n".join(lines)


def test_prompt_contains_rules_template_metadata_and_transcript():
    p = build_prompt(T, segs(MOVERS), ctx(direction="entrant", variant="movers", agent_name="Julie M."), CATEGORIES)
    text = p.text
    assert f"écris exactement « {ABSENT} »" in text and "N'invente rien" in text
    assert "Distingue ce qui a été fait pendant l'appel, ce qui a seulement été proposé et ce qui reste à faire" in text
    assert "Modèle à remplir :" in text and p.title in text
    assert "Date et heure de l'appel : 14/10/2026 à 10:32 (horloge du poste)" in text
    assert "Agent : Julie M." in text
    assert "Type d'appel : Appel entrant — Movers (choisi par le conseiller)" in text
    assert "[00:05] Interlocuteur : Bonjour, je m'appelle Madame Durand" in text
    assert "[00:00] Conseiller : Sector Alarm bonjour" in text
    labels = [f.label for f in p.fields]
    assert "Numéro WO" in labels and "Interlocuteur visé" not in labels  # Movers fields, not outgoing ones
    skeleton = text.split("Modèle à remplir :", 1)[1].split("Transcription", 1)[0]
    assert [skeleton.index(f"\n{label} :") for label in labels] == sorted(skeleton.index(f"\n{label} :") for label in labels)
    assert len(text) < 16000


def test_outgoing_fields_when_detected_and_type_left_to_copilot():
    p = build_prompt(T, segs(OUTGOING), ctx(), CATEGORIES)
    labels = [f.label for f in p.fields]
    assert "Interlocuteur visé" in labels and "Objectif de l'appel sortant" in labels
    assert "type_appel" not in p.prefilled and "déterminé d'après la conversation" in p.text


def test_good_answer_passes_the_check():
    p = build_prompt(T, segs(MOVERS), ctx(direction="entrant", variant="movers"), CATEGORIES)
    answer = answer_for(p, demande="Transférer l'alarme pour le déménagement du 15 mars",
                        nom="À confirmer — entendu dans la conversation : Madame Durand",
                        numero_wo="À confirmer — entendu dans la conversation : 458213",
                        actions_effectuees="Audit programmé le 10 mars à 9 h (« J'ai programmé l'audit, le technicien passera le 10 mars à 9 h. »)",
                        rendez_vous="Audit le 10 mars à 9 h")
    text, flags, points = check_answer(T, p, answer, transcript_text(segs(MOVERS)), metadata_text(ctx()))
    assert not [f for f in flags if f["severity"] == "blocking"], flags
    assert text == answer and any("Nom et prénom" in pt for pt in points)


def test_answer_is_normalised_and_checked():
    turns = FRONTLINE
    p = build_prompt(T, segs(turns), ctx(direction="entrant", variant="frontline"), CATEGORIES)
    answer = answer_for(p, historique="Non précisé", situation="N/A",
                        solutions="Remise de 30 euros sur la facture",
                        actions_effectuees="Je vous propose d'envoyer un technicien",
                        nom="Jean Dupont",
                        date_heure="01/01/2020 à 08:00",
                        demande="« ma centrale explose tous les jours »").replace("Demande du client :", "**Demande du client :**")
    answer = answer.replace(f"Contraintes signalées : {ABSENT}\n", "")
    text, flags, points = check_answer(T, p, answer, transcript_text(segs(turns)), metadata_text(ctx()))
    codes = {f["code"] for f in flags}
    assert f"Historique utile : {ABSENT}" in text and f"Situation actuelle : {ABSENT}" in text
    assert "Date et heure de l'appel : 14/10/2026 à 10:32 (horloge du poste)" in text  # PC data restored
    assert "**" not in text
    assert {"champs_manquants", "chiffre_non_trouve", "action_non_effectuee", "valeur_poste_restauree",
            "citation_introuvable", "absents_normalises"} <= codes
    assert any("Contraintes signalées" in f["message"] for f in flags if f["code"] == "champs_manquants")
    assert any(pt.startswith("Nom et prénom") for pt in points)


def test_bullets_and_markdown_bullets_are_read():
    p = build_prompt(T, segs(MOVERS), ctx(direction="entrant", variant="movers"), CATEGORIES)
    answer = answer_for(p).replace(f"Actions restantes (responsable) : {ABSENT}",
                                   "Actions restantes (responsable) :\n* Envoyer l'attestation — responsable : client\n"
                                   "* Transmettre les coordonnées — responsable : conseiller")
    text, flags, _ = check_answer(T, p, answer, transcript_text(segs(MOVERS)), "")
    assert "- Envoyer l'attestation — responsable : client" in text
    assert "pas_de_suite" not in {f["code"] for f in flags}


def test_empty_answer():
    p = build_prompt(T, segs(MOVERS), ctx(), CATEGORIES)
    _, flags, _ = check_answer(T, p, "   ", "x", "")
    assert any(f["code"] == "reponse_vide" for f in flags)


# ---------------------------------------------------------------- application


@pytest.fixture
def ended(tmp_path, monkeypatch):
    generate_wav("demenagement", tmp_path)
    s = Settings(environment=Environment.TEST, audio_backend="test-files", recognizer="scripted", notes_client="local",
                 require_consent_confirmation=False, agent_name="Julie M.")
    ctl = SessionController(s, SyntheticFileBackend(tmp_path, speed=8),
                            ScriptedRecognizer.from_file(tmp_path / "demenagement.script.json"), build_note_client(s))
    opened = []
    monkeypatch.setattr("webbrowser.open", lambda url, new=0: opened.append(url) or True)
    client = TestClient(create_app(ctl, "t" * 43, lambda: 5557, Hub()), base_url="http://127.0.0.1:5557")
    client.cookies.set("pcd_session", "t" * 43)
    client.headers["X-PCD-Token"] = "t" * 43
    client.ctl, client.opened = ctl, opened
    return client


def run_call(ctl):
    ctl.start(StartRequest(call_direction="entrant", call_type="movers"))
    deadline = time.time() + 60
    while ctl.state == State.CAPTURING and time.time() < deadline:
        if len(ctl.assembler.final_segments()) >= len(SCENARIOS["demenagement"]) - 1:
            break
        time.sleep(0.1)
    ctl.stop()
    while ctl.state not in {State.DONE, State.ERROR} and time.time() < deadline:
        time.sleep(0.05)
    assert ctl.state == State.DONE


def test_copilot_endpoints(ended):
    c = ended
    assert c.post("/api/copilot/prompt").status_code == 409  # not before the end of the call
    assert c.post("/api/copilot/answer", json={"text": "x"}).status_code == 409
    run_call(c.ctl)
    transcript_before = [s["text"] for s in c.get("/api/state").json()["transcript"]]
    r = c.post("/api/copilot/prompt").json()
    assert r["chars"] == len(r["prompt"]) and not r["too_long"] and "\nAgent : Julie M.\n" in r["prompt"]
    assert c.post("/api/copilot/open").json() == {"opened": True, "url": "https://m365.cloud.microsoft/chat"}
    assert c.opened == ["https://m365.cloud.microsoft/chat"]  # the transcript is never in the URL
    answer = answer_for(c.ctl._copilot, TEAM, demenagement="Oui, déménagement dans une maison plus grande")
    state = c.post("/api/copilot/answer", json={"text": answer}).json()
    assert state["state"] == "done" and state["note"].startswith("Interlocuteur :\nNom : Non communiqué")
    assert "Déménagement : Oui, déménagement dans une maison plus grande" in state["note"]
    assert "Agent : Julie M." in state["note"]
    assert any(f["code"] == "copilot" for f in state["note_meta"]["flags"])
    assert [s["text"] for s in state["transcript"]] == transcript_before  # the transcript is kept apart


def test_copilot_can_be_disabled(ended):
    ended.ctl.settings = ended.ctl.settings.model_copy(update={"copilot_enabled": False})
    assert ended.post("/api/copilot/prompt").status_code == 409
    assert ended.get("/api/state").json()["copilot_enabled"] is False


def test_only_https_urls_are_opened(ended):
    ended.ctl.settings = ended.ctl.settings.model_copy(update={"copilot_url": "http://intranet/chat"})
    assert ended.post("/api/copilot/open").status_code == 400 and ended.opened == []


# ---------------------------------------------------------------- team format (default template)

from call_scripts import TEAM_EXAMPLE  # noqa: E402

from phonecall_desktop.stt.streaming import is_hallucination, vocabulary_terms  # noqa: E402

# Phone Call written by the team for TEAM_EXAMPLE (anonymised like the transcript): the expected answer.
TEAM_ANSWER = """Interlocuteur :
Nom : Non communiqué
Numéro de téléphone : Non communiqué
Agent : Julien
Raison de l'appel :
Déménagement : Oui, déménagement à 1 km de l'adresse actuelle
Raison Résiliation : Aucune (demande de transfert de l'installation)
Situation :
Matériel sur place : Matériel existant laissé sur place. Nouveau matériel installé à la nouvelle adresse sans frais.
Audit : Nouveau logement prêt, électricité disponible, aucun gros travaux à prévoir.
Numéro WO : Non communiqué
Date de déménagement : Emménagement prévu autour du 29 octobre
Réponse apporté :
Date de rendez-vous : 30 octobre
Offre commercial : Installation du nouveau matériel sans frais. Possibilité de bénéficier de 2 mois offerts si les futurs occupants reprennent l'installation existante.
Contact Repreneurs : Logement actuel en location via l'agence Exemple Immobilier. Sector Alarm prendra contact avec l'agence et/ou les futurs locataires pour proposer la reprise du matériel.
Informations Complémentaires :
Le client possède déjà son nouveau logement et souhaitait savoir si l'installation pouvait être réalisée avant le déménagement.
Explication donnée sur le process Movers : conservation ou reprise du matériel existant selon la décision de l'agence/propriétaire/futurs occupants.
Si le matériel n'est pas repris, il sera retiré et recyclé sans impact pour le client.
Le client indiquera à l'agence la présence du système d'alarme.
Rendez-vous du 30 octobre validé par le client."""


def team_segments():
    terms = vocabulary_terms(Settings().vocabulary)
    return segs([(c, t) for c, t in TEAM_EXAMPLE if t and not is_hallucination(t, terms)])


def test_team_prompt_follows_the_team_format():
    p = build_prompt(TEAM, team_segments(), ctx(direction="sortant", variant="movers"), CATEGORIES)
    text = p.text
    skeleton = text.split("Modèle à remplir :", 1)[1].split("Transcription", 1)[0].strip().splitlines()
    assert skeleton[:4] == ["Interlocuteur :", "Nom :", "Numéro de téléphone :", "Agent :"]
    assert "Réponse apporté :" in skeleton and "Offre commercial :" in skeleton and "Contact Repreneurs :" in skeleton
    assert "Interlocuteur visé :" not in skeleton  # outgoing-only fields are not used for Movers
    assert "Exemple de Phone Call attendu" in text and "Agent : Camille" in text  # the example, as a model of form
    assert "écris exactement « Non communiqué »" in text and "séparés par « ; »" in text
    assert "Sector Alarm\n" not in text.split("Transcription", 1)[1]  # artefact lines removed before the prompt
    assert len(text) < 16000


def test_team_answer_passes_the_check():
    p = build_prompt(TEAM, team_segments(), ctx(direction="sortant", variant="movers"), CATEGORIES)
    text, flags, points = check_answer(TEAM, p, TEAM_ANSWER, transcript_text(team_segments()), metadata_text(ctx()))
    assert text == TEAM_ANSWER
    assert not [f for f in flags if f["severity"] == "blocking"], flags
    assert {f["code"] for f in flags} == {"copilot"}


def test_team_answer_with_invented_figure_is_flagged():
    p = build_prompt(TEAM, team_segments(), ctx(direction="sortant", variant="movers"), CATEGORIES)
    bad = TEAM_ANSWER.replace("Date de rendez-vous : 30 octobre", "Date de rendez-vous : 12 novembre").replace(
        "Numéro WO : Non communiqué", "Numéro WO : N/A")
    text, flags, _ = check_answer(TEAM, p, bad, transcript_text(team_segments()), "")
    assert "Numéro WO : Non communiqué" in text
    assert any(f["code"] == "chiffre_non_trouve" and "12" in f["message"] for f in flags)
