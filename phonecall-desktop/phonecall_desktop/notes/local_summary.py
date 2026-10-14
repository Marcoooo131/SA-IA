"""Note WITHOUT AI: the general Phone Call template (``notes/template``) filled on the PC.

No model, no network, no token. This module holds the text helpers (sentences, markers, figures,
names, phone numbers) used by the rules of ``notes/template/rules.py``, and the ``local`` note
client. The program does not understand the conversation: it quotes what was said, classifies it
with explicit rules and marks everything else « Aucune information notifiée » or « À confirmer ».
"""

from __future__ import annotations

import functools
import re
import unicodedata
from dataclasses import dataclass

from ..transcript.assembler import Segment
from .business import Category
from .client import NoteClient, NoteResult

VERSION = "sans-ia-v2"
NO_CONTENT_TEXT = "Appel sans échange exploitable (aucune conversation reconnue)."
MIN_WORDS = 15
MAX_QUOTE_CHARS = 400


def norm(text: str) -> str:
    """Lowercase, no accents, straight apostrophes: for matching only (quotes keep the original)."""
    text = unicodedata.normalize("NFKD", text.lower().replace("’", "'"))
    return "".join(c for c in text if not unicodedata.combining(c))


def _markers(*words: str) -> tuple[str, ...]:
    return tuple(norm(w) for w in words)


REQUEST = _markers("je voudrais", "je souhaite", "je veux", "j'aimerais", "je vous appelle", "j'appelle",
                   "est-ce que", "est-ce qu'", "pouvez-vous", "pourriez-vous", "combien", "comment", "pourquoi",
                   "probleme", "ne marche", "ne fonctionne", "en panne", "sonne", "bip", "resilier", "demenage")
PROPOSAL = _markers("je vous propose", "je peux vous proposer", "nous pouvons vous proposer", "offert", "offerts",
                    "remise", "gratuit", "geste commercial", "rendez-vous", "un technicien", "devis")
COMMITMENT = _markers("je vais", "je vous envoie", "je viens de vous envoyer", "je vous rappelle", "je vous rappellerai",
                      "je transmets", "nous allons", "on va", "je programme", "c'est note", "j'ai applique",
                      "j'ai enregistre", "j'ai note", "je vous confirme", "vous allez recevoir", "vous recevrez",
                      "je rappellerai", "je vous recontacte")
OUTCOME = _markers("ca me va", "je garde", "j'accepte", "ok pour", "je prefere", "je ne souhaite pas", "non merci",
                   "je refuse", "je vais reflechir", "je reflechis", "je rappellerai", "je maintiens", "dans ce cas",
                   "je veux bien", "je ne veux pas", "pas interesse")
WEAK_OUTCOME = _markers("d'accord", "parfait", "tres bien", "ok")
# Removed before judging whether a sentence says something (greetings, politeness, company name)
SMALL_TALK = _markers("sector alarm", "merci beaucoup", "au revoir", "bonne journee", "bonne soiree", "je vous ecoute",
                      "aucun souci", "tres bien", "d'accord", "bonjour", "merci", "parfait", "allo", "oui", "non",
                      "madame", "monsieur")

NUMBER_WORDS = ("un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante"
                "|cinquante|soixante|cent|cents|mille")
MONTHS = "janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre"
DAYS = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche"
FIGURES = [
    re.compile(rf"\b(?:\d+(?:[.,]\d+)?|(?:{NUMBER_WORDS})(?:[- ](?:{NUMBER_WORDS}))*)\s?(?:€|euros?)(?:\s(?:par|/)\s?mois)?"),
    re.compile(rf"\b(?:le\s)?(?:\d{{1,2}}|1er|premier)\s(?:{MONTHS})(?:\s\d{{4}})?\b"),
    re.compile(rf"\b(?:{DAYS})(?:\sprochain|\s\d{{1,2}})?\b"),
    re.compile(r"\b(?:la semaine|le mois|l'annee) prochaine?\b|\bdemain\b|\bapres-demain\b"),
    re.compile(rf"\b(?:\d+|{NUMBER_WORDS})\s(?:mois|semaines?|jours|ans)(?:\s(?:offerts?|gratuits?))?\b"),
    re.compile(r"\b\d{1,2}\s?h(?:\s?\d{2})?\b"),
]


