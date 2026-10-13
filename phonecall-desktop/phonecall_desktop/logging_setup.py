"""Technical logs: identifiers, states, durations and error codes only — never transcript or
note content. A redaction filter is a second safety net."""

from __future__ import annotations

import logging
import logging.handlers
import re
from pathlib import Path

_PATTERNS = [
    (re.compile(r"(?i)(authorization\s*[:=]\s*)(bearer|basic)\s+\S+"), r"\1[REDACTED]"),
    (re.compile(r"pcn_[A-Za-z0-9_-]+"), "[REDACTED_TOKEN]"),
    (re.compile(r"sk-ant-[A-Za-z0-9_-]+"), "[REDACTED_KEY]"),
    (re.compile(r"(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}"), "[REDACTED_PHONE]"),
    (re.compile(r"\+\d{8,15}"), "[REDACTED_PHONE]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[REDACTED_EMAIL]"),
    (re.compile(r"([?&](?:t|token)=)[^&\s]+"), r"\1[REDACTED]"),
]


def redact(text: str) -> str:
    for pattern, repl in _PATTERNS:
        text = pattern.sub(repl, text)
    return text


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact(record.getMessage())
        record.args = ()
        return True


def configure_logging(log_dir: Path | None, level: str = "INFO") -> None:
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    import sys

    # Windowed executable: no console (sys.stderr is None)
    handlers: list[logging.Handler] = [logging.StreamHandler()] if sys.stderr is not None else []
    if log_dir is not None:
        log_dir.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.handlers.RotatingFileHandler(log_dir / "phonecall-desktop.log", maxBytes=2_000_000,
                                                             backupCount=5, encoding="utf-8"))
    root = logging.getLogger()
    root.handlers[:] = []
    for h in handlers:
        h.setFormatter(fmt)
        h.addFilter(RedactingFilter())
        root.addHandler(h)
    root.setLevel(level)
    for noisy in ("httpx", "httpcore", "faster_whisper", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
