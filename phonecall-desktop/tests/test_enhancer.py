import re

import pytest

from phonecall_desktop.audio.types import Channel
from phonecall_desktop.stt.base import TranscriptEvent
from phonecall_desktop.transcript.assembler import TranscriptAssembler
from phonecall_desktop.transcript.enhancer import TextEnhancer, parse_corrections


@pytest.fixture
def enh():
    return TextEnhancer()


@pytest.mark.parametrize("raw, expected", [
    ("euh bonjour je je je voudrais euh résilier mon contrat", "Bonjour je voudrais résilier mon contrat."),
    ("la télé surveillance,euh, ça marche", "La télésurveillance, ça marche."),
    ("j'appelle secteur alarme pour mon déménagement", "J'appelle Sector Alarm pour mon déménagement."),
    ("mon numéro c'est le 0612345678", "Mon numéro c'est le 06 12 34 56 78."),
    ("joignable au +33612345678", "Joignable au +33 6 12 34 56 78."),
    ("c'est 3,5 euros?d'accord", "C'est 3,5 euros ? D'accord."),
    ("Bonjour, Sector Alarm, que puis-je faire ?", "Bonjour, Sector Alarm, que puis-je faire ?"),
])
def test_enhance(enh, raw, expected):
    assert enh.enhance(raw) == expected


@pytest.mark.parametrize("raw", [
    "nous nous sommes vus à 14:30, oui oui",
    "le code est 22 22",
    "mon adresse est jean.dupont@exemple.fr",
])
def test_meaningful_text_is_preserved(enh, raw):
    out = enh.enhance(raw)
    assert out[:-1].lower() == raw.lower()


def test_only_hesitations_becomes_empty(enh):
    assert enh.enhance("euh... hum") == ""
    assert enh.enhance("[passage non transcrit]") == "[passage non transcrit]"


def test_no_digit_is_ever_invented(enh):
    raw = "le montant de 49,90 euros le 12 mars au 0612345678 euh euh"
    digits = lambda t: re.sub(r"\D", "", t)
    assert digits(enh.enhance(raw)) == digits(raw)


def test_custom_corrections():
    assert parse_corrections("alarme sector=>Sector Alarm; bad ; =>x;centrale d'alarme=>centrale") == {
        "alarme sector": "Sector Alarm", "centrale d'alarme": "centrale"}
    enh = TextEnhancer.from_settings("bagde=>badge")
    assert enh.enhance("le bagde ne marche plus") == "Le badge ne marche plus."
    assert TextEnhancer.from_settings(enabled=False) is None


def test_assembler_keeps_raw_text_and_leaves_partials_untouched(enh):
    asm = TranscriptAssembler(enhancer=enh)
    asm.apply(TranscriptEvent("partial", Channel.SYSTEM, "s-0", 0, 1, "euh je je"))
    assert asm.snapshot()[0].text == "euh je je"
    asm.apply(TranscriptEvent("final", Channel.SYSTEM, "s-0", 0, 2, "euh je je déménage"))
    seg = asm.final_segments()[0]
    assert seg.text == "Je déménage." and seg.raw_text == "euh je je déménage"
    asm.apply(TranscriptEvent("final", Channel.MIC, "m-0", 3, 4, "D'accord."))
    assert asm.final_segments()[1].raw_text is None
    asm.apply(TranscriptEvent("final", Channel.MIC, "m-1", 5, 6, "euh"))
    assert len(asm.final_segments()) == 2


def test_dictation_fragments_and_spelling_kept(enh):
    # a phone number dictated in pieces, then spelled out name (anonymised takeover call)
    assert [enh.enhance(t) for t in ("0649", "98 12", "34")] == ["0649", "98 12", "34"]
    assert enh.enhance("06, 39, 98, 12, 34 et c'est Monsieur Garnier, GA, GA RN, IER") == \
        "06 39 98 12 34 et c'est Monsieur Garnier, GA, GA RN, IER."
