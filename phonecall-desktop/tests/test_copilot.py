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
from phonecall_desktop.notes.template import CallContext, load_template
from phonecall_desktop.session import SessionController, StartRequest, State
from phonecall_desktop.stt.scripted import ScriptedRecognizer
from phonecall_desktop.synthetic import SCENARIOS, generate_wav
from phonecall_desktop.transcript.assembler import Segment
from phonecall_desktop.web.server import Hub, create_app

T = load_template()
CATEGORIES = load_categories(Settings(environment=Environment.TEST))
CLOCK = time.mktime((2026, 10, 14, 10, 32, 0, 0, 0, -1))
ABSENT = "Aucune information notifiée"


def segs(turns):
    return [Segment(f"u{i}", Channel(ch), i * 5.0, i * 5.0 + 4, text, final=True) for i, (ch, text) in enumerate(turns)]


def ctx(**kw):
    return CallContext(**{"started_at": CLOCK, "duration_s": 95, **kw})


def answer_for(prompt, **values):
    """A well-formed answer: every expected field, absent unless given."""
    lines = [prompt.title]
    current = None
    for f in prompt.fields:
        section = next(s.title.upper() for s in T.sections if f in s.fields)
        if section != current:
            lines += ["", section]
            current = section
        lines.append(f"{f.label} : {values.get(f.id, prompt.prefilled.get(f.id, ABSENT))}")
    return "\n".join(lines)


def test_prompt_contains_rules_template_metadata_and_transcript():
    p = build_prompt(T, segs(MOVERS), ctx(direction="entrant", variant="movers", agent_name="Julie M."), CATEGORIES)
    text = p.text
    assert f"écris exactement « {ABSENT} »" in text and "N'invente rien" in text
    assert "Actions réellement effectuées » : seulement ce qui a été fait" in text
    assert "Modèle à remplir :" in text and p.title in text
    assert "Date et heure de l'appel : 14/10/2026 à 10:32 (horloge du poste)" in text
    assert "Agent : Julie M. (paramètre du poste)" in text
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
    assert r["chars"] == len(r["prompt"]) and not r["too_long"] and "Agent : Julie M. (paramètre du poste)" in r["prompt"]
    assert c.post("/api/copilot/open").json() == {"opened": True, "url": "https://m365.cloud.microsoft/chat"}
    assert c.opened == ["https://m365.cloud.microsoft/chat"]  # the transcript is never in the URL
    answer = answer_for(c.ctl._copilot, demande="Transférer l'alarme dans la maison")
    state = c.post("/api/copilot/answer", json={"text": answer}).json()
    assert state["state"] == "done" and state["note"].startswith("COMPTE RENDU D'APPEL — Movers")
    assert "Transférer l'alarme dans la maison" in state["note"]
    assert any(f["code"] == "copilot" for f in state["note_meta"]["flags"])
    assert [s["text"] for s in state["transcript"]] == transcript_before  # the transcript is kept apart


def test_copilot_can_be_disabled(ended):
    ended.ctl.settings = ended.ctl.settings.model_copy(update={"copilot_enabled": False})
    assert ended.post("/api/copilot/prompt").status_code == 409
    assert ended.get("/api/state").json()["copilot_enabled"] is False


def test_only_https_urls_are_opened(ended):
    ended.ctl.settings = ended.ctl.settings.model_copy(update={"copilot_url": "http://intranet/chat"})
    assert ended.post("/api/copilot/open").status_code == 400 and ended.opened == []
