"""Reading the requests (category, identifiers), finding the client when the Regarding is empty,
and the 1:1 rotation per category — on FICTITIOUS data shaped like the recorded examples."""

from __future__ import annotations

import sqlite3
from dataclasses import replace

import pytest

from movers_dispatch.config import parse
from movers_dispatch.engine import Agent, RunBlocked
from movers_dispatch.fake import USERS, FakeCrm, demo_config
from movers_dispatch.journal import Journal
from movers_dispatch.models import Email, Mode, Status
from movers_dispatch.reading import categorize, extract, html_to_text, phone_variants

CFG = demo_config()


def make(crm: FakeCrm | None = None, **cfg):
    crm = crm or FakeCrm()
    return Agent(demo_config(**cfg), crm, Journal(":memory:")), crm


def row(agent, qid):
    return agent.journal.item(qid)


# ------------------------------------------------------------------ reading
@pytest.mark.parametrize("subject,text,kind,expected", [
    ("Chatbot customer request: Termination of contract due to moving", "", "task", "resiliation"),
    ("Moving - CS", "suite déménagement monsieur veut résilier le contrat", "task", "resiliation"),
    ('You\'ve got a new submission on the HubSpot Form "[FR] - CS | Moving Home"', "Votre nouvelle adresse", "email", "demenagement"),
    ("Résiliation Sector alarme", "", "email", "resiliation"),
    ("Résiliation suite décès", "", "email", "resiliation"),
    ("RE: Désactivation Alarme 58 rue de la Démo", "", "email", "resiliation"),
    ("Termination of contract due to moving", "", "email", "resiliation"),   # résiliation checked first
    ("Voir document joint", "", "email", None),
])
def test_categories(subject, text, kind, expected):
    assert categorize(CFG, Email("x", subject, None, kind, text=text))[0] == expected


def test_identifiers_are_read_like_the_recorded_examples():
    text = html_to_text(
        "<p>Voici les références :</p><p>Numéro de client : 10008705</p>"
        "<div>Email</div><div>client.demo@icloud.example</div>"
        "<p>Le mar. 20 oct., Sector Alarm - Movers &lt;movers@sectoralarm.fr&gt; a écrit</p>"
        "<p>Phone: +33600000014 ; fixe 01 40 00 00 00</p>"
        "<a href='https://eur03.safelinks.protection.outlook.com/?url=movers%40sectoralarm.fr'>lien</a>")
    sig = extract(CFG, Email("x", "Re : client n° 10012345", None, text=text, sender="noreply@notifications.hubspot.com"))
    assert sig.sender == []                                       # HubSpot / Sector Alarm addresses ignored
    assert sig.emails == ["client.demo@icloud.example"]
    assert sig.numbers == ["10012345", "10008705"]
    assert sig.phones == ["0600000014", "0140000000"]
    assert "06 00 00 00 14" in phone_variants("0600000014") and "+33600000014" in phone_variants("0600000014")


# ------------------------------------------------------------------ finding the client
def test_client_found_by_sender_is_linked_then_worked_by_after_approval():
    agent, crm = make()
    qid = crm.add("a", "Résiliation Sector alarme", "Client fictif", [("CAS-1", "chloe", 2)], regarding_entity=None,
                  sender="client.fictif@example.com", account_emails=["Client.Fictif@example.com"])
    agent.run(Mode.SUPERVISED)
    r = row(agent, qid)
    assert r["status"] == Status.AWAITING_APPROVAL.value and r["client_name"].startswith("Client fictif")
    assert "adresse de l'expéditeur cl•••@example.com" in r["client_via"] and crm.writes == 0
    assert r["worked_by_name"] == "Chloé"                         # owner of the account's Mover case
    out = agent.approve(qid, "marc-antoine")
    assert out["status"] == Status.ASSIGNED.value
    email_id = crm.items[qid].object.id
    assert crm.regarding_log == [(email_id, crm.emails[email_id].regarding.id)]
    assert crm.emails[email_id].regarding.entity == "account" and crm.items[qid].worker.id == USERS["chloe"].id
    actions = [e["action"] for e in reversed(agent.journal.events(qid))]     # oldest first
    assert actions.index("regarding_verifie") < actions.index("ecriture_worked_by")


