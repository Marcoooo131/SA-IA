"""Text enhancer: makes the raw speech recognition output readable, locally and deterministically.

Applied to every definitive segment before it is shown and sent to the gateway:
- hesitations removed (« euh », « heu », « hum », « bah euh »…);
- stutters collapsed (« je je je voudrais » → « je voudrais »);
- business vocabulary restored (« secteur alarme » → « Sector Alarm »), with the corrections of
  ``Settings.text_corrections`` (``mal entendu=>Correct; …``);
- French phone numbers grouped by two (« 0612345678 » → « 06 12 34 56 78 »);
- French typography: spaces around punctuation, capital letter at the start, final punctuation.

It NEVER adds information: no word, digit or amount is invented (the anti-invention control of the
gateway compares the note with this text). The raw recognition is kept in ``Segment.raw_text``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# hesitations only: « ben », « bon », « hein » carry meaning too often to be removed safely
FILLERS = r"(?:euh+|heu+|hum+|hm+|mmh+|mh+|bah euh|ben euh)"
_FILLER_RE = re.compile(rf"(?<![\w-]){FILLERS}(?![\w-])\s*[,.…]*", re.IGNORECASE)

# corrections of frequent recognition errors on the business vocabulary (accent-insensitive keys)
DEFAULT_CORRECTIONS: dict[str, str] = {
    "sector alarme": "Sector Alarm",
    "secteur alarme": "Sector Alarm",
    "secteur alarm": "Sector Alarm",
    "sektor alarm": "Sector Alarm",
    "sector alarm": "Sector Alarm",
    "télé surveillance": "télésurveillance",
    "tele surveillance": "télésurveillance",
    "télé-surveillance": "télésurveillance",
}

_WORD = r"[\wÀ-ÿ'’-]+"
# repetitions that are correct French (« nous nous sommes vus », « oui oui », « très très bien »)
KEEP_REPEATED = {"nous", "vous", "oui", "non", "si", "très", "tout", "bien"}
def _keep_repeated(word: str) -> bool:
    # numbers (« 22 22 ») and spelled letters (« BO, BO 2N ») are dictation, not stutters
    return word.isdigit() or (word.isupper() and len(word) <= 3) or word.lower() in KEEP_REPEATED


_PROTECTED_RE = re.compile(r"\S+@\S+|(?:https?://|www\.)\S+|\d+[.,:]\d+")  # e-mails, URLs, 3,5 / 14:30
_SEP = r"(?:[ .-]|, )?"  # « 06 12… », « 06.12… », dictated « 06, 12, 34… »
_PHONE_RE = re.compile(rf"(?<![\d+])(0[1-9]){_SEP}(\d{{2}}){_SEP}(\d{{2}}){_SEP}(\d{{2}}){_SEP}(\d{{2}})(?!\d)")
_INTL_PHONE_RE = re.compile(r"\+33[ .-]?\(?0?\)?[ .-]?([1-9])[ .-]?(\d{2})[ .-]?(\d{2})[ .-]?(\d{2})[ .-]?(\d{2})(?!\d)")


def parse_corrections(spec: str) -> dict[str, str]:
    """``"secteur alarme=>Sector Alarm; centrale d'alarme=>centrale"`` → dict. Malformed items are ignored."""
    out: dict[str, str] = {}
    for item in re.split(r"[;\n]", spec or ""):
        wrong, sep, right = item.partition("=>")
        if sep and wrong.strip() and right.strip():
            out[wrong.strip()] = right.strip()
    return out


@dataclass
class TextEnhancer:
    corrections: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_CORRECTIONS))
    remove_fillers: bool = True
    collapse_stutters: bool = True
    format_phone_numbers: bool = True
    typography: bool = True

    def __post_init__(self) -> None:
        # longest first: « secteur alarme » must win over « secteur alarm »
        items = sorted(self.corrections.items(), key=lambda kv: -len(kv[0]))
        self._corrections = [
            (re.compile(r"(?<![\w-])" + r"[\s-]+".join(map(re.escape, wrong.split())) + r"(?![\w-])", re.IGNORECASE), right)
            for wrong, right in items
        ]

    @classmethod
    def from_settings(cls, extra_corrections: str = "", enabled: bool = True) -> TextEnhancer | None:
        if not enabled:
            return None
        return cls({**DEFAULT_CORRECTIONS, **parse_corrections(extra_corrections)})

    # ------------------------------------------------------------------ steps

    def _fillers(self, text: str) -> str:
        return _FILLER_RE.sub(" ", text)

    def _stutters(self, text: str) -> str:
        # « je je je » / « le le » / « c'est c'est » ; numbers are left alone (« 22 22 » can be real)
        return re.sub(rf"(?<![\w'’-])({_WORD})(?:[\s,]+\1)+(?![\w'’-])",
                      lambda m: m.group(0) if _keep_repeated(m.group(1)) else m.group(1),
                      text, flags=re.IGNORECASE)

    def _vocabulary(self, text: str) -> str:
        for pattern, right in self._corrections:
            text = pattern.sub(right, text)
        return text

    def _phones(self, text: str) -> str:
        text = _INTL_PHONE_RE.sub(lambda m: "+33 " + " ".join(m.groups()), text)
        return _PHONE_RE.sub(lambda m: " ".join(m.groups()), text)

    def _typography(self, text: str) -> str:
        kept: list[str] = []

        def protect(m: re.Match) -> str:
            kept.append(m.group(0))
            return f"\x00{len(kept) - 1}\x00"

        text = _PROTECTED_RE.sub(protect, re.sub(r"\s+", " ", text).strip())
        text = re.sub(r"\s+([,.…])", r"\1", text)              # no space before , .
        text = re.sub(r"([,;:])(\s*[,;:])+", r"\1", text)       # leftovers of removed hesitations
        text = re.sub(r",(?=\w)", ", ", text)                    # space after a comma
        text = re.sub(r"\s*([?!;:]+)", r" \1", text)            # French: space before ? ! ; :
        text = re.sub(r"([?!;:])(?=\w)", r"\1 ", text)
        text = re.sub(r"^[\s,.;:…]+", "", text)
        text = re.sub(r"[\s,;:]+$", "", text)
        text = re.sub(r"\x00(\d+)\x00", lambda m: kept[int(m.group(1))], text)
        text = re.sub(r"(^|[.?!…] )([a-zà-ÿ])", lambda m: m.group(1) + m.group(2).upper(), text)
        # a fragment without letters (« 0761 », « 79 75 » while dictating a number) is not a sentence
        if text and text[-1] not in ".?!…»)" and re.search(r"[^\W\d_]", text):
            text += "."
        return text

    # ------------------------------------------------------------------ public

    def enhance(self, text: str) -> str:
        if not text or not text.strip() or text.startswith("["):  # « [passage non transcrit] » kept as is
            return text
        if self.remove_fillers:
            text = self._fillers(text)
        if self.collapse_stutters:
            text = self._stutters(text)
        text = self._vocabulary(text)
        if self.format_phone_numbers:
            text = self._phones(text)
        if self.typography:
            text = self._typography(text)
        # only hesitations: nothing left to say
        return "" if not re.search(r"\w", text) else text
