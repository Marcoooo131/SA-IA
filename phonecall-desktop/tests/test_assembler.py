from phonecall_desktop.audio.types import Channel
from phonecall_desktop.stt.base import TranscriptEvent
from phonecall_desktop.transcript.assembler import TranscriptAssembler, similarity


def ev(kind, ch, uid, a, b, text, unc=False):
    return TranscriptEvent(kind, ch, uid, a, b, text, unc)


def test_partials_replaced_then_removed_by_final():
    asm = TranscriptAssembler()
    asm.apply(ev("partial", Channel.SYSTEM, "system-0", 1, 2, "Bonjour je"))
    asm.apply(ev("partial", Channel.SYSTEM, "system-0", 1, 3, "Bonjour je vous"))
    assert [s.text for s in asm.snapshot()] == ["Bonjour je vous"]
    asm.apply(ev("final", Channel.SYSTEM, "system-0", 1, 4, "Bonjour, je vous appelle."))
    snap = asm.snapshot()
    assert len(snap) == 1 and snap[0].final and snap[0].text == "Bonjour, je vous appelle."


def test_duplicate_final_and_late_partial_ignored():
    asm = TranscriptAssembler()
    final = ev("final", Channel.MIC, "mic-0", 0, 1, "Sector Alarm bonjour.")
    asm.apply(final)
    assert asm.apply(final) == []
    assert asm.apply(ev("partial", Channel.MIC, "mic-0", 0, 1, "Sector")) == []
    assert len(asm.snapshot()) == 1 and asm.duplicates_ignored == 2


def test_chronological_order_across_channels():
    asm = TranscriptAssembler()
    asm.apply(ev("final", Channel.SYSTEM, "system-0", 5.0, 7.0, "Je déménage."))
    asm.apply(ev("final", Channel.MIC, "mic-0", 0.5, 2.0, "Bonjour."))
    asm.apply(ev("final", Channel.MIC, "mic-1", 8.0, 9.0, "Très bien."))
    assert [s.text for s in asm.final_segments()] == ["Bonjour.", "Je déménage.", "Très bien."]
    assert asm.plain_text().splitlines()[1] == "Interlocuteur : Je déménage."


def test_echo_from_loudspeakers_is_excluded():
    asm = TranscriptAssembler()
    asm.apply(ev("final", Channel.SYSTEM, "system-0", 3.0, 6.0, "Je voudrais résilier mon contrat."))
    # the mic heard the loudspeaker (slightly shifted, slightly different recognition)
    asm.apply(ev("final", Channel.MIC, "mic-3", 3.2, 6.1, "je voudrais résilier mon contrat"))
    asm.apply(ev("final", Channel.MIC, "mic-4", 6.5, 8.0, "Je comprends."))
    finals = asm.final_segments()
    assert [s.text for s in finals] == ["Je voudrais résilier mon contrat.", "Je comprends."]
    assert any(s.echo for s in asm.snapshot())


def test_echo_detected_whatever_the_arrival_order():
    asm = TranscriptAssembler()
    asm.apply(ev("final", Channel.MIC, "mic-0", 3.2, 6.1, "je voudrais résilier mon contrat"))
    asm.apply(ev("final", Channel.SYSTEM, "system-0", 3.0, 6.0, "Je voudrais résilier mon contrat."))
    assert [s.channel for s in asm.final_segments()] == [Channel.SYSTEM]


def test_similar_words_far_apart_are_not_echo():
    asm = TranscriptAssembler()
    asm.apply(ev("final", Channel.SYSTEM, "system-0", 3.0, 4.0, "D'accord."))
    asm.apply(ev("final", Channel.MIC, "mic-0", 20.0, 21.0, "D'accord."))
    assert len(asm.final_segments()) == 2


def test_empty_final_closes_partial_without_line():
    asm = TranscriptAssembler()
    asm.apply(ev("partial", Channel.MIC, "mic-0", 0, 1, "euh"))
    asm.apply(ev("final", Channel.MIC, "mic-0", 0, 1, ""))
    assert asm.snapshot() == []


def test_similarity():
    assert similarity("Bonjour, ça va ?", "bonjour ca va") == 1.0
    assert similarity("bonjour", "") == 0.0
