"""Rule-based quality control of a generated report.

The score is an explicit, deterministic *quality indicator* computed from the flags below.
It is NOT a calibrated probability of correctness and must never be presented as such.
Calibration (correlating the score with expert ratings) is planned during the pilot.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from dataclasses import asdict, dataclass

from ..config import BusinessConfig
from ..generation.schema import UNDETERMINED, StructuredReport
from ..transcription.base import TranscriptResult

BLOCKING = "blocking"
WARNING = "warning"
PENALTY = {BLOCKING: 40, WARNING: 10}

PROPOSAL_MARKERS = (
    "je peux vous proposer", "je vous propose", "je pourrais", "on pourrait", "nous pourrions",
    "si vous voulez", "si vous le souhaitez", "éventuellement", "il est possible", "pourra", "pourrait",
)
COMPLETION_MARKERS = (
    "j'ai ", "je viens de", "c'est fait", "c'est noté", "a été", "ont été", "est enregistré",
    "envoyé", "appliqué", "enregistré", "validé", "programmé", "c'est fixé", "je confirme",
)
FRENCH_NUMBER_WORDS = {
    "un", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze",
    "quinze", "vingt", "trente", "quarante", "cinquante", "soixante", "cent", "mille",
}
NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?")
AMOUNT_WORD_RE = re.compile(r"\b([a-zéèû-]+)\s+(euros?|€|mois|jours?|semaines?|ans?)\b", re.I)
SEGMENT_REF_RE = re.compile(r"\bS\d+\b")
PHONE_RE = re.compile(r"(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


@dataclass
class Flag:
    code: str
    severity: str
    message: str


@dataclass
class QualityResult:
    score: int
    flags: list[Flag]
    needs_review: bool

    @property
    def blocking(self) -> list[Flag]:
        return [f for f in self.flags if f.severity == BLOCKING]

    def flags_as_dicts(self) -> list[dict]:
        return [asdict(f) for f in self.flags]


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    text = text.replace("’", "'")
    return re.sub(r"\s+", " ", text)


def _numbers(text: str) -> set[str]:
    return {n.replace(",", ".") for n in NUMBER_RE.findall(text)}


class ReportValidator:
    def __init__(self, business: BusinessConfig):
        self.business = business

    def validate(self, report: StructuredReport, text: str, transcript: TranscriptResult) -> QualityResult:
        flags: list[Flag] = []
        add = lambda code, sev, msg: flags.append(Flag(code, sev, msg))  # noqa: E731
        cfg = self.business
        segs = {s.id: s for s in transcript.segments}
        transcript_text = _norm(transcript.full_text())

        # 1. Empty / length
        stripped = text.strip()
        if not stripped:
            add("empty_text", BLOCKING, "Le compte rendu est vide.")
        if len(stripped) > cfg.report.max_chars:
            add("too_long", BLOCKING, f"Le compte rendu dépasse {cfg.report.max_chars} caractères.")
        if stripped and len(stripped) < cfg.report.min_chars and not report.no_usable_content:
            add("too_short", WARNING, "Le compte rendu est très court.")

        # 2. Content usability consistency
        too_few_words = transcript.word_count < cfg.quality.min_transcript_words
        if report.no_usable_content and not too_few_words and transcript.word_count >= 3 * cfg.quality.min_transcript_words:
            add("no_content_contradiction", BLOCKING, "L'IA déclare l'appel inexploitable alors que la transcription contient un échange.")
        if not report.no_usable_content and too_few_words:
            add("content_from_empty_call", BLOCKING, "Contenu produit à partir d'une transcription quasi vide.")

        # 3. Transcript quality
        if transcript.segments and transcript.uncertain_count / len(transcript.segments) > cfg.quality.max_uncertain_ratio:
            add("transcript_low_quality", WARNING, "Une part importante de la transcription est incertaine ou inaudible.")
        if not transcript.speaker_labels:
            add("speakers_unknown", WARNING, "Locuteurs non identifiés : vérifier l'attribution client / conseiller.")

        # 4. Evidence: every item must cite existing segments
        for section, item in report.all_items():
            if not item.evidence:
                add("missing_evidence", BLOCKING, f"Élément sans justification ({section}) : « {item.text[:80]} »")
                continue
            unknown = [e for e in item.evidence if e not in segs]
            if unknown:
                add("unknown_evidence", BLOCKING, f"Référence(s) inexistante(s) {unknown} ({section}).")
                continue
            ev = [segs[e] for e in item.evidence]
            if all(s.uncertain for s in ev) and not item.to_verify:
                add("asserted_from_uncertain", BLOCKING, f"Affirmation fondée uniquement sur un passage incertain ({section}) : « {item.text[:80]} »")
            if section == "customer_statements" and transcript.speaker_labels and not any(s.speaker == "customer" for s in ev):
                add("speaker_mismatch", WARNING, f"Propos attribué au client sans segment du client : « {item.text[:80]} »")
            if section == "advisor_information" and transcript.speaker_labels and not any(s.speaker == "advisor" for s in ev):
                add("speaker_mismatch", WARNING, f"Information attribuée au conseiller sans segment du conseiller : « {item.text[:80]} »")

        # 5. Possibility presented as an action actually done
        for item in report.actions_done:
            ev_text = " ".join(_norm(segs[e].text) for e in item.evidence if e in segs)
            if ev_text and any(m in ev_text for m in PROPOSAL_MARKERS) and not any(m in ev_text for m in COMPLETION_MARKERS):
                add("possible_action_as_done", BLOCKING, f"Action présentée comme réalisée alors qu'elle n'a été que proposée : « {item.text[:80]} »")

        # 6. Contradiction: same action both done and to do
        for done in report.actions_done:
            for todo in report.actions_todo:
                if difflib.SequenceMatcher(None, _norm(done.text), _norm(todo.text)).ratio() > 0.85:
                    add("done_and_todo", BLOCKING, f"Action à la fois réalisée et à faire : « {done.text[:80]} »")

        # 7. Numbers, amounts, dates that do not appear in the transcript
        missing_numbers = sorted(_numbers(_norm(text)) - _numbers(transcript_text))
        if missing_numbers:
            add("unsupported_number", BLOCKING, f"Valeur(s) absente(s) de la transcription : {', '.join(missing_numbers)}")
        for word, unit in AMOUNT_WORD_RE.findall(_norm(text)):
            if word in FRENCH_NUMBER_WORDS and f"{word} {unit}" not in transcript_text:
                add("unsupported_number", BLOCKING, f"Quantité absente de la transcription : « {word} {unit} »")

        # 8. Category
        keys = cfg.category_keys()
        if report.category != UNDETERMINED and report.category not in keys:
            add("unknown_category", BLOCKING, f"Catégorie inconnue : {report.category}")
        elif report.category != UNDETERMINED:
            if not report.category_evidence or any(e not in segs for e in report.category_evidence):
                add("category_unsupported", WARNING, "Catégorie sans justification valide.")
            cat = next(c for c in cfg.categories if c.key == report.category)
            if cat.keywords and not any(_norm(k) in transcript_text for k in cat.keywords):
                add("category_keywords_absent", WARNING, "Aucun mot-clé de la catégorie dans la transcription : vérifier la catégorie.")

        # 9. Uncertain critical information
        if report.points_to_verify or any(i.to_verify for _, i in report.all_items()):
            add("points_to_verify", WARNING, "Des informations doivent être vérifiées par le conseiller.")

        # 10. Text hygiene
        if SEGMENT_REF_RE.search(text):
            add("internal_reference_in_text", WARNING, "Le texte contient des références internes (S1, S2…).")
        if PHONE_RE.search(text) or EMAIL_RE.search(text):
            add("personal_data_in_text", WARNING, "Le texte contient un numéro de téléphone ou un e-mail.")
        sentences = [s.strip() for s in re.split(r"[.\n]", _norm(text)) if len(s.strip()) > 20]
        if len(sentences) != len(set(sentences)):
            add("repetition", WARNING, "Phrase répétée dans le compte rendu.")

        # Deduplicate identical flags
        unique: dict[tuple[str, str], Flag] = {}
        for f in flags:
            unique.setdefault((f.code, f.message), f)
        flags = list(unique.values())

        score = max(0, 100 - sum(PENALTY[f.severity] for f in flags))
        needs_review = (
            cfg.quality.always_human_review
            or not cfg.validated
            or any(f.severity == BLOCKING for f in flags)
            or score < cfg.quality.auto_ready_min_score
        )
        return QualityResult(score=score, flags=flags, needs_review=needs_review)