def test_client_found_by_customer_number_and_by_hubspot_email():
    agent, crm = make()
    q1 = crm.add("a", "RE: Désactivation", "Client A", [], regarding_entity=None, account_number="10008799",
                 sender="agence@autre.example", text="Numéro de client : 10008799")
    q2 = crm.add("b", "You've got a new submission on the HubSpot Form \"[FR] - CS | Moving Home\"", "Client B", [],
                 regarding_entity=None, sender="noreply@notifications.hubspot.com", account_emails=["b@example.com"],
                 text="Email\nb@example.com\nVotre nouvelle adresse")
    agent.run(Mode.SIMULATION)
    assert "n° client écrit dans le texte 10008799" in row(agent, q1)["client_via"]
    assert row(agent, q2)["client_name"].startswith("Client B") and row(agent, q2)["category"] == "demenagement"
    assert crm.writes == 0


def test_no_client_or_contradictory_identifiers_go_to_review():
    agent, crm = make()
    crm.add_account("x", "Autre client", number="10000001")
    q1 = crm.add("a", "Bonjour", None, [], regarding_entity=None, sender="inconnu@example.com", text="")
    q2 = crm.add("b", "Résiliation", "Client B", [], regarding_entity=None, sender="b@example.com",
                 account_emails=["b@example.com"], text="Numéro de client : 10000001")      # number of another account
    crm.add_account("y1", "Homonyme 1", emails=["commun@example.com"])
    crm.add_account("y2", "Homonyme 2", emails=["commun@example.com"])
    q3 = crm.add("c", "Résiliation", None, [], regarding_entity=None, sender="commun@example.com")
    agent.run(Mode.SUPERVISED)
    assert "aucun compte actif" in row(agent, q1)["reason"]
    assert "contradictoires" in row(agent, q2)["reason"]
    assert "correspond à 2 comptes" in row(agent, q3)["reason"]
    assert all(row(agent, q)["status"] == Status.REVIEW.value and row(agent, q)["client_to_link"] == 1 for q in (q1, q2, q3))
    assert crm.writes == 0


def test_link_client_by_account_number_then_proposal():
    agent, crm = make()
    qid = crm.add("a", "Résiliation", "Client A", [("CAS-1", "kader", 0)], regarding_entity=None, account_number="10070001",
                  sender="perdu@example.com")
    agent.run(Mode.SUPERVISED)
    assert row(agent, qid)["status"] == Status.REVIEW.value
    with pytest.raises(RunBlocked, match="0 compte"):
        agent.link_client(qid, "99999999", "local")
    r = agent.link_client(qid, "10070001", "local", "trouvé par le téléphone")
    assert r["status"] == Status.AWAITING_APPROVAL.value and r["worked_by_name"] == "Kader"
    assert crm.emails[crm.items[qid].object.id].regarding.entity == "account" and crm.items[qid].worker is None
    sup = agent.journal.supervision(100)
    assert sup["manuelles"] == 1 and sup["corrigees"] == 0          # nothing had been proposed: not an agent error


def test_correcting_a_proposed_client_counts_as_a_correction():
    agent, crm = make()
    crm.add_account("good", "Bon client", number="10070002")
    qid = crm.add("a", "Résiliation", "Mauvais client", [], regarding_entity=None, sender="m@example.com",
                  account_emails=["m@example.com"])
    agent.run(Mode.SUPERVISED)
    agent.link_client(qid, "10070002", "local", "même adresse que son conjoint")
    sup = agent.journal.supervision(100)
    assert sup["corrigees"] == 1 and sup["corrections"][0]["retenu"].startswith("client Bon client")


def test_regarding_never_overwritten_and_simulation_writes_nothing():
    agent, crm = make()
    qid = crm.add("a", "Résiliation", "Client A", [], regarding_entity=None, sender="a@example.com",
                  account_emails=["a@example.com"])
    agent.run(Mode.SUPERVISED)
    eid = crm.items[qid].object.id
    crm.emails[eid] = replace(crm.emails[eid], regarding=crm.emails[eid].regarding or None)
    other = crm.add_account("o", "Autre", number="10070003")
    from movers_dispatch.models import Lookup
    crm.emails[eid] = replace(crm.emails[eid], regarding=Lookup(other, "account", "Autre"))   # filled meanwhile
    out = agent.approve(qid, "local")
    assert out["status"] != Status.ASSIGNED.value and crm.writes == 0


