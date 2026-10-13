"""Optional session history (DISABLED by default — enable only if the company allows it).

Stored locally, encrypted with a key kept in the Windows Credential Manager; purged after
``retention_days``; the transcript is stored only if ``store_transcript`` is enabled. Audio is
never stored.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from .config import APP_NAME

KEY_ENTRY = "history-key"


def keyring_key() -> bytes:
    import keyring

    key = keyring.get_password(APP_NAME, KEY_ENTRY)
    if not key:
        key = Fernet.generate_key().decode()
        keyring.set_password(APP_NAME, KEY_ENTRY, key)
    return key.encode()


class History:
    def __init__(self, path: Path, key: bytes, retention_days: int, store_transcript: bool):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.fernet = Fernet(key)
        self.retention_s = retention_days * 86400
        self.store_transcript = store_transcript
        self._lock = threading.Lock()
        with self._conn() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, created_at REAL NOT NULL, duration_s INTEGER, status TEXT,
                payload BLOB NOT NULL)""")
        self.purge()

    def _conn(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path)
        db.execute("PRAGMA secure_delete=ON")  # deleted rows are overwritten on disk
        return db

    def _enc(self, obj: dict) -> bytes:
        return self.fernet.encrypt(json.dumps(obj, ensure_ascii=False).encode())

    def _dec(self, blob: bytes) -> dict | None:
        try:
            return json.loads(self.fernet.decrypt(blob))
        except InvalidToken:
            return None  # key lost or rotated: entry unreadable

    def save(self, *, duration_s: int, status: str, note: str, transcript: str | None, session_id: str | None = None) -> str:
        sid = session_id or uuid.uuid4().hex
        payload = {"note": note, "transcript": transcript if self.store_transcript else None}
        with self._lock, self._conn() as db:
            db.execute("INSERT OR REPLACE INTO sessions VALUES (?,?,?,?,?)",
                       (sid, time.time(), duration_s, status, self._enc(payload)))
        return sid

    def list(self) -> list[dict]:
        with self._lock, self._conn() as db:
            rows = db.execute("SELECT id, created_at, duration_s, status, payload FROM sessions ORDER BY created_at DESC").fetchall()
        out = []
        for sid, created, dur, status, blob in rows:
            data = self._dec(blob) or {}
            note = data.get("note") or ""
            out.append({"id": sid, "created_at": created, "duration_s": dur, "status": status,
                        "preview": note.splitlines()[0][:120] if note else "", "has_transcript": bool(data.get("transcript"))})
        return out

    def get(self, sid: str) -> dict | None:
        with self._lock, self._conn() as db:
            row = db.execute("SELECT id, created_at, duration_s, status, payload FROM sessions WHERE id=?", (sid,)).fetchone()
        if not row:
            return None
        data = self._dec(row[4]) or {}
        return {"id": row[0], "created_at": row[1], "duration_s": row[2], "status": row[3], **data}

    def delete(self, sid: str | None = None) -> int:
        with self._lock, self._conn() as db:
            cur = db.execute("DELETE FROM sessions" + (" WHERE id=?" if sid else ""), (sid,) if sid else ())
            return cur.rowcount

    def purge(self) -> int:
        with self._lock, self._conn() as db:
            cur = db.execute("DELETE FROM sessions WHERE created_at < ?", (time.time() - self.retention_s,))
            return cur.rowcount
