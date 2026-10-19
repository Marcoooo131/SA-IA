"""« Mettre en forme la transcription »: any transcript (current call or pasted) → team Phone Call, by script."""

from fastapi.testclient import TestClient

from phonecall_desktop.audio.devices import SyntheticFileBackend
from phonecall_desktop.audio.types import Channel
from phonecall_desktop.config import Environment, Settings
from phonecall_desktop.notes.formatter import load_facts, match_facts, third_person
from phonecall_desktop.notes.local_summary import LocalSummaryNoteClient, split_sentences
from phonecall_desktop.notes.template import load_template
from phonecall_desktop.session import SessionController
from phonecall_desktop.stt.scripted import ScriptedRecognizer
from phonecall_desktop.synthetic import generate_wav
from phonecall_desktop.transcript.enhancer import TextEnhancer
from phonecall_desktop.transcript.parse import parse_transcript_text
from phonecall_desktop.web.server import Hub, create_app

# Anonymised copy of a real takeover call (names, street and number are fictitious; recognition
# errors kept: number dictated in pieces, wrong read-back, misheard words)
TAKEOVER = """[00:03] Conseiller : Sector Alarm, télésurveillance, déménagement
[00:06] Interlocuteur : oui bonjour j'aimerais transférer le contact d'une personne qui donc moi je suis été chez Sector Alarm et il va reprendre mon contrat
[00:14] Conseiller : D'accord
[00:18] Interlocuteur : donc j'aimerais vous transmettre son contact afin que vous puissiez le contacter au plus vite parce que du coup il en a besoin là il a emménagé dans la maison
[00:30] Conseiller : OK, ça marche, parce qu'attendez là, avec votre numéro de téléphone, j'ai deux comptes clients qui s'affichent
[00:36] Interlocuteur : c'est 12 bis, 12 bis Rue des Tieuls avec fait sur main
[00:39] Conseiller : OK, on en a deux, du val, Léa
[00:42] Interlocuteur : C'est ça
[00:53] Conseiller : Monsieur, pour enlucleriser le système
[00:57] Conseiller : et donc faudrait mettre une nouvelle personne, c'est ça ?
[01:01] Interlocuteur : C'est ça
[01:02] Conseiller : Ok, je vais prendre le contact, s'il vous plaît.
[01:20] Interlocuteur : 0649
[01:26] Interlocuteur : 98 12
[01:28] Conseiller : Oui.
[01:30] Interlocuteur : 34
[01:32] Conseiller : Alors 064, 998, 1234.
[01:37] Interlocuteur : 06, 39, 98, 12, 34 et c'est Monsieur Garnier, GA, GA RN, IER, comme garnier
[01:47] Interlocuteur : et Bastien son prénom
[01:49] Conseiller : Bas tiens, ça marche.
[01:50] Conseiller : Ce serait pour une reprise à la même adresse ou à une autre.
[01:53] Interlocuteur : oui, la même adresse, vous pouvez l'appeler rapidement
[01:56] Conseiller : Ça marche, là je demande à ce qu'on l'appelle tout de suite.
[01:59] Interlocuteur : OK, magnifique, je vous remercie
[02:01] Conseiller : Merci à vous, je souhaite une bonne journée.
[02:03] Interlocuteur : Bonne journée, au revoir"""

EXPECTED = """Interlocuteur :
Nom : Non communiqué
Numéro de téléphone : Non communiqué
Agent : Non communiqué
Raison de l'appel :
Déménagement : Oui
Raison Résiliation : Reprise du contrat par le nouvel occupant (changement d'occupant)
Situation :
Matériel sur place : Installation Sector Alarm déjà en place au logement
Audit : Non communiqué
Numéro WO : Non communiqué
Date de déménagement : Déjà réalisé
Réponse apporté :
Date de rendez-vous : Aucun rendez-vous fixé (demande de rappel du repreneur transmise)
Offre commercial : Non communiqué
Contact Repreneurs : Bastien Garnier — 06 39 98 12 34
Informations Complémentaires :
Le client souhaite transmettre le contact du repreneur, qui va reprendre son contrat.
Le client est déjà équipé chez Sector Alarm.
Le nouvel occupant a déjà emménagé dans le logement.
Le client demande que le repreneur soit contacté au plus vite.
Le conseiller trouve deux comptes clients associés au numéro de téléphone du client.
La reprise concerne la même adresse que l'installation actuelle.
Le conseiller a transmis une demande de rappel immédiat du repreneur.
Adresse concernée : 12 bis Rue des Tieuls (orthographe à vérifier).
Durée de l'appel : 2 min 04 s (horloge du poste)"""

TOKEN, PORT = "t" * 43, 5557


def controller(tmp_path, **kw):
    generate_wav("demenagement", tmp_path)
    s = Settings(**{"environment": Environment.TEST, "audio_backend": "test-files", "recognizer": "scripted",
                    "notes_client": "local", **kw})
    return SessionController(s, SyntheticFileBackend(tmp_path, speed=20),
                             ScriptedRecognizer.from_file(tmp_path / "demenagement.script.json"),
                             LocalSummaryNoteClient([], "", load_template()))


def test_pasted_transcript_is_read_back_into_segments():
    text = TAKEOVER.splitlines()
    segs = parse_transcript_text("\n".join(text[:2] + ["la suite de la même phrase …", "Client - merci"]),
                                 TextEnhancer())
    assert [s.channel for s in segs] == [Channel.MIC, Channel.SYSTEM, Channel.SYSTEM]
    assert segs[1].text.startswith("Oui bonjour j'aimerais transférer") and segs[1].t_start == 6
    assert segs[1].text.endswith("la suite de la même phrase.")  # continuation line, « … » removed
    assert parse_transcript_text("\n  \n") == []


def test_takeover_call_is_written_like_the_team_example(tmp_path):
    r = controller(tmp_path).format_transcript(TAKEOVER, None)
    assert r["engine"] == "script" and r["cost_usd"] == 0
    assert r["text"] == EXPECTED
    codes = {f["code"] for f in r["flags"]}
    assert "numero_variantes" in codes and not [f for f in r["flags"] if f["severity"] == "blocking"]


def test_rules_need_their_context():
    facts = load_facts()
    sentences = split_sentences(parse_transcript_text(
        "Interlocuteur : je voudrais résilier mon contrat, c'est urgent\nConseiller : on va vous rappeler demain"))
    found = match_facts(facts, sentences)
    assert {"resiliation", "besoin_urgent", "rappel_client"} <= set(found)
    assert not {"reprise_contrat", "besoin_urgent_repreneur", "rappel_repreneur", "meme_adresse"} & set(found)


def test_first_person_is_rewritten():
    assert third_person("« Donc j'aimerais garder mon alarme »") == "Le client souhaite garder son alarme"
    assert third_person("je vais prendre le contact", "le conseiller") == "Le conseiller va prendre le contact"


def test_format_endpoint(tmp_path):
    c = TestClient(create_app(controller(tmp_path), TOKEN, lambda: PORT, Hub()), base_url=f"http://127.0.0.1:{PORT}")
    c.cookies.set("pcd_session", TOKEN)
    c.headers["X-PCD-Token"] = TOKEN
    r = c.post("/api/format", json={"text": TAKEOVER, "variant": "movers"})
    assert r.status_code == 200 and r.json()["text"] == EXPECTED
    assert c.post("/api/format", json={"text": "   "}).status_code == 400
