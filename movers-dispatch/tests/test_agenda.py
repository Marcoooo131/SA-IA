"""Booking of assigned tasks in the shared agenda (fictitious CRM, agenda function simulated)."""

from __future__ import annotations

from dataclasses import replace

import httpx

from movers_dispatch.config import AgendaLink, parse
from movers_dispatch.engine import Agent
from movers_dispatch.fake import FakeCrm, demo_config
from movers_dispatch.journal import Journal
from movers_dispatch.models import Mode

ENDPOINT = "https://projet.supabase.co/functions/v1/dispatch-booking"
TOKEN = "f" * 64


def make(answer=None, enabled=True, source="champ"):
    cfg = demo_config(automatic_allowed=True)
    collabs = tuple(replace(c, agenda_email=f"{c.key}@exemple.fr") for c in cfg.collaborators)
    cfg = replace(cfg, collaborators=collabs, agenda=AgendaLink(enabled=enabled, endpoint=ENDPOINT, token=TOKEN, source=source))
    sent = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return answer(request) if answer else httpx.Response(200, json={"ok": True, "id": "x", "action": "created"})

    crm = FakeCrm()
    agent = Agent(cfg, crm, Journal(":memory:"))
    agent.agenda_http = httpx.Client(transport=httpx.MockTransport(handler))
    return agent, crm, sent


def actions(agent, qid):
    return [e["action"] for e in agent.journal.events(qid) if e["action"].startswith("agenda_")]


def test_assigned_task_is_booked_at_its_due_date_for_the_collaborator():
    agent, crm, sent = make()
    qid = crm.add("t1", "Rappeler M. Leroy", "Client fictif", [("CAS-1", "kader", 0, "MOVERS")], kind="task",
                  due="2030-02-01T13:00:00Z")
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert len(sent) == 1
    req = sent[0]
    assert str(req.url) == ENDPOINT and req.headers["x-dispatch-token"] == TOKEN
    body = __import__("json").loads(req.content)
    assert body["starts_at"] == "2030-02-01T13:00:00Z" and body["responsible_email"] == "kader@exemple.fr"
    assert body["title"] == "Rappeler M. Leroy" and body["external_ref"].startswith("crm-task:")
    assert body["duration_minutes"] == 15 and body["client_name"]
    assert actions(agent, qid) == ["agenda_reserve"]


def test_mails_simulation_and_disabled_feature_never_book():
    agent, crm, sent = make()
    crm.add("m1", "Déménagement", "Client", [("CAS-1", "kader", 0)], due="2030-02-01T13:00:00Z")   # a mail
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    agent2, crm2, sent2 = make()
    crm2.add("t2", "Rappel", "Client", [("CAS-1", "kader", 0)], kind="task", due="2030-02-01T13:00:00Z")
    agent2.run(Mode.SIMULATION)
    agent3, crm3, sent3 = make(enabled=False)
    crm3.add("t3", "Rappel", "Client", [("CAS-1", "kader", 0)], kind="task", due="2030-02-01T13:00:00Z")
    agent3.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert sent == sent2 == sent3 == []


def test_task_without_due_date_is_journaled_not_sent():
    agent, crm, sent = make()
    qid = crm.add("t4", "Rappel", "Client", [("CAS-1", "kader", 0)], kind="task")
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert sent == [] and actions(agent, qid) == ["agenda_sans_echeance"]


def test_agenda_failure_never_undoes_or_stops_the_dispatch():
    agent, crm, sent = make(answer=lambda r: httpx.Response(422, json={"error": "Aucun compte dans l'agenda"}))
    q1 = crm.add("t5", "Rappel 1", "Client", [("CAS-1", "kader", 0)], kind="task", due="2030-02-01T13:00:00Z")
    q2 = crm.add("t6", "Rappel 2", "Client 2", [("CAS-2", "chloe", 0)], kind="task", due="2030-02-01T14:00:00Z")
    out = agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert out["affectes"] == 2 and len(sent) == 2
    assert actions(agent, q1) == ["agenda_echec"] and actions(agent, q2) == ["agenda_echec"]

    def boom(request):
        raise httpx.ConnectError("hors ligne")
    agent2, crm2, _ = make(answer=boom)
    q3 = crm2.add("t7", "Rappel", "Client", [("CAS-1", "kader", 0)], kind="task", due="2030-02-01T13:00:00Z")
    agent2.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert agent2.journal.item(q3)["status"] == "affecte" and actions(agent2, q3) == ["agenda_echec"]