@functools.lru_cache(maxsize=4096)
def _marker_rx(marker: str) -> re.Pattern:
    end = r"(?![a-z0-9])" if len(marker) <= 4 else ""  # « car » must not match « carte »
    return re.compile(rf"(?<![a-z0-9]){re.escape(marker)}{end}")


@dataclass
class Sentence:
    index: int  # order in the call
    speaker: str  # advisor | remote
    text: str
    n: str  # normalised
    uncertain: bool

    def has(self, markers: tuple[str, ...]) -> bool:
        """A marker matches at the start of a word: « coûte » is not found in « écoute »."""
        return any(_marker_rx(m).search(self.n) for m in markers)

    @property
    def words(self) -> int:
        return len(self.text.split())


def split_sentences(segments: list[Segment]) -> list[Sentence]:
    out: list[Sentence] = []
    for seg in segments:
        for part in re.split(r"(?<=[.!?…])\s+", seg.text.strip()):
            part = part.strip()
            if part:
                out.append(Sentence(len(out), seg.speaker, part, norm(part), seg.uncertain))
    return out


def _stem(keyword: str) -> str:
    k = norm(keyword).strip()
    return k if " " in k or len(k) <= 5 else k[: max(5, len(k) - 2)]  # "résilier" also matches "résiliation"


def detect_category(sentences: list[Sentence], categories: list[Category]) -> tuple[Category | None, list[str]]:
    text = " ".join(s.n for s in sentences)
    best, best_hits = None, []
    for cat in categories:
        hits = [k for k in cat.keywords if re.search(rf"\b{re.escape(_stem(k))}", text)]
        if len(hits) > len(best_hits):
            best, best_hits = cat, hits
    return best, best_hits


def find_figures(sentences: list[Sentence]) -> tuple[list[str], list[str]]:
    """Figures quoted in the call (normalised spelling), and those only heard in uncertain passages."""
    sure: list[str] = []
    unsure: list[str] = []
    for s in sentences:
        for rx in FIGURES:
            for m in rx.finditer(s.n):
                value = m.group(0).strip()
                target = unsure if s.uncertain else sure
                if value not in sure and value not in target:
                    target.append(value)
    def dedupe(values: list[str]) -> list[str]:  # "deux mois" is part of "deux mois offerts"
        return [v for v in values if not any(v != o and v in o for o in values)]

    sure = dedupe(sure)
    return sure, [v for v in dedupe(unsure) if not any(v in o for o in sure)]


def _quote(text: str) -> str:
    text = text.strip()
    if len(text) > MAX_QUOTE_CHARS:
        text = text[:MAX_QUOTE_CHARS].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return f"« {text} »"


def _substantive(s: Sentence) -> bool:
    core = s.n
    for phrase in SMALL_TALK:
        core = re.sub(rf"\b{re.escape(phrase)}\b", " ", core)
    return not s.uncertain and len(re.findall(r"[a-z0-9']+", core)) >= 3


TITLE = r"(?:Madame|Monsieur|Mademoiselle|Mme|M\.)"
NAME = r"[A-ZÀ-Ý][a-zà-ÿ'-]+(?:[ -][A-ZÀ-Ý][a-zà-ÿ'-]+)?"
NOT_NAMES = {"Sector", "Alarm", "Bonjour", "Bonsoir", "Oui", "Non", "Merci", "Très", "Alors", "Donc", "Je", "Vous",
             "Madame", "Monsieur", "Allô", "Ok", "Parfait", "Bien", "Voilà", "Bah", "Euh", "Société", "Societe"}
SELF_INTRO = re.compile(rf"(?:je m'appelle|mon nom est|mon nom c'est|je suis|c'est|ici)\s+(?:({TITLE})\s+)?({NAME})")
ADDRESSED = re.compile(rf"\b({TITLE})\s+({NAME})")
COMPANY_GREETING = re.compile(rf"(?:Sector Alarm,?\s+({NAME})\b|({NAME}),?\s+(?:de\s+)?(?:la\s+)?(?:[Ss]oci[ée]t[ée]\s+)?Sector Alarm|({NAME}),?\s+(?:à votre écoute|pour vous servir))")
PHONE = re.compile(r"(?<!\d)(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)")


def _clean(text: str) -> str:
    return text.replace("’", "'")


def _name(match: re.Match | None, title_group: int | None, name_group: int) -> str | None:
    if not match or match.group(name_group).split()[0] in NOT_NAMES:
        return None
    title = match.group(title_group) if title_group else None
    return f"{title} {match.group(name_group)}" if title else match.group(name_group)


