"""Reading of scanned letters (handwritten customer number, phone) with Azure AI Document Intelligence.

Used only when ``[lecture] active = true`` (company approval). The file goes to the company's own Azure
resource, its text is read in memory and dropped: only the customer numbers / phones found are kept, and
the client proposed from them is always validated by a person before anything is written in the CRM.
The key is read from a Windows environment variable, never from the configuration file.
"""

from __future__ import annotations

import base64
import json
import os
import re
import ssl
import time
import urllib.error
import urllib.request

from .config import Config, LetterReading
from .reading import CUSTOMER_NO_RE, EMAIL_RE, PHONE_RE, Signals, _keep_email, _unique

# a number written alone on a letter (« 10086592 », « 10 086 592 »): checked in the CRM, never trusted as is
_BARE_NUMBER_RE = re.compile(r"(?<![\d+])\d(?:[ .]?\d){5,9}(?!\d)")
MAX_NUMBERS = 6


class ReadingError(Exception):
    pass


class AzureReader:
    def __init__(self, cfg: LetterReading, key: str):
        self.cfg = cfg
        self._key = key
        self._ssl = ssl.create_default_context()      # Windows certificate store (company proxy included)

    def _call(self, method: str, url: str, body: bytes | None = None) -> tuple[int, dict, dict]:
        req = urllib.request.Request(url, data=body, method=method, headers={
            "Ocp-Apim-Subscription-Key": self._key, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30, context=self._ssl) as r:
                raw = r.read()
                return r.status, dict(r.headers), json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            try:
                msg = (json.loads(e.read()).get("error") or {}).get("message", "")
            except ValueError:
                msg = ""
            hint = " (clé refusée : vérifier la variable " + self.cfg.key_env + ")" if e.code in (401, 403) else ""
            raise ReadingError(f"Azure a répondu HTTP {e.code}{hint}" + (f" — {msg[:150]}" if msg else "")) from None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise ReadingError(f"Azure injoignable ({getattr(e, 'reason', e)}) : vérifier l'endpoint et le réseau.") from None

    def read(self, content: bytes, mimetype: str = "") -> str:
        """Text of the document (printed and handwritten), via the « Read » model."""
        c = self.cfg
        service = "formrecognizer" if c.api_version < "2024" else "documentintelligence"
        url = f"{c.endpoint}/{service}/documentModels/{c.model}:analyze?api-version={c.api_version}"
        body = json.dumps({"base64Source": base64.b64encode(content).decode()}).encode()
        status, headers, _ = self._call("POST", url, body)
        operation = next((v for k, v in headers.items() if k.lower() == "operation-location"), "")
        if status != 202 or not operation.startswith(c.endpoint):
            raise ReadingError(f"Réponse inattendue d'Azure (HTTP {status}).")
        deadline = time.monotonic() + c.timeout
        while time.monotonic() < deadline:
            time.sleep(1.5)
            _, _, result = self._call("GET", operation)
            state = result.get("status")
            if state == "succeeded":
                return (result.get("analyzeResult") or {}).get("content", "")
            if state == "failed":
                raise ReadingError("Azure n'a pas pu lire le document.")
        raise ReadingError(f"Lecture Azure trop longue (plus de {c.timeout} s).")


class FakeReader:
    """Demo: « reads » the text lines of the demo PDF (stands for Azure on fictitious letters)."""

    def read(self, content: bytes, mimetype: str = "") -> str:
        return "\n".join(m.decode("latin-1") for m in re.findall(rb"\((.*?)\) '", content))


def make_reader(cfg: Config):
    """None when the reading is off; raises ReadingError when it is on but not usable."""
    r = cfg.reading
    if not r.enabled:
        return None
    if r.kind == "fake":
        return FakeReader()
    key = os.environ.get(r.key_env, "").strip()
    if not key:
        raise ReadingError(f"Lecture des lettres activée mais la variable Windows {r.key_env} (clé Azure) est vide.")
    return AzureReader(r, key)


def readable(cfg: LetterReading, f: dict) -> bool:
    return (f.get("mimetype") or "").lower() in cfg.mimetypes and (f.get("size") or 0) <= cfg.max_mb * 1024 * 1024


def letter_signals(cfg: Config, text: str) -> Signals:
    """Customer numbers (those labelled « n° client » first, then the numbers written alone), phones and
    e-mail addresses found in the text read from a letter."""
    phones = _unique("0" + re.sub(r"\D", "", m) for m in PHONE_RE.findall(text))
    rest = PHONE_RE.sub(" ", text)
    labelled = [a or b for a, b in CUSTOMER_NO_RE.findall(rest)]
    bare = [re.sub(r"\D", "", m) for m in _BARE_NUMBER_RE.findall(CUSTOMER_NO_RE.sub(" ", rest))]
    numbers = _unique(labelled or bare)[:MAX_NUMBERS]     # a labelled number makes the others irrelevant
    emails = _unique(e.lower() for e in EMAIL_RE.findall(text) if _keep_email(cfg, e))
    return Signals(emails=emails, numbers=numbers, phones=phones)