def test_automatic_mode_keeps_client_links_for_a_human_by_default():
    agent, crm = make(automatic_allowed=True)
    qid = crm.add("a", "Résiliation", "Client A", [("CAS-1", "kader", 0)], regarding_entity=None, sender="a@example.com",
                  account_emails=["a@example.com"])
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert row(agent, qid)["status"] == Status.AWAITING_APPROVAL.value and crm.writes == 0


def test_client_search_switched_off_when_its_columns_are_missing():
    agent, crm = make()
    crm.client_problems = ["la colonne account.telephone3 n'existe pas"]
    q_wb = crm.add("a", "s", "Client A", [("CAS-1", "kader", 0)])            # regular element: still processed
    q_cl = crm.add("b", "Résiliation", "Client B", [], regarding_entity=None, sender="b@example.com",
                   account_emails=["b@example.com"])
    agent.run(Mode.SIMULATION)
    assert row(agent, q_wb)["status"] == Status.PROPOSED.value
    assert "Regarding" in row(agent, q_cl)["reason"] and agent.state.warnings


# ------------------------------------------------------------------ rotation
def test_rotation_turns_one_for_one_per_category_and_skips_absents():
    agent, crm = make(automatic_allowed=True)
    res = [crm.add(f"r{n}", f"Chatbot customer request: Termination of contract ({n})", f"Client R{n}", [], kind="task")
           for n in range(5)]
    dem = [crm.add(f"d{n}", "HubSpot Moving Home", f"Client D{n}", [("CAS-9", "autre", 0)]) for n in range(2)]
    agent.set_absent("estefania", True, "local")
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert [row(agent, q)["worked_by_name"] for q in res] == ["Kader", "Marc-Antoine", "Chloé", "Kader", "Marc-Antoine"]
    assert [row(agent, q)["worked_by_name"] for q in dem] == ["Kader", "Marc-Antoine"]   # its own turn
    assert all(row(agent, q)["method"] == "rotation" for q in res + dem)
    nxt = {c["key"]: c["prochain"] for c in agent.rotation_state()["categories"]}
    assert nxt == {"resiliation": "Chloé", "demenagement": "Chloé"}                     # remembered after the run
    agent.set_absent("estefania", False, "local")
    assert {c["key"]: c["prochain"] for c in agent.rotation_state()["categories"]}["resiliation"] == "Chloé"


def test_rotation_does_not_replace_the_case_owner_and_proposals_do_not_advance_it():
    agent, crm = make()
    owned = crm.add("a", "Résiliation", "Client A", [("CAS-1", "chloe", 0)])
    free = [crm.add(f"f{n}", "Résiliation", f"Client F{n}", []) for n in range(2)]
    agent.run(Mode.SIMULATION)
    assert row(agent, owned)["method"] == "case" and row(agent, owned)["worked_by_name"] == "Chloé"
    assert [row(agent, q)["worked_by_name"] for q in free] == ["Kader", "Estefania"]
    assert agent.journal.setting("rotation:resiliation") is None      # simulation: the turn did not move
    agent.run(Mode.SIMULATION)
    assert [row(agent, q)["worked_by_name"] for q in free] == ["Kader", "Estefania"]


def test_supervised_rotation_keeps_the_proposed_person_and_correction_moves_the_turn():
    agent, crm = make()
    a = crm.add("a", "Résiliation", "Client A", [])
    b = crm.add("b", "Résiliation", "Client B", [])
    agent.run(Mode.SUPERVISED)
    assert (row(agent, a)["worked_by_name"], row(agent, b)["worked_by_name"]) == ("Kader", "Estefania")
    assert agent.approve(b, "local")["worked_by_name"] == "Estefania"          # out of order: still Estefania
    assert agent.journal.setting("rotation:resiliation") == "estefania"
    assert agent.correct(a, "chloe", "local", "Kader en formation")["worked_by_name"] == "Chloé"
    assert agent.journal.setting("rotation:resiliation") == "chloe"


