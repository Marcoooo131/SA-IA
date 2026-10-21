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
"""

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