def find_customer_name(sentences: list[Sentence]) -> str | None:
    """Self-introduction of the remote party, then how the advisor addresses them ("Madame Durand")."""
    for s in sentences:
        if s.speaker == "remote" and (n := _name(SELF_INTRO.search(_clean(s.text)), 1, 2)):
            return n
    for speaker in ("advisor", "remote"):
        for s in sentences:
            if s.speaker == speaker and (n := _name(ADDRESSED.search(_clean(s.text)), 1, 2)):
                return n
    return None


def find_agent_name(sentences: list[Sentence]) -> str | None:
    for s in sentences:
        if s.speaker != "advisor":
            continue
        text = _clean(s.text)
        if m := COMPANY_GREETING.search(text):
            n = m.group(1) or m.group(2) or m.group(3)
            if n.split()[0] not in NOT_NAMES:
                return n
        if (n := _name(SELF_INTRO.search(text), None, 2)) and not text.lower().startswith("c'est"):
            return n
    return None


def find_phone(sentences: list[Sentence]) -> str | None:
    for speaker in ("remote", "advisor"):
        for s in sentences:
            if s.speaker == speaker and (m := PHONE.search(s.text)):
                digits = re.sub(r"\D", "", m.group(0).replace("+33", "0"))
                return " ".join(digits[i:i + 2] for i in range(0, 10, 2))
    return None


def transcript_text(segments: list[Segment]) -> str:
    return " ".join(s.text.strip() for s in segments)


def metadata_text(ctx) -> str:
    """Authorised data of the PC, for the check (numbers of the date, duration and agent)."""
    import time as _time

    parts = [ctx.agent_name, str(ctx.duration_s)]
    if ctx.started_at:
        parts.append(_time.strftime("%d/%m/%Y à %H:%M", _time.localtime(ctx.started_at)))
    minutes, seconds = divmod(int(ctx.duration_s or 0), 60)
    parts.append(f"{minutes} min {seconds:02d} s {seconds} s")
    return " ; ".join(parts)  # separated: « 10:32 » and « 1 min » must not read as « 321 »


def summarize(segments: list[Segment], ctx, categories: list[Category], template=None) -> NoteResult:
    """Phone Call in the general template, without AI, then automatic check."""
    from .template import check, load_template, points_to_verify, render
    from .template.rules import fill

    template = template or load_template()
    sentences = split_sentences(segments)
    if sum(s.words for s in sentences) < MIN_WORDS:
        return NoteResult(text=NO_CONTENT_TEXT, no_usable_content=True, prompt_version=f"{VERSION}/{template.version}",
                          model="sans IA",
                          flags=[{"code": "conversation_insuffisante", "severity": "warning",
                                  "message": "Trop peu de paroles reconnues pour remplir le compte rendu."}])
    note = fill(template, sentences, categories, ctx)
    flags = [{"code": "sans_ia", "severity": "warning",
              "message": "Note sans IA : phrases recopiées de la transcription et classées par règles. "
                         "Relisez et complétez avant de coller dans le CRM."}]
    flags += check(note, transcript_text(segments), metadata_text(ctx))
    return NoteResult(
        text=render(note), category=note.variant, flags=flags, points_to_verify=points_to_verify(note),
        prompt_version=f"{VERSION}/{template.version}", model="sans IA", cost_usd=0.0,
    )


class LocalSummaryNoteClient(NoteClient):
    """Note mode ``local``: general Phone Call template filled without AI, no network, no cost."""

    name = "local"

    def __init__(self, categories: list[Category], agent_name: str = "", template=None):
        from .template import load_template

        self.categories = categories
        self.agent_name = agent_name
        self.template = template or load_template()

    def generate(self, segments: list[Segment], duration_s: int, request_id: str, meta: dict | None = None) -> NoteResult:
        from .template import CallContext

        meta = meta or {}
        ctx = CallContext(direction=meta.get("direction"), variant=meta.get("variant"), started_at=meta.get("started_at"),
                          duration_s=duration_s, agent_name=self.agent_name)
        return summarize(segments, ctx, self.categories, self.template)

    def describe(self) -> dict:
        return {"mode": "sans IA", "version": VERSION, "template": self.template.version,
                "fields": len(self.template.all_fields()), "categories": len(self.categories)}
