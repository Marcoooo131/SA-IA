"""Note WITHOUT AI: extractive summary of the call in at most 10 lines, computed on the PC.

No model, no network, no token. The code does not understand the conversation: it picks
sentences that were actually said (quoted, never reworded), using explicit rules:
- the motive: categories and keywords of ``business.yaml`` (indicative);
- the request: first sentences of the remote party with a request marker;
- the advisor's answers: proposals and information; the follow-up: commitments ("je vais", "je vous envoie"...);
- the answer of the remote party: agreement / refusal / postponement markers near the end;
- the figures quoted: amounts, dates, durations (regular expressions).
Uncertain passages of the transcription are not quoted; figures taken from them are listed as
points to verify. The advisor must re-read and complete the note.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from dataclasses import dataclass

from ..transcript.assembler import Segment
from .business import Category
from .client import NoteClient, NoteResult

VERSION = "sans-ia-v1"
NO_CONTENT_TEXT = "Appel sans échange exploitable (aucune conversation reconnue)."
MIN_WORDS = 15
MAX_QUOTE_CHARS = 170


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


@dataclass
class Sentence:
    index: int  # order in the call
    speaker: str  # advisor | remote
    text: str
    n: str  # normalised
    uncertain: bool

    def has(self, markers: tuple[str, ...]) -> bool:
        return any(m in self.n for m in markers)

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


def summarize(segments: list[Segment], duration_s: int, categories: list[Category], max_lines: int = 10) -> NoteResult:
    sentences = split_sentences(segments)
    if sum(s.words for s in sentences) < MIN_WORDS:
        return NoteResult(text=NO_CONTENT_TEXT, no_usable_content=True, prompt_version=VERSION, model="sans IA")

    category, hits = detect_category(sentences, categories)
    figures, unsure_figures = find_figures(sentences)
    remote = [s for s in sentences if s.speaker == "remote" and _substantive(s)]
    advisor = [s for s in sentences if s.speaker == "advisor" and _substantive(s)]
    used: set[int] = set()
    quoted: list[str] = []

    def repeats(s: Sentence) -> bool:  # same sentence with another number, already quoted
        return any(difflib.SequenceMatcher(None, s.n, q).ratio() > 0.85 for q in quoted)

    def pick(pool: list[Sentence], markers: tuple[str, ...] | None, n: int, last: bool = False) -> list[Sentence]:
        cands = [s for s in pool if s.index not in used and (markers is None or s.has(markers))]
        chosen: list[Sentence] = []
        for s in reversed(cands) if last else cands:
            if len(chosen) == n:
                break
            if not repeats(s):
                chosen.append(s)
                quoted.append(s.n)
        used.update(s.index for s in chosen)
        return sorted(chosen, key=lambda s: s.index)

    request = pick(remote, REQUEST, 2) or pick(remote, None, 1)
    commitments = pick(advisor, COMMITMENT, 1, last=True)
    late = [s for s in remote if s.index >= len(sentences) // 2]
    answer = pick(late, OUTCOME, 1, last=True) or pick(late, WEAK_OUTCOME, 1, last=True)
    proposals = pick(advisor, PROPOSAL, 2)
    information = pick(advisor, None, 1) if len(proposals) < 2 else []
    details = pick(remote, None, 1)

    minutes, seconds = divmod(int(duration_s or 0), 60)
    motive = f"{category.label} (mots-clés : {', '.join(hits[:3])})" if category else "non déterminé"
    length = f"{minutes} min {seconds:02d} s" if minutes else f"{seconds} s"
    lines = [f"Motif : {motive} — appel de {length}"]
    lines += [f"Demande de l'interlocuteur : {_quote(s.text)}" for s in request]
    lines += [f"Interlocuteur : {_quote(s.text)}" for s in details]
    lines += [f"Conseiller : {_quote(s.text)}" for s in sorted(proposals + information, key=lambda s: s.index)]
    lines += [f"Réponse de l'interlocuteur : {_quote(s.text)}" for s in answer]
    lines += [f"Suite prévue : {_quote(s.text)}" for s in commitments]
    if figures:
        lines.append("Éléments chiffrés cités : " + ", ".join(figures[:6]))
    if len(lines) > max_lines:  # keep the motive and the last line(s) (answer, follow-up, figures)
        lines = lines[: max_lines - 3] + lines[-3:] if max_lines > 4 else lines[:max_lines]

    flags = [{"code": "sans_ia", "severity": "warning",
              "message": "Synthèse sans IA : phrases recopiées de la transcription, sans reformulation. "
                         "Relisez, complétez et vérifiez le motif avant de coller dans le CRM."}]
    if not category:
        flags.append({"code": "motif_indetermine", "severity": "warning",
                      "message": "Motif non reconnu par les mots-clés : à préciser."})
    return NoteResult(
        text="\n".join(lines), category=category.key if category else None, flags=flags,
        points_to_verify=[f"« {v} » (passage incertain de la transcription)" for v in unsure_figures],
        prompt_version=VERSION, model="sans IA", cost_usd=0.0,
    )


class LocalSummaryNoteClient(NoteClient):
    """Note mode ``local``: no AI, no network, no cost."""

    name = "local"

    def __init__(self, categories: list[Category], max_lines: int = 10):
        self.categories = categories
        self.max_lines = max_lines

    def generate(self, segments: list[Segment], duration_s: int, request_id: str) -> NoteResult:
        return summarize(segments, duration_s, self.categories, self.max_lines)

    def describe(self) -> dict:
        return {"mode": "sans IA", "version": VERSION, "max_lines": self.max_lines, "categories": len(self.categories)}
