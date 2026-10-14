"""Technical logging with redaction: code logs identifiers only (job id, appointment id);
this filter is a second safety net against phone numbers leaking into logs."""

from __future__ import annotations

import logging
import re

_PHONE = re.compile(r"\+\d{8,15}|\b0[1-9](?:[ .-]?\d{2}){4}\b")


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        redacted = _PHONE.sub("[NUM]", msg)
        if redacted != msg:
            record.msg, record.args = redacted, None
        return True


def setup_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    handler.addFilter(RedactingFilter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    # uvicorn access logs contain query strings (searches by name / phone): keep them out.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