def test_configuration_section_and_its_checks():
    raw = {"collaborators": [{"key": "kader", "first_name": "Kader", "systemuser_id": "", "email_agenda": " Kader@Ex.fr "}],
           "agenda": {"active": True, "adresse": ENDPOINT, "jeton": TOKEN, "duree_minutes": 30}}
    cfg = parse(raw)
    assert cfg.agenda.enabled and cfg.agenda.duration_minutes == 30 and cfg.agenda.source == "description"
    assert cfg.collaborators[0].agenda_email == "kader@ex.fr" and cfg.agenda.problems() == []
    bad = parse({**raw, "agenda": {"active": True, "adresse": "http://x", "jeton": "court"}})
    assert len(bad.agenda.problems()) == 2
    assert parse({"collaborators": raw["collaborators"]}).agenda.enabled is False


# ------------------------------------------------------------------ horaire écrit dans la description
from datetime import datetime, timezone  # noqa: E402

from movers_dispatch.reminder import parse_reminder  # noqa: E402

LABELS = AgendaLink().labels
NOW = datetime(2026, 10, 28, 8, 0, tzinfo=timezone.utc)      # mercredi 28 octobre 2026, 9 h à Paris


def at(text):
    r = parse_reminder(text, LABELS, "Europe/Paris", NOW)
    return (r.start.isoformat(), r.end.isoformat() if r.end else None) if r else None


def test_template_formats_are_read_in_paris_time():
    winter = "+00:00"
    assert at("Client : Dupont\nHoraire de rappel : 29/10/2026 à 14h30") == ("2026-10-29T13:30:00" + winter, None)
    assert at("Rappel : 29/10 14:30") == ("2026-10-29T13:30:00" + winter, None)
    assert at("Horaire : jeudi 29 octobre 2026 de 14h à 15h30") == ("2026-10-29T13:00:00" + winter, "2026-10-29T14:30:00" + winter)
    assert at("CRÉNEAU : 2/11/26 9H") == ("2026-11-02T08:00:00" + winter, None)
    assert at("Rappel : demain entre 9h et 10h") == ("2026-10-29T08:00:00" + winter, "2026-10-29T09:00:00" + winter)
    assert at("Date de rappel :\n\n29.10.2026 - 16 h 45") == ("2026-10-29T15:45:00" + winter, None)
    assert at("Horaire : 1er novembre 10h") == ("2026-11-01T09:00:00" + winter, None)


def test_summer_time_and_new_year():
    assert at("Horaire : 15/07/2027 à 10h") == ("2027-07-15T08:00:00+00:00", None)       # UTC+2 l'été
    january = parse_reminder("Rappel : 03/01 à 9h", LABELS, "Europe/Paris", datetime(2026, 12, 28, 10, tzinfo=timezone.utc))
    assert january.start.isoformat() == "2027-01-03T08:00:00+00:00"                        # « 03/01 » fin décembre


def test_other_dates_of_the_text_are_never_taken():
    text = "Déménagement prévu le 15/11/2026.\nContrat signé le 02/03/2020 à 10h.\nHoraire : 30/10/2026 à 11h"
    assert at(text) == ("2026-10-30T10:00:00+00:00", None)
    assert at("Déménagement le 15/11/2026 à 10h, merci de traiter") is None                 # aucune ligne « Horaire / Rappel »
    assert at("Rappel : à définir avec le client") is None                                  # pas d'heure
    assert at("Rappel : 31/02/2026 à 10h") is None                                          # date impossible
    assert at("Rappel : tél 06 12 34 56 78") is None                                        # un numéro n'est pas une heure


def test_central_european_rule_without_tz_database():
    from movers_dispatch.reminder import _eu_to_utc
    assert _eu_to_utc(datetime(2026, 10, 29, 14, 30)).isoformat() == "2026-10-29T13:30:00+00:00"
    assert _eu_to_utc(datetime(2026, 10, 24, 14, 30)).isoformat() == "2026-10-24T12:30:00+00:00"
    assert _eu_to_utc(datetime(2026, 3, 29, 12, 0)).isoformat() == "2026-03-29T10:00:00+00:00"


def test_assigned_task_is_booked_from_its_description():
    agent, crm, sent = make(source="description")
    qid = crm.add("d1", "Movers - Résiliation", "Client fictif", [("CAS-1", "chloe", 0)], kind="task",
                  text="Nom : Dupont\nHoraire de rappel : 30/10/2030 de 14h à 14h30\nMotif : résiliation")
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    body = __import__("json").loads(sent[0].content)
    assert body["starts_at"] == "2030-10-30T13:00:00Z" and body["ends_at"] == "2030-10-30T13:30:00Z"
    assert body["responsible_email"] == "chloe@exemple.fr" and actions(agent, qid) == ["agenda_reserve"]
    q2 = crm.add("d2", "Movers - Résiliation", "Client 2", [("CAS-2", "chloe", 0)], kind="task", text="Sans horaire")
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert len(sent) == 1 and actions(agent, q2) == ["agenda_sans_echeance"]
