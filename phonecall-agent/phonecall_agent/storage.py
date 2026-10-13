"""Temporary audio storage, encrypted at rest, never served over HTTP.

Files are named by an opaque call id, written with 0600 permissions and deleted as soon as
the transcription succeeds (or at the latest by the retention purge).
"""

from __future__ import annotations

import os
from pathlib import Path

from .crypto import decrypt_bytes, encrypt_bytes


class AudioStore:
    def __init__(self, root: Path):
        self.root = Path(root)

    def _ensure_root(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        os.chmod(self.root, 0o700)

    def path_for(self, call_id: str, extension: str) -> Path:
        safe = "".join(c for c in call_id if c.isalnum() or c == "-")
        return self.root / f"{safe}.{extension}.enc"

    def save(self, call_id: str, extension: str, data: bytes) -> Path:
        self._ensure_root()
        path = self.path_for(call_id, extension)
        tmp = path.with_suffix(".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as fh:
            fh.write(encrypt_bytes(data))
        os.replace(tmp, path)
        return path

    def load(self, path: str | Path) -> bytes:
        return decrypt_bytes(Path(path).read_bytes())

    def delete(self, path: str | Path | None) -> bool:
        if not path:
            return False
        p = Path(path)
        if p.exists():
            # Overwrite before unlink (best effort; real guarantees come from encrypted volumes).
            size = p.stat().st_size
            with open(p, "r+b") as fh:
                fh.write(b"\0" * size)
            p.unlink()
            return True
        return False
