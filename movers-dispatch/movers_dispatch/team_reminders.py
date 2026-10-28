"""Reminders of the assigned tasks, shared with the team through a Teams / OneDrive folder.

After Worked By has been written and verified on a task, the reminder time written in its description
(« Horaire de Rappel : 14h30 - 28/10 », see ``reminder.parse_reminder``) is kept in the journal and the
file ``rappels-movers.json`` (+ ``rappels-movers.csv`` for Excel) is rewritten, sorted by time, in the
configured folder — a Teams channel folder synchronised on this PC. Each advisor opens the team page
(https://marcoooo131.github.io/SA-IA/rappels/), picks this file once and ticks their name: the page lists
their reminders and shows a Windows notification before each one. The file never leaves the company's
Teams / OneDrive: the page reads it on the advisor's PC only.
"""

from __future__ import annotations

import csv
import io
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .config import Collaborator, Config
from .journal import Journal
from .models import Email
from .reminder import parse_reminder

JSON_NAME = "rappels-movers.json"
CSV_NAME = "rappels-movers.csv"


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def task_link(cfg: Config, task_id: str) -> str:
    base = cfg.connection.environment_url.rstrip("/")
    return f"{base}/main.aspx?etn=task&id=%7B{task_id}%7D&pagetype=entityrecord" if base.startswith("https://") else ""


def record(cfg: Config, journal: Journal, queueitem_id: str, task: Email, collab: Collaborator,
           client_name: str = "") -> str:
    """Keeps the reminder of an assigned task and rewrites the shared file. Returns the journal action."""
    rc = cfg.reminders
    found = parse_reminder(task.text, rc.labels, rc.zone)
    if found is None:
        return "rappel_sans_horaire"
    journal.upsert_reminder(task.id, queueitem_id=queueitem_id, starts_at=_iso(found.start),
                            ends_at=_iso(found.end) if found.end else None, collaborator_key=collab.key,
                            collaborator_name=collab.first_name, subject=(task.subject or "Tâche CRM")[:120],
                            client_name=client_name[:120], link=task_link(cfg, task.id))
    export(cfg, journal)
    return "rappel_enregistre"


def payload(cfg: Config, journal: Journal, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    since = _iso(now - timedelta(days=cfg.reminders.keep_days))
    rows = journal.reminders(since)
    return {
        "version": 1,
        "generated_at": _iso(now),
        "zone": cfg.reminders.zone,
        "collaborators": [{"key": c.key, "name": c.first_name} for c in cfg.collaborators],
        "reminders": [{"id": r["task_id"], "start": r["starts_at"], "end": r["ends_at"],
                       "collaborator_key": r["collaborator_key"], "collaborator": r["collaborator_name"],
                       "subject": r["subject"] or "", "client": r["client_name"] or "", "link": r["link"] or ""}
                      for r in rows],
    }


def _write_atomic(path: Path, text: str, encoding: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding=encoding)
    os.replace(tmp, path)          # never a half-written file for OneDrive or for the page


def export(cfg: Config, journal: Journal, now: datetime | None = None) -> Path:
    folder = cfg.reminders.resolved_folder()
    if folder is None:
        raise FileNotFoundError("OneDrive introuvable sur ce PC")
    if cfg.reminders.automatic:
        folder.mkdir(exist_ok=True)
    if not folder.is_dir():
        raise FileNotFoundError(f"dossier des rappels introuvable : {folder}")
    data = payload(cfg, journal, now)
    _write_atomic(folder / JSON_NAME, json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    out = io.StringIO()
    w = csv.writer(out, delimiter=";")
    w.writerow(["Date", "Heure", "Fin", "Collaborateur", "Tâche", "Client", "Lien CRM"])
    try:
        from zoneinfo import ZoneInfo
        zone = ZoneInfo(cfg.reminders.zone)
    except Exception:  # noqa: BLE001 — Windows without tzdata: UTC+1 approximation for the CSV only
        zone = timezone(timedelta(hours=1))
    for r in data["reminders"]:
        start = datetime.fromisoformat(r["start"].replace("Z", "+00:00")).astimezone(zone)
        end = datetime.fromisoformat(r["end"].replace("Z", "+00:00")).astimezone(zone).strftime("%H:%M") if r["end"] else ""
        w.writerow([start.strftime("%d/%m/%Y"), start.strftime("%H:%M"), end, r["collaborator"], r["subject"], r["client"], r["link"]])
    _write_atomic(folder / CSV_NAME, "﻿" + out.getvalue(), "utf-8")
    return folder / JSON_NAME
