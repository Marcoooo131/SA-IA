import io

from docx import Document

from sales_coach.core.models import AGENT, CLIENT, UNKNOWN
from sales_coach.transcription import apply_speaker_mapping, load_transcript_file, parse_text, unknown_labels


def test_labels_timestamps_and_continuation():
    t = parse_text("# commentaire\n[00:01:05] Conseiller : Bonjour\nmadame.\n00:12 - Cliente: Je déménage.\n(01:02) Agent — D'accord ?")
    assert [u.speaker for u in t.utterances] == [AGENT, CLIENT, AGENT]
    assert t.utterances[0].text == "Bonjour madame."
    assert t.utterances[0].start == 65 and t.utterances[1].start == 12
    assert t.has_timestamps and not t.warnings


def test_sentence_with_colon_is_not_a_speaker():
    t = parse_text("CLIENT : bonjour\nLe problème : c'est le prix\nOui : bien sûr")
    assert len(t.utterances) == 1
    assert "c'est le prix" in t.utterances[0].text


def test_unknown_labels_need_mapping():
    t = parse_text("SPEAKER_00: Bonjour, service clients.\nSPEAKER_01: Je déménage.")
    assert unknown_labels(t) == ["SPEAKER_00", "SPEAKER_01"]
    assert t.speaker_attribution == "à vérifier"
    apply_speaker_mapping(t, {"SPEAKER_00": AGENT, "SPEAKER_01": CLIENT})
    assert [u.speaker for u in t.utterances] == [AGENT, CLIENT]
    assert not any(u.speaker == UNKNOWN for u in t.utterances)
    assert not t.warnings


def test_docx_and_srt():
    doc = Document()
    doc.add_paragraph("COMMERCIAL : Bonjour")
    doc.add_paragraph("CLIENT : Je pars à Lyon")
    buf = io.BytesIO()
    doc.save(buf)
    t = load_transcript_file("a.docx", buf.getvalue())
    assert t.source == "docx" and len(t.utterances) == 2
    srt = "1\n00:00:01,000 --> 00:00:03,000\nCOMMERCIAL : Bonjour\n\n2\n00:00:04,000 --> 00:00:06,000\nCLIENT : Je déménage\n"
    t2 = load_transcript_file("a.srt", srt.encode())
    assert [u.start for u in t2.utterances] == [1, 4]


def test_audio_segments_heuristic_attribution():
    from sales_coach.transcription.audio import Segment, segments_to_transcript

    segs = [Segment(0, 2, "Bonjour service clients."), Segment(3.5, 6, "Bonjour je déménage."), Segment(6.2, 8, "et je veux résilier."),
            Segment(11, 12, "D'accord.")]
    t = segments_to_transcript(segs)
    assert len(t.utterances) == 3
    assert t.speaker_attribution == "heuristique"
    assert t.audio_metrics["raw_labels"] == ["Locuteur A", "Locuteur B", "Locuteur A"]
    assert t.audio_metrics["silences"] and t.audio_metrics["interruptions"] is None
    assert unknown_labels(t) == ["Locuteur A", "Locuteur B"]


def test_audio_without_backend_fails_explicitly(monkeypatch):
    import pytest

    from sales_coach.transcription import audio

    monkeypatch.setattr(audio, "available_backends", lambda: [])
    with pytest.raises(audio.TranscriptionUnavailable):
        audio.transcribe_audio(b"xx", "a.mp3")


def test_audio_pipeline_with_stubbed_engine(monkeypatch):
    """Pipeline audio complet avec un moteur Whisper simulé : fichier temporaire supprimé, métriques calculées."""
    import os

    from sales_coach.transcription import audio

    seen = {}

    def fake_runner(path, model, device):
        seen["path"] = path
        assert os.path.exists(path)
        return [audio.Segment(0, 2, "Bonjour, service clients."), audio.Segment(3, 5, "Je déménage à Lyon.")]

    monkeypatch.setattr(audio, "_resolve_backend", lambda b: "faster_whisper")
    monkeypatch.setattr(audio, "_run_faster_whisper", fake_runner)
    t = audio.transcribe_audio(b"fake-mp3", "appel.mp3")
    assert not os.path.exists(seen["path"])
    assert t.source == "audio" and len(t.utterances) == 2
    assert t.audio_metrics["engine"].startswith("faster_whisper")
