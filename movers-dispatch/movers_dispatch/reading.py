"""Reading a mail or a task, in memory only: its category (Résiliation / Déménagement) and the
identifiers that point to the client (e-mail addresses, customer number, phone numbers).

Nothing read here is stored: the journal keeps only the category and *how* the client was found,
with masked values (« as•••@icloud.com », « 06••••0135 »).
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser

from .config import Config, normalize_name, task_key
from .models import Email

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
# « Numéro de client : 10008705 », « numéro client 300926 », « client n° 101286… », « N° client: … »
CUSTOMER_NO_RE = re.compile(
    r"(?:num[eé]ro|n°|no\.?|num\.?)\s*(?:de\s+)?client\s*:?\s*(\d{5,10})"
    r"|client\s*(?:n°|no\.?|num[eé]ro|num\.?)\s*:?\s*(\d{5,10})", re.IGNORECASE)
# French numbers: 06 72 87 01 35, 06.72.87.01.35, 0672870135, +33672870135, +33 6 72 87 01 35, 0033…
PHONE_RE = re.compile(r"(?<![\d+])(?:\+33\s?|0033\s?|0)([1-9](?:[\s.-]?\d{2}){4})(?!\d)")


class _Text(HTMLParser):
    BLOCK = {"br", "p", "div", "tr", "li", "table", "h1", "h2", "h3", "h4", "td"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self._skip += 1
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head") and self._skip:
            self._skip -= 1
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def html_to_text(value: str) -> str:
    if not value:
        return ""
    if "<" not in value:
        return html.unescape(value)
    p = _Text()
    p.feed(value)
    return re.sub(r"[ \t\xa0]+", " ", "".join(p.parts))


# ------------------------------------------------------------------ category
def categorize(cfg: Config, activity: Email) -> tuple[str | None, str, bool]:
    """Returns (category key or None, why, sure): sure = found by the task name; otherwise read from the
    words of the request, which some rotations want confirmed by a person (Résiliation or exception)."""
    # 1. the name of the task decides (« Movers - Résiliation exception » before « Movers - Résiliation »)
    subject = task_key(activity.subject)
    names = sorted(((n, c) for c in cfg.categories.items for n in c.task_names if n), key=lambda x: -len(x[0]))
    for name, cat in names:
        base = name[:-1] if name.endswith("s") else name                 # « Takeover » / « Takeovers »
        if re.search(rf"(?:^| ){re.escape(base)}s?(?: |$)", subject):
            return cat.key, f"nom de tâche « {cat.label} »", True
    # 2. otherwise: words of the request — for a mail its subject and text; for a task with another name
    # (« Moving - CS », chatbot…) its description only, the title being the channel, not the request
    text = normalize_name(activity.text if activity.kind == "task" else f"{activity.subject}\n{activity.text}")
    for cat in cfg.categories.items:
        hit = next((w for w in cat.words if w and w in text), None)
        if hit:
            return cat.key, f"mot « {hit} »", False
    if activity.kind == "task" and cfg.categories.get(cfg.categories.task_fallback):
        return cfg.categories.task_fallback, "tâche sans nom connu ni mot reconnu (règle d'avant : résiliation)", False
    return None, "nom de tâche inconnu et aucun mot reconnu", False


def category_label(cfg: Config, cat: str | None) -> str:
    return cfg.categories.label(cat)


# ------------------------------------------------------------------ identifiers
@dataclass
class Signals:
    sender: list[str] = field(default_factory=list)       # e-mail address of the sender
    emails: list[str] = field(default_factory=list)       # other addresses written in the text (HubSpot « Email »)
    numbers: list[str] = field(default_factory=list)      # customer numbers written in the text
    phones: list[str] = field(default_factory=list)       # national form 0XXXXXXXXX

    def empty(self) -> bool:
        return not (self.sender or self.emails or self.numbers or self.phones)


def _keep_email(cfg: Config, address: str) -> bool:
    domain = address.rsplit("@", 1)[-1].lower()
    return not any(domain == d or domain.endswith("." + d) for d in cfg.client.ignored_domains)


def _unique(values) -> list:
    out = []
    for v in values:
        if v not in out:
            out.append(v)
    return out


def extract(cfg: Config, activity: Email) -> Signals:
    text = f"{activity.subject}\n{activity.text}"
    sender = [activity.sender.lower()] if activity.sender and _keep_email(cfg, activity.sender) else []
    emails = _unique(e.lower() for e in EMAIL_RE.findall(text) if _keep_email(cfg, e))
    numbers = _unique(a or b for a, b in CUSTOMER_NO_RE.findall(text))
    phones = _unique("0" + re.sub(r"\D", "", m) for m in PHONE_RE.findall(text))
    return Signals(sender=sender, emails=[e for e in emails if e not in sender], numbers=numbers, phones=phones)


def phone_variants(national: str) -> list[str]:
    """How a phone number may be typed in the CRM: 0672870135, 06 72 87 01 35, 06.72.87.01.35, +33…"""
    d = national[1:]
    pairs = " ".join(national[i:i + 2] for i in range(0, 10, 2))
    return _unique([national, pairs, pairs.replace(" ", "."), f"+33{d}", f"+33 {d[0]} {' '.join(d[i:i + 2] for i in range(1, 9, 2))}",
                    f"0033{d}"])


def mask(kind: str, value: str) -> str:
    if kind == "email":
        local, _, domain = value.partition("@")
        return f"{local[:2]}•••@{domain}"
    if kind == "phone":
        return f"{value[:2]}••••{value[-4:]}"
    return value   # customer numbers are account numbers, shown in the CRM anyway


SIGNAL_LABELS = {"number": "n° client écrit dans le texte", "sender": "adresse de l'expéditeur",
                 "email": "adresse e-mail écrite dans le texte", "phone": "téléphone écrit dans le texte"}
