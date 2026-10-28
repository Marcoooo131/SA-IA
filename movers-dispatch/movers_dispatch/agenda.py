"""Booking of an assigned CRM task in the shared agenda (agenda-partage).

After Worked By has been written and verified on a task, its due date (« Due » in the CRM, column
``scheduledend`` by default) is sent to the agenda function « dispatch-booking »: a 15-minute slot is
booked for the collaborator, who then gets the agenda's notification and reminder. The same task
always updates the same slot (key ``crm-task:<activityid>``). A booking failure never stops the dispatch.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from .config import Collaborator, Config
from .models import Email


@dataclass(frozen=True)
class Booking:
    status: str          # "reserve", "deja_reserve", "deplace", "sans_echeance", "sans_email", "echec"
    detail: str = ""


def task_link(cfg: Config, task_id: str) -> str:
    base = cfg.connection.environment_url.rstrip("/")
    return f"{base}/main.aspx?etn=task&id=%7B{task_id}%7D&pagetype=entityrecord" if base.startswith("https://") else ""


def book_task(cfg: Config, task: Email, collab: Collaborator, client_name: str = "",
              http: httpx.Client | None = None) -> Booking | None:
    """None when the booking does not apply (feature off, not a task); otherwise what happened."""
    ag = cfg.agenda
    if not ag.enabled or task.kind != "task" or ag.problems():
        return None
    if not task.due:
        return Booking("sans_echeance", "tâche sans échéance : rien à réserver")
    if not collab.agenda_email:
        return Booking("sans_email", f"email_agenda non renseigné pour {collab.first_name}")
    payload = {
        "external_ref": f"crm-task:{task.id}",
        "title": task.subject or "Tâche CRM",
        "starts_at": task.due,
        "duration_minutes": ag.duration_minutes,
        "responsible_email": collab.agenda_email,
        "client_name": client_name,
        "notes": "Tâche CRM attribuée par l'agent Dispatch Movers.",
        "link": task_link(cfg, task.id),
        "category": ag.category,
    }
    own = http is None
    client = http or httpx.Client(timeout=ag.timeout_seconds)
    try:
        r = client.post(ag.endpoint, json=payload, headers={"x-dispatch-token": ag.token})
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if r.status_code != 200 or not data.get("ok"):
            return Booking("echec", data.get("error") or f"HTTP {r.status_code}")
        status = {"created": "reserve", "updated": "deplace"}.get(data.get("action"), "deja_reserve")
        return Booking(status, task.due)
    except (httpx.HTTPError, ValueError) as e:
        return Booking("echec", f"agenda injoignable : {e}")
    finally:
        if own:
            client.close()