def test_rotation_toujours_and_configuration_checks():
    raw = {"collaborators": [{"key": "kader", "first_name": "Kader"}, {"key": "chloe", "first_name": "Chloé"}],
           "rotation": {"resiliation": ["chloe", "kader"], "applique": "toujours"}}
    cfg = parse(raw)
    assert cfg.rotation.members["resiliation"] == ("chloe", "kader") and cfg.rotation.members["demenagement"] == ("kader", "chloe")
    from movers_dispatch.config import ConfigError
    with pytest.raises(ConfigError, match="inconnu"):
        parse({**raw, "rotation": {"resiliation": ["paul"]}})
    agent, crm = make(rotation=replace(demo_config().rotation, applies="toujours"))
    q = crm.add("a", "Résiliation", "Client A", [("CAS-1", "chloe", 0)])
    agent.run(Mode.SIMULATION)
    assert row(agent, q)["method"] == "rotation" and row(agent, q)["worked_by_name"] == "Kader"


# ------------------------------------------------------------------ journal kept from an older version
def test_older_journal_is_upgraded_in_place(tmp_path):
    path = tmp_path / "old.db"
    db = sqlite3.connect(path)
    db.executescript("""CREATE TABLE items (queueitem_id TEXT PRIMARY KEY, email_id TEXT, subject TEXT, account_id TEXT,
      account_name TEXT, case_id TEXT, case_number TEXT, owner_name TEXT, worked_by_user_id TEXT, worked_by_name TEXT,
      status TEXT NOT NULL, reason TEXT, considered TEXT, mode TEXT, run_id INTEGER, updated_at TEXT NOT NULL);
      INSERT INTO items(queueitem_id, status, updated_at) VALUES ('old', 'affecte', '2026-10-20');""")
    db.commit()
    db.close()
    j = Journal(str(path))
    j.upsert("new", status=Status.PROPOSED, category="resiliation", method="rotation")
    assert j.item("old")["status"] == "affecte" and j.item("new")["category"] == "resiliation"


# ------------------------------------------------------------------ scanned letters (3rd recording)
def _letter(crm, label="l", number="10090016", files=None):
    from movers_dispatch.fake import demo_pdf
    return crm.add(label, "Voir document joint", "Client Lettre", [], regarding_entity=None, account_number=number,
                   sender="noreply@sectoralarm.fr", text="%Sector Alarm RENNES CDE",
                   files=files if files is not None else [("lettre.pdf", "application/pdf", demo_pdf([f"n° client {number}"]))])


def test_scanned_letter_is_flagged_and_linked_after_the_person_reads_the_number():
    agent, crm = make()
    qid = _letter(crm)
    agent.run(Mode.SUPERVISED)
    r = row(agent, qid)
    assert r["status"] == Status.REVIEW.value and r["attachments"] == 1 and "Voir la pièce jointe" in r["reason"]
    files = agent.attachments(qid)
    f = agent.attachment(qid, files[0]["id"])
    assert f["mimetype"] == "application/pdf" and f["content"].startswith(b"%PDF")
    with pytest.raises(RunBlocked, match="vérifier la lecture"):
        agent.check_account("10090018")                          # misread digit: no such account
    assert agent.check_account("1009 0016")["name"].startswith("Client Lettre")
    out = agent.link_client(qid, "10090016", "local", "lettre scannée")
    assert crm.emails[crm.items[qid].object.id].regarding.entity == "account" and crm.writes == 1
    assert out["status"] in (Status.REVIEW.value, Status.AWAITING_APPROVAL.value)


def test_attachment_of_another_element_cannot_be_opened():
    agent, crm = make()
    a, b = _letter(crm, "a"), _letter(crm, "b", "10090017")
    agent.run(Mode.SIMULATION)
    other = agent.attachments(b)[0]["id"]
    with pytest.raises(RunBlocked, match="n'appartient pas"):
        agent.attachment(a, other)


def test_next_in_rotation_chosen_by_the_person_for_a_letter():
    agent, crm = make()
    qid, other = _letter(crm), _letter(crm, "z", "10090019")
    agent.run(Mode.SUPERVISED)
    agent.link_client(qid, "10090016", "local")
    assert row(agent, qid)["status"] == Status.REVIEW.value          # no category, no case: the person decides
    out = agent.assign_manually(qid, "rotation:resiliation", "local")
    assert out["status"] == Status.ASSIGNED.value and out["worked_by_name"] == "Kader" and out["method"] == "rotation"
    assert out["category"] == "resiliation" and agent.journal.setting("rotation:resiliation") == "kader"
    with pytest.raises(RunBlocked, match="Catégorie inconnue"):
        agent.assign_manually(other, "rotation:autre", "local")
