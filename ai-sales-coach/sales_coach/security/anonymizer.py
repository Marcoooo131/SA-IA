"""Anonymisation des transcriptions : noms, téléphones, e-mails, IBAN, adresses, numéros de contrat.

Approche par motifs (hors ligne). Elle réduit fortement l'exposition des données mais n'est pas
infaillible (un prénom isolé et rare peut passer) : la relecture humaine reste recommandée avant
tout partage, et OBLIGATOIRE avant tout envoi vers un service externe.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from sales_coach.core.models import Transcript

PATTERNS: list[tuple[str, re.Pattern]] = [
    ("EMAIL", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")),
    ("IBAN", re.compile(r"\bFR\d{2}(?:\s?\d{4}){5}\s?\d{3}\b", re.I)),
    ("CARTE", re.compile(r"\b(?:\d{4}[\s-]?){3}\d{4}\b")),
    ("TELEPHONE", re.compile(r"(?:(?:\+|00)33[\s.-]?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b")),
    ("CONTRAT", re.compile(r"\b(?:contrat|dossier|client|r[ée]f[ée]rence|abonnement)\s*(?:n[°o]\.?|num[ée]ro)?\s*:?\s*([A-Z]{0,4}\d[\dA-Z-]{4,})\b", re.I)),
    ("ADRESSE", re.compile(r"\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.|boulevard|bd|chemin|impasse|all[ée]e|place|route|quai|cours|r[ée]sidence)\s+[A-ZÀ-Ÿa-zà-ÿ' -]{2,40}", re.I)),
    ("CODE_POSTAL", re.compile(r"\b(?:0[1-9]|[1-8]\d|9[0-5]|2[AB])\d{3}\b")),
]
TITLE_NAME = re.compile(r"\b(Monsieur|Madame|Mademoiselle|M\.|Mme|Mlle)\s+((?:[A-ZÀ-Ÿ][\wà-ÿ'-]+)(?:\s+[A-ZÀ-Ÿ][\wà-ÿ'-]+)?)")
INTRO_NAME = re.compile(r"\b((?i:je m'appelle|je suis|moi c'est|ici|c'est))\s+((?:[A-ZÀ-Ÿ][a-zà-ÿ'-]+)(?:\s+[A-ZÀ-Ÿ][A-ZÀ-Ÿa-zà-ÿ'-]+)?)")
NOT_NAMES = {"Sector", "Alarm", "Service", "Bonjour", "Madame", "Monsieur", "France", "Bordeaux", "Paris", "Lyon", "Marseille", "Lille",
             "Nantes", "Toulouse", "Canada", "Belgique", "Suisse", "Oui", "Non", "Le", "La", "Les", "En", "Bien", "Très", "Au", "Du", "Désolé", "Ravi", "Ravie",
             "Content", "Contente", "Pressé", "Pressée", "Mécontent", "Mécontente", "Propriétaire", "Locataire", "Client", "Cliente", "Agent"}


@dataclass
class AnonymizationResult:
    text: str
    replacements: dict[str, str] = field(default_factory=dict)  # original -> jeton (à NE PAS stocker en clair)
    counts: dict[str, int] = field(default_factory=dict)


class Anonymizer:
    def __init__(self, keep_agent_first_name: bool = False):
        self.mapping: dict[str, str] = {}
        self.counters: dict[str, int] = {}
        self.keep_agent_first_name = keep_agent_first_name

    def _token(self, kind: str, original: str) -> str:
        key = f"{kind}:{original.lower()}"
        if key not in self.mapping:
            self.counters[kind] = self.counters.get(kind, 0) + 1
            self.mapping[key] = f"[{kind}_{self.counters[kind]}]"
        return self.mapping[key]

    def anonymize(self, text: str, known_names: list[str] | None = None) -> AnonymizationResult:
        counts: dict[str, int] = {}

        def sub(kind):
            def _r(m):
                counts[kind] = counts.get(kind, 0) + 1
                raw = m.group(0)
                trailing = raw[len(raw.rstrip()):]
                return self._token(kind, raw.strip()) + trailing
            return _r

        def contract_sub(m):
            counts["CONTRAT"] = counts.get("CONTRAT", 0) + 1
            return m.group(0).replace(m.group(1), self._token("CONTRAT", m.group(1)))

        for kind, pat in PATTERNS:
            text = pat.sub(contract_sub if kind == "CONTRAT" else sub(kind), text)

        def name_sub(m):
            name = m.group(2)
            parts = [p for p in name.split() if p not in NOT_NAMES]
            if not parts:
                return m.group(0)
            counts["NOM"] = counts.get("NOM", 0) + 1
            return f"{m.group(1)} {self._token('NOM', ' '.join(parts))}"

        text = TITLE_NAME.sub(name_sub, text)
        text = INTRO_NAME.sub(lambda m: name_sub(m) if m.group(2).split()[0] not in NOT_NAMES else m.group(0), text)
        for name in known_names or []:
            if name and len(name) > 1:
                text, n = re.subn(rf"\b{re.escape(name)}\b", self._token("NOM", name), text)
                if n:
                    counts["NOM"] = counts.get("NOM", 0) + n
        return AnonymizationResult(text, dict(self.mapping), counts)


def anonymize_transcript(transcript: Transcript, known_names: list[str] | None = None) -> tuple[Transcript, dict[str, int]]:
    an = Anonymizer()
    totals: dict[str, int] = {}
    for u in transcript.utterances:
        res = an.anonymize(u.text, known_names)
        u.text = res.text
        for k, v in res.counts.items():
            totals[k] = totals.get(k, 0) + v
    transcript.audio_metrics["anonymized"] = True
    transcript.audio_metrics["anonymization_counts"] = totals
    return transcript, totals
