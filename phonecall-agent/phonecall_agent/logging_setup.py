"""Structured logging with redaction.

Technical logs must never contain conversation content, secrets or private recording URLs.
Code logs identifiers only (call id, recording SID); this filter is a second safety net.
"""

from __future__ import annotations

import json
import logging
import re

_PATTERNS = [
    # Twilio resource / media URLs
    (re.compile(r"https?://[^\s\"']*twilio\.com[^\s\"']*", re.I), "[REDACTED_TWILIO_URL]"),
    # Any URL carrying credentials
    (re.compile(r"https?://[^/\s:@]+:[^@\s]+@[^\s\"']+"), "[REDACTED_URL_WITH_CREDENTIALS]"),
    # Bearer / basic auth headers
    (re.compile(r"(?i)(authorization\s*[:=]\s*)(basic|bearer)\s+[A-Za-z0-9._~+/=-]+"), r"\1[REDACTED]"),
    # Anthropic keys
    (re.compile(r"sk-ant-[A-Za-z0-9_-]+"), "[REDACTED_API_KEY]"),
    # Phone numbers in E.164
    (re.compile(r"\+\d{8,15}"), "[REDACTED_PHONE]"),
    # Email addresses
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[REDACTED_EMAIL]"),
]


def redact(text: str) -> str:
    for pattern, repl in _PATTERNS:
        text = pattern.sub(repl, text)
    return text


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        record.msg = redact(msg)
        record.args = ()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in ("call_id", "recording_sid", "stage", "attempt"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.addFilter(RedactingFilter())
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    # httpx logs full request URLs at INFO level: keep it quiet.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def safe_error_message(exc: BaseException, limit: int = 300) -> str:
    """Error string suitable for storage in ProcessingError (redacted and truncated)."""
    return redact(f"{type(exc).__name__}: {exc}")[:limit]
