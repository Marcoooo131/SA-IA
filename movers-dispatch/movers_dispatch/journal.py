"""Local SQLite store: one row per queue item (current state) + an append-only event history.

Kept: identifiers, case number, owner and Worked By names, outcomes, errors, human approvals.
Not kept: email bodies, addresses, phone numbers. The subject is truncated (it may carry the
customer's name) and the account is stored by id and name only.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone

from .models import Status

SUBJECT_MAX = 80

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
  queueitem_id TEXT PRIMARY KEY,
  email_id TEXT, subject TEXT, account_id TEXT, account_name TEXT,
  case_id TEXT, case_number TEXT, owner_name TEXT,
  worked_by_user_id TEXT, worked_by_name TEXT,
  status TEXT NOT NULL, reason TEXT, considered TEXT,
  mode TEXT, run_id INTEGER, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL, run_id INTEGER, queueitem_id TEXT,
  action TEXT NOT NULL, detail TEXT, actor TEXT
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL, ended_at TEXT, mode TEXT NOT NULL, outcome TEXT, actor TEXT
);
CREATE INDEX IF NOT EXISTS events_item ON events(queueitem_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

# columns added after the first release: added to an existing journal without losing anything
ADDED_COLUMNS = {"category": "TEXT", "client_account_id": "TEXT", "client_name": "TEXT", "client_via": "TEXT",
                 "client_to_link": "INTEGER", "method": "TEXT"}

COUNTED = {
    "affectes": [Status.ASSIGNED],
    "ignores": [Status.SKIPPED],
    "validation": [Status.REVIEW, Status.AWAITING_APPROVAL],
    "erreurs": [Status.ERROR],
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Journal:
    def __init__(self, path: str):
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.Lock()
        with self.lock:
            self.db.executescript(SCHEMA)
            have = {r["name"] for r in self.db.execute("PRAGMA table_info(items)")}
            for col, kind in ADDED_COLUMNS.items():
                if col not in have:
                    self.db.execute(f"ALTER TABLE items ADD COLUMN {col} {kind}")

    def setting(self, key: str, default=None):
        with self.lock:
            row = self.db.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def set_setting(self, key: str, value) -> None:
        with self.lock:
            self.db.execute("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                            (key, json.dumps(value, ensure_ascii=False)))

    def start_run(self, mode: str, actor: str) -> int:
        with self.lock:
            return self.db.execute("INSERT INTO runs(started_at, mode, actor) VALUES (?,?,?)", (now(), mode, actor)).lastrowid

    def end_run(self, run_id: int, outcome: str) -> None:
        with self.lock:
            self.db.execute("UPDATE runs SET ended_at=?, outcome=? WHERE id=?", (now(), outcome, run_id))

    def event(self, run_id: int | None, queueitem_id: str | None, action: str, detail: dict | None = None,
              actor: str = "agent") -> None:
        with self.lock:
            self.db.execute("INSERT INTO events(ts, run_id, queueitem_id, action, detail, actor) VALUES (?,?,?,?,?,?)",
                            (now(), run_id, queueitem_id, action, json.dumps(detail or {}, ensure_ascii=False), actor))

    def upsert(self, queueitem_id: str, **fields) -> None:
        if "subject" in fields and fields["subject"]:
            s = fields["subject"]
            fields["subject"] = s if len(s) <= SUBJECT_MAX else s[: SUBJECT_MAX - 1] + "…"
        if isinstance(fields.get("status"), Status):
            fields["status"] = fields["status"].value
        if isinstance(fields.get("considered"), (list, tuple)):
            fields["considered"] = json.dumps(list(fields["considered"]), ensure_ascii=False)
        fields["updated_at"] = now()
        with self.lock:
            exists = self.db.execute("SELECT 1 FROM items WHERE queueitem_id=?", (queueitem_id,)).fetchone()
            if exists:
                sets = ", ".join(f"{k}=?" for k in fields)
                self.db.execute(f"UPDATE items SET {sets} WHERE queueitem_id=?", (*fields.values(), queueitem_id))
            else:
                fields.setdefault("status", Status.PENDING.value)
                cols = ", ".join(["queueitem_id", *fields])
                marks = ", ".join("?" * (len(fields) + 1))
                self.db.execute(f"INSERT INTO items({cols}) VALUES ({marks})", (queueitem_id, *fields.values()))

    def item(self, queueitem_id: str) -> dict | None:
        with self.lock:
            row = self.db.execute("SELECT * FROM items WHERE queueitem_id=?", (queueitem_id,)).fetchone()
        return dict(row) if row else None

    def items(self) -> list[dict]:
        with self.lock:
            rows = self.db.execute("SELECT * FROM items ORDER BY updated_at DESC").fetchall()
        return [dict(r) for r in rows]

    def events(self, queueitem_id: str | None = None, limit: int = 200) -> list[dict]:
        with self.lock:
            if queueitem_id:
                rows = self.db.execute("SELECT * FROM events WHERE queueitem_id=? ORDER BY id DESC LIMIT ?",
                                       (queueitem_id, limit)).fetchall()
            else:
                rows = self.db.execute("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]

    def supervision(self, readiness_streak: int) -> dict:
        """What the people supervising the agent answered: accepted as is, corrected, rejected,
        assigned by hand — and how many proposals in a row were accepted without correction."""
        with self.lock:
            rows = self.db.execute(
                "SELECT e.id, e.ts, e.queueitem_id, e.action, e.detail, e.actor, i.subject FROM events e "
                "LEFT JOIN items i ON i.queueitem_id = e.queueitem_id "
                "WHERE e.action IN ('validation_humaine', 'correction', 'correction_client', 'attribution_manuelle', 'rattachement_manuel') ORDER BY e.id").fetchall()
        out = {"acceptees": 0, "corrigees": 0, "refusees": 0, "manuelles": 0, "serie": 0, "corrections": []}
        verdicts = []
        for r in rows:
            d = json.loads(r["detail"] or "{}")
            if r["action"] in ("attribution_manuelle", "rattachement_manuel"):
                out["manuelles"] += 1
                continue
            if r["action"] == "correction_client":
                out["corrigees"] += 1
                verdicts.append(False)
                out["corrections"].append({"ts": r["ts"], "queueitem_id": r["queueitem_id"], "subject": r["subject"],
                                           "propose": f"client {d.get('propose') or 'introuvable'}",
                                           "retenu": f"client {d.get('retenu')}", "case_propose": d.get("via") or "",
                                           "cases_vus": [], "note": d.get("note", ""), "actor": r["actor"]})
                continue
            if r["action"] == "correction":
                out["corrigees"] += 1
                verdicts.append(False)
                out["corrections"].append({"ts": r["ts"], "queueitem_id": r["queueitem_id"], "subject": r["subject"],
                                           "propose": d.get("propose"), "retenu": d.get("worked_by"),
                                           "case_propose": d.get("case_propose"), "cases_vus": d.get("cases_vus", []),
                                           "note": d.get("note", ""), "actor": r["actor"]})
            elif d.get("decision") == "acceptee":
                out["acceptees"] += 1
                verdicts.append(True)
            elif d.get("decision") == "refusee":
                out["refusees"] += 1
                verdicts.append(False)
        for ok in reversed(verdicts):
            if not ok:
                break
            out["serie"] += 1
        judged = out["acceptees"] + out["corrigees"] + out["refusees"]
        out["taux_accord"] = round(100 * out["acceptees"] / judged) if judged else None
        out["objectif"] = readiness_streak
        out["pret"] = out["serie"] >= readiness_streak
        out["corrections"].reverse()
        return out

    def counters(self) -> dict:
        with self.lock:
            rows = self.db.execute("SELECT status, COUNT(*) n FROM items GROUP BY status").fetchall()
        by = {r["status"]: r["n"] for r in rows}
        out = {"detectes": sum(by.values()),
               "traites": sum(n for s, n in by.items() if s not in (Status.PENDING.value, Status.AWAITING_APPROVAL.value))}
        for key, statuses in COUNTED.items():
            out[key] = sum(by.get(s.value, 0) for s in statuses)
        out["proposes"] = by.get(Status.PROPOSED.value, 0)
        return out
