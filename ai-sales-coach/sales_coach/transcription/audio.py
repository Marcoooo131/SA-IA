"""Transcription audio (MP3, WAV, M4A) en français, 100 % locale, via Whisper.

Backends pris en charge (installés séparément, voir requirements-audio.txt) :
- ``faster_whisper`` (recommandé : rapide sur CPU, int8) ;
- ``openai_whisper`` (paquet ``openai-whisper``, nécessite ffmpeg).

Aucun audio n'est envoyé à un service externe. Si aucun backend n'est installé, la fonction lève
``TranscriptionUnavailable`` avec un message explicite — rien n'est simulé.

Attribution des locuteurs :
- si ``pyannote.audio`` est installé et ``ASC_HF_TOKEN`` défini, une diarisation réelle est faite ;
- sinon, les tours de parole sont découpés sur les pauses et étiquetés « Locuteur A / B » en alternance.
  Cette attribution est HEURISTIQUE et doit être vérifiée par l'utilisateur avant l'analyse.
"""
from __future__ import annotations

import importlib.util
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from sales_coach.core.models import UNKNOWN, Transcript, Utterance, fmt_ts

SUPPORTED_AUDIO = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"}


class TranscriptionUnavailable(RuntimeError):
    pass


@dataclass
class Segment:
    start: float
    end: float
    text: str
    speaker: str | None = None


def available_backends() -> list[str]:
    found = []
    if importlib.util.find_spec("faster_whisper"):
        found.append("faster_whisper")
    if importlib.util.find_spec("whisper"):
        found.append("openai_whisper")
    return found


def diarization_available() -> bool:
    return bool(importlib.util.find_spec("pyannote") and os.environ.get("ASC_HF_TOKEN"))


def _resolve_backend(requested: str) -> str:
    backends = available_backends()
    if requested in {"none", "off", "disabled"}:
        raise TranscriptionUnavailable("La transcription audio est désactivée (ASC_TRANSCRIPTION_BACKEND=none).")
    if requested == "auto":
        if not backends:
            raise TranscriptionUnavailable(
                "Aucun moteur Whisper installé. Installez `pip install -r requirements-audio.txt` "
                "(faster-whisper) ou importez une transcription TXT/DOCX."
            )
        return backends[0]
    if requested not in backends:
        raise TranscriptionUnavailable(f"Le moteur « {requested} » n'est pas installé (disponibles : {backends or 'aucun'}).")
    return requested


def _run_faster_whisper(path: str, model_name: str, device: str) -> list[Segment]:
    from faster_whisper import WhisperModel  # type: ignore

    compute_type = "int8" if device == "cpu" else "float16"
    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments, _info = model.transcribe(path, language="fr", vad_filter=True, beam_size=5)
    return [Segment(s.start, s.end, s.text.strip()) for s in segments if s.text.strip()]


def _run_openai_whisper(path: str, model_name: str, device: str) -> list[Segment]:
    import whisper  # type: ignore

    model = whisper.load_model(model_name, device=device)
    result = model.transcribe(path, language="fr", fp16=(device != "cpu"))
    return [Segment(s["start"], s["end"], s["text"].strip()) for s in result["segments"] if s["text"].strip()]


def _diarize(path: str, segments: list[Segment]) -> bool:
    """Diarisation pyannote (optionnelle). Retourne True si appliquée."""
    if not diarization_available():
        return False
    from pyannote.audio import Pipeline  # type: ignore

    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=os.environ["ASC_HF_TOKEN"])
    diar = pipeline(path)
    turns = [(t.start, t.end, spk) for t, _, spk in diar.itertracks(yield_label=True)]
    for seg in segments:
        best, best_overlap = None, 0.0
        for start, end, spk in turns:
            overlap = min(seg.end, end) - max(seg.start, start)
            if overlap > best_overlap:
                best, best_overlap = spk, overlap
        seg.speaker = best
    return True


def segments_to_transcript(segments: list[Segment], pause_threshold: float = 0.8, diarized: bool = False) -> Transcript:
    """Regroupe les segments en répliques et calcule les métriques audio réellement mesurables."""
    utterances: list[Utterance] = []
    labels: list[str] = []
    current_label = "Locuteur A"
    prev: Segment | None = None
    for seg in segments:
        if diarized:
            label = seg.speaker or "Locuteur ?"
            new_turn = prev is None or label != labels[-1]
        else:
            gap = seg.start - prev.end if prev else 0.0
            new_turn = prev is None or gap >= pause_threshold
            if prev is not None and new_turn:
                current_label = "Locuteur B" if current_label == "Locuteur A" else "Locuteur A"
            label = current_label
        if new_turn:
            utterances.append(Utterance(len(utterances), UNKNOWN, seg.text, seg.start, seg.end))
            labels.append(label)
        else:
            utterances[-1].text += " " + seg.text
            utterances[-1].end = seg.end
        prev = seg

    silences = []
    for a, b in zip(segments, segments[1:]):
        gap = b.start - a.end
        if gap >= 2.0:
            silences.append({"start": fmt_ts(a.end), "duration_s": round(gap, 1)})
    interruptions = []
    if diarized:
        for a, b in zip(segments, segments[1:]):
            if a.speaker and b.speaker and a.speaker != b.speaker and b.start < a.end - 0.2:
                interruptions.append({"at": fmt_ts(b.start), "by": b.speaker})
    duration = segments[-1].end if segments else 0.0
    words = sum(len(s.text.split()) for s in segments)
    warnings = []
    if diarized:
        attribution = "diarisation (à vérifier)"
    else:
        attribution = "heuristique"
        warnings.append(
            "Attribution des locuteurs HEURISTIQUE (alternance sur les pauses, sans diarisation). "
            "Vérifiez et corrigez « Locuteur A / B » avant l'analyse. Les interruptions ne sont pas mesurables sans diarisation."
        )
    warnings.append("Attribuez les locuteurs (COMMERCIAL / CLIENT) avant l'analyse.")
    t = Transcript(utterances, source="audio", speaker_attribution=attribution, warnings=warnings)
    t.audio_metrics = {
        "raw_labels": labels,
        "duration_s": round(duration, 1),
        "words_per_minute": round(words / (duration / 60), 1) if duration else None,
        "silences": silences,
        "interruptions": interruptions if diarized else None,
        "diarized": diarized,
    }
    return t


def transcribe_audio(data: bytes, filename: str, backend: str = "auto", model_name: str = "small", device: str = "cpu") -> Transcript:
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_AUDIO:
        raise ValueError(f"Format audio non pris en charge : {ext} (attendus : {', '.join(sorted(SUPPORTED_AUDIO))})")
    engine = _resolve_backend(backend)
    # Fichier temporaire en clair uniquement le temps de la transcription, supprimé ensuite.
    fd, tmp = tempfile.mkstemp(suffix=ext)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        runner = _run_faster_whisper if engine == "faster_whisper" else _run_openai_whisper
        segments = runner(tmp, model_name, device)
        diarized = False
        try:
            diarized = _diarize(tmp, segments)
        except Exception as exc:  # diarisation optionnelle : on n'échoue pas la transcription
            diarized = False
            segments_warning = f"Diarisation indisponible : {exc}"
        else:
            segments_warning = ""
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
    if not segments:
        raise TranscriptionUnavailable("Aucune parole détectée dans le fichier audio.")
    transcript = segments_to_transcript(segments, diarized=diarized)
    transcript.audio_metrics["engine"] = f"{engine} ({model_name}, {device})"
    if segments_warning:
        transcript.warnings.append(segments_warning)
    return transcript
