"""Team reminders file: reminder of each assigned task, shared through a Teams folder."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import datetime, timezone

from movers_dispatch import team_reminders
from movers_dispatch.config import TeamReminders, parse
from movers_dispatch.engine import Agent
from movers_dispatch.fake import FakeCrm, demo_config
from movers_dispatch.journal import Journal
from movers_dispatch.models import Mode

TEMPLATE = ("Nom interlocuteur : Client Fictif\nNuméro de téléphone : 0600000000\n\n"
            "Date de Déménagement : 14/09\n\nHoraire de Rappel : {}\n\nInformations Complémentaires :")


def make(tmp_path, enabled=True):
    cfg = replace(demo_config(automatic_allowed=True),
                  reminders=TeamReminders(enabled=enabled, folder=str(tmp_path)))
    crm = FakeCrm()
    return Agent(cfg, crm, Journal(":memory:")), crm


def read(tmp_path):
    return json.loads((tmp_path / team_reminders.JSON_NAME).read_text(encoding="utf-8"))


def actions(agent, qid):
    return [e["action"] for e in agent.journal.events(qid) if e["action"].startswith("rappel")]


def test_assigned_tasks_land_sorted_in_the_team_file(tmp_path):
    agent, crm = make(tmp_path)
    late = crm.add("t1", "PRIO - Movers - Déménagement", "Client A", [("CAS-1", "kader", 0)], kind="task",
                   text=TEMPLATE.format("16h00 - 30/10/2099"))
    early = crm.add("t2", "Movers - Résiliation", "Client B", [("CAS-2", "chloe", 0)], kind="task",
                    text=TEMPLATE.format("09h15 - 30/10/2099"))
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    data = read(tmp_path)
    assert [r["collaborator"] for r in data["reminders"]] == ["Chloé", "Kader"]          # trié par heure
    first = data["reminders"][0]
    assert first["start"] == "2099-10-30T08:15:00Z" and first["subject"] == "Movers - Résiliation"
    assert first["client"] and first["collaborator_key"] == "chloe"
    assert {c["key"] for c in data["collaborators"]} == {"kader", "estefania", "marc-antoine", "chloe"}
    assert actions(agent, late) == actions(agent, early) == ["rappel_enregistre"]
    csv_text = (tmp_path / team_reminders.CSV_NAME).read_text(encoding="utf-8-sig")
    assert csv_text.splitlines()[1].startswith("30/10/2099;09:15;;Chloé;Movers - Résiliation")
    assert "0600000000" not in csv_text and "0600000000" not in json.dumps(data)     # rien du texte de la tâche


def test_same_task_keeps_one_reminder_and_new_time_replaces_it(tmp_path):
    agent, crm = make(tmp_path)
    cfg = agent.cfg
    qid = crm.add("t3", "Rappel", "Client", [("CAS-1", "kader", 0)], kind="task", text=TEMPLATE.format("10h - 30/10/2099"))
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    task = crm.emails[crm.items[qid].object.id]
    collab = cfg.collaborator("kader")
    team_reminders.record(cfg, agent.journal, qid, replace(task, text=TEMPLATE.format("11h - 30/10/2099")), collab)
    data = read(tmp_path)
    assert len(data["reminders"]) == 1 and data["reminders"][0]["start"] == "2099-10-30T10:00:00Z"


def test_no_time_mails_simulation_and_disabled_write_nothing(tmp_path):
    agent, crm = make(tmp_path)
    q1 = crm.add("t4", "Rappel", "Client", [("CAS-1", "kader", 0)], kind="task", text=TEMPLATE.format(""))
    crm.add("m1", "Mail", "Client", [("CAS-2", "kader", 0)], text=TEMPLATE.format("10h - 30/10/2099"))
    agent.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert actions(agent, q1) == ["rappel_sans_horaire"] and read(tmp_path)["reminders"] == []   # fichier vide mais présent
    agent2, crm2 = make(tmp_path)
    crm2.add("t5", "Rappel", "Client", [("CAS-1", "kader", 0)], kind="task", text=TEMPLATE.format("10h - 30/10/2099"))
    agent2.run(Mode.SIMULATION)
    assert read(tmp_path)["reminders"] == []
    other = tmp_path / "off"
    other.mkdir()
    agent3, crm3 = make(other, enabled=False)
    crm3.add("t6", "Rappel", "Client", [("CAS-1", "kader", 0)], kind="task", text=TEMPLATE.format("10h - 30/10/2099"))
    agent3.run(Mode.AUTOMATIC, confirm_automatic=True)
    assert not (other / team_reminders.JSON_NAME).exists()


def test_old_reminders_leave_the_file(tmp_path):
    agent, _ = make(tmp_path)
    agent.journal.upsert_reminder("old", starts_at="2026-10-20T08:00:00Z", collaborator_key="kader", collaborator_name="Kader")
    agent.journal.upsert_reminder("new", starts_at="2026-10-29T08:00:00Z", collaborator_key="kader", collaborator_name="Kader")
    data = team_reminders.payload(agent.cfg, agent.journal, datetime(2026, 10, 28, 8, tzinfo=timezone.utc))
    assert [r["id"] for r in data["reminders"]] == ["new"]


def test_missing_folder_is_reported_and_never_stops_the_dispatch(tmp_path):
    cfg = replace(demo_config(automatic_allowed=True), reminders=TeamReminders(enabled=True, folder=str(tmp_path / "absent")))
    assert cfg.reminders.problems()
    crm = FakeCrm()
    agent = Agent(cfg, crm, Journal(":memory:"))
    qid = crm.add("t7", "Rappel", "Client", [("CAS-1", "kader", 0)], kind="task", text=TEMPLATE.format("10h - 30/10/2099"))
    assert agent.run(Mode.AUTOMATIC, confirm_automatic=True)["affectes"] == 1 and agent.journal.item(qid)["status"] == "affecte"


def test_configuration_section(tmp_path):
    raw = {"collaborators": [{"key": "kader", "first_name": "Kader", "systemuser_id": ""}],
           "rappels": {"active": True, "dossier": str(tmp_path), "garder_jours": 3}}
    cfg = parse(raw)
    assert cfg.reminders.enabled and cfg.reminders.keep_days == 3 and cfg.reminders.problems() == []
    assert parse({"collaborators": raw["collaborators"]}).reminders.enabled is False


def test_without_folder_the_onedrive_rappels_folder_is_used_and_created(tmp_path, monkeypatch):
    business = tmp_path / "OneDrive - Entreprise"
    business.mkdir()
    monkeypatch.setenv("OneDriveCommercial", str(business))
    monkeypatch.setenv("OneDrive", str(tmp_path))
    cfg = replace(demo_config(automatic_allowed=True), reminders=TeamReminders(enabled=True))
    assert cfg.reminders.problems() == [] and cfg.reminders.resolved_folder() == business / "Rappels"
    assert team_reminders.export(cfg, Journal(":memory:")) == business / "Rappels" / team_reminders.JSON_NAME
    monkeypatch.delenv("OneDriveCommercial")
    monkeypatch.delenv("OneDrive")
    assert TeamReminders(enabled=True, folder="auto").problems()


def test_rappels_command_switches_the_reminders_on_and_writes_the_file(tmp_path, monkeypatch, capsys):
    from movers_dispatch import cli
    from movers_dispatch.config import enable_reminders, load
    monkeypatch.setenv("OneDriveCommercial", str(tmp_path))
    toml = tmp_path / "dispatch.toml"
    toml.write_text('[[collaborators]]\nkey = "kader"\nfirst_name = "Kader"\nsystemuser_id = ""\n', encoding="utf-8")
    cli.main(["rappels", "-c", str(toml), "--essai", "tous"])
    assert "Fichier écrit" in capsys.readouterr().out
    assert read(tmp_path / "Rappels")["reminders"][0]["collaborator"] == "Kader"
    assert load(toml).collaborators[0].first_name == "Kader"
    # existing section switched off: only its « active » line changes
    toml.write_text('[rappels]\nactive = false   # off\ndossier = ""\n\n[[collaborators]]\nkey = "kader"\n'
                    'first_name = "Kader"\nsystemuser_id = ""\n', encoding="utf-8")
    enable_reminders(toml)
    cfg = load(toml)
    assert cfg.reminders.enabled and cfg.collaborators[0].key == "kader"
