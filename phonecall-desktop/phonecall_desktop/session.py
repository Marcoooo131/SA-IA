"""Session controller: the single place where the conversation life cycle is decided.

States (shown to the user):
  ready → capturing → finalizing ("transcription en cours") → generating → done
                                                    ↘ error (transcript kept, retry possible)

Rules:
- capture starts only from ``start()`` (explicit click), after the consent confirmation when the
  company requires it;
- ``stop()`` closes the audio sources synchronously before anything else;
- capture stops by itself after ``max_session_minutes``, when the window is closed, or when the
  interface has been disconnected for ``ui_disconnect_stop_s``;
- nothing about the conversation is kept after ``new_conversation()`` (unless history is enabled).
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum

from .audio.capture import CaptureConfig, CaptureManager
from .audio.devices import DeviceBackend
from .audio.types import AudioChunk, Channel
from .config import Settings
from .errors import AppError, ErrorCode
from .history import History
from .notes.client import NoteClient, NoteResult, new_request_id
from .stt.base import Recognizer, TranscriptEvent
from .stt.streaming import StreamingTranscriber
from .transcript.assembler import TranscriptAssembler

log = logging.getLogger(__name__)


class State(str, Enum):
    READY = "ready"
    CAPTURING = "capturing"
    FINALIZING = "finalizing"
    GENERATING = "generating"
    DONE = "done"
    ERROR = "error"


STATE_LABELS = {
    State.READY: "Prêt",
    State.CAPTURING: "Capture en cours",
    State.FINALIZING: "Transcription en cours",
    State.GENERATING: "Génération de la note",
    State.DONE: "Terminé",
    State.ERROR: "Erreur",
}


@dataclass
class StartRequest:
    use_system: bool = True
    use_mic: bool = True
    system_device: str | None = None
    mic_device: str | None = None
    consent: bool = False


class SessionController:
    def __init__(self, settings: Settings, backend: DeviceBackend, recognizer: Recognizer,
                 note_client: NoteClient, history: History | None = None,
                 emit: Callable[[str, dict], None] = lambda t, p: None):
        self.settings = settings
        self.backend = backend
        self.recognizer = recognizer
        self.note_client = note_client
        self.history = history
        self.emit = emit
        self._lock = threading.RLock()
        self.state = State.READY
        self.error: dict | None = None
        self.notices: list[dict] = []
        self.assembler = TranscriptAssembler()
        self.capture: CaptureManager | None = None
        self.transcriber: StreamingTranscriber | None = None
        self.note: NoteResult | None = None
        self.note_text = ""  # what the user sees / edits / copies
        self.note_edited = False
        self.started_at: float | None = None
        self.duration_s = 0
        self.opened_devices: dict[str, str] = {}
        self.session_id: str | None = None
        self._request_id: str | None = None
        self._timer: threading.Timer | None = None
        self.metrics: dict = {}
        self.recognizer_ready = False

    # ------------------------------------------------------------------ helpers

    def _set_state(self, state: State, error: AppError | None = None) -> None:
        self.state = state
        self.error = error.to_dict() if error else None
        self.emit("state", self.snapshot_state())

    def _notice(self, level: str, message: str, code: str = "") -> None:
        n = {"level": level, "message": message, "code": code, "at": time.time()}
        self.notices.append(n)
        self.emit("notice", n)

    def snapshot_state(self) -> dict:
        return {
            "state": self.state.value,
            "label": STATE_LABELS[self.state],
            "capturing": self.state == State.CAPTURING,
            "error": self.error,
            "devices": self.opened_devices,
            "started_at": self.started_at,
            "duration_s": self.duration_s,
            "recognizer_ready": self.recognizer_ready,
        }

    def snapshot(self) -> dict:
        return {
            **self.snapshot_state(),
            "transcript": [s.to_dict() for s in self.assembler.snapshot()],
            "note": self.note_text,
            "note_meta": None if self.note is None else {
                "flags": self.note.flags, "points_to_verify": self.note.points_to_verify,
                "category": self.note.category, "prompt_version": self.note.prompt_version,
                "simulated": self.note.simulated, "no_usable_content": self.note.no_usable_content,
                "edited": self.note_edited,
            },
            "notices": self.notices[-10:],
            "consent_required": self.settings.require_consent_confirmation,
            "consent_label": self.settings.consent_label,
            "history_enabled": self.history is not None,
            "metrics": self.metrics,
        }

    def warmup(self) -> None:
        """Load the recognition model in the background at application start."""
        try:
            self.recognizer.warmup()
            self.recognizer_ready = True
        except AppError as exc:
            self._notice("error", exc.user_message, exc.code.value)
        self.emit("state", self.snapshot_state())

    # ------------------------------------------------------------------ start

    def start(self, req: StartRequest) -> dict:
        with self._lock:
            if self.state in (State.CAPTURING, State.FINALIZING, State.GENERATING):
                raise AppError(ErrorCode.INVALID_STATE, "une conversation est déjà en cours")
            if self.settings.require_consent_confirmation and not req.consent:
                raise AppError(ErrorCode.CONSENT_REQUIRED)
            channels: dict[Channel, str | None] = {}
            if req.use_system:
                channels[Channel.SYSTEM] = req.system_device or None
            if req.use_mic:
                channels[Channel.MIC] = req.mic_device or None
            if not channels:
                raise AppError(ErrorCode.NO_SOURCE, "sélectionnez au moins une source")
            self._reset()
            self.recognizer.warmup()  # raises RECOGNIZER_UNAVAILABLE before any capture
            self.recognizer_ready = True
            self.transcriber = StreamingTranscriber(self.recognizer, self._on_transcript, list(channels),
                                                    context_prompt=self.settings.vocabulary)
            self.capture = CaptureManager(self.backend, self._on_chunk, self._on_capture_event)
            try:
                self.opened_devices = self.capture.start(CaptureConfig(channels, no_signal_warn_s=self.settings.no_signal_warn_s))
            except AppError as exc:
                self.transcriber.close()
                self.transcriber = None
                self._set_state(State.ERROR, exc)
                raise
            self.started_at = time.time()
            self.session_id = new_request_id()
            log.info("capture started channels=%s", ",".join(c.value for c in channels))
            self._set_state(State.CAPTURING)
            # started after the state change: an early expiry must find the capture running
            self._timer = threading.Timer(self.settings.max_session_minutes * 60, self._auto_stop, args=("durée maximale atteinte",))
            self._timer.daemon = True
            self._timer.start()
            if len(self.opened_devices) < len(channels):
                missing = {c.value for c in channels} - set(self.opened_devices)
                self._notice("warning", f"Source non ouverte : {', '.join(missing)}. La transcription sera partielle.")
            if Channel.MIC in channels and Channel.SYSTEM not in channels:
                self._notice("info", "Seul le micro est capté : la voix de l'interlocuteur ne sera transcrite que si le micro l'entend.")
            return self.snapshot_state()

    def _reset(self) -> None:
        self.assembler = TranscriptAssembler()
        self.note, self.note_text, self.note_edited = None, "", False
        self.error, self.notices, self.metrics = None, [], {}
        self.duration_s, self.opened_devices = 0, {}

    def _on_chunk(self, chunk: AudioChunk) -> None:
        t = self.transcriber
        if t is not None:
            t.feed(chunk)

    def _on_transcript(self, ev: TranscriptEvent) -> None:
        for seg in self.assembler.apply(ev):
            self.emit("segment", seg.to_dict())

    def _on_capture_event(self, kind: str, payload: dict) -> None:
        if kind == "levels":
            if self.transcriber is not None:
                payload["lag_s"] = round(self.transcriber.lag_seconds(), 1)
            self.emit("levels", payload)
            return
        label = {"system": "Son du PC", "mic": "Micro"}.get(payload.get("channel", ""), "")
        messages = {
            "no_signal": ("warning", f"{label} : aucun son détecté depuis {payload.get('seconds')} s. "
                          "Vérifiez le périphérique sélectionné et que l'appel est bien en cours"
                          + (" ; vérifiez aussi que Windows autorise l'accès au micro (Paramètres › Confidentialité)."
                             if payload.get("channel") == "mic" else ".")),
            "signal_back": ("info", f"{label} : son de nouveau détecté."),
            "device_lost": ("warning", f"{label} : périphérique perdu ({payload.get('device')}). Reconnexion…"),
            "device_reconnected": ("info", f"{label} : capture reprise sur « {payload.get('device')} »"
                                   + (" (périphérique par défaut)." if payload.get("fallback_to_default") else ".")),
            "warning": ("warning", payload.get("message", "")),
        }
        level, msg = messages.get(kind, ("info", kind))
        self._notice(level, msg, kind)

    # ------------------------------------------------------------------ stop & finalisation

    def _auto_stop(self, reason: str) -> None:
        with self._lock:  # waits for a start() still in progress
            if self.state != State.CAPTURING:
                return
            self._notice("warning", f"Capture arrêtée automatiquement : {reason}.")
            self.stop()

    def stop(self, wait: bool = False) -> dict:
        with self._lock:
            if self.state != State.CAPTURING:
                raise AppError(ErrorCode.INVALID_STATE, "aucune capture en cours")
            if self._timer:
                self._timer.cancel()
            self.capture.stop()  # synchronous: the microphone / loopback are closed here
            self.duration_s = int(time.time() - (self.started_at or time.time()))
            self.metrics["capture"] = self.capture.stats()
            log.info("capture stopped after %ss", self.duration_s)
            self._set_state(State.FINALIZING)
            snapshot = self.snapshot_state()  # state at the moment of the stop
        worker = threading.Thread(target=self._finalize, daemon=True, name="finalize")
        worker.start()
        if wait:
            worker.join()
        return snapshot

    def emergency_stop(self) -> None:
        """Window closed / application exit: stop listening immediately, no finalisation."""
        with self._lock:
            if self._timer:
                self._timer.cancel()
            if self.capture is not None:
                self.capture.stop()
            if self.transcriber is not None:
                self.transcriber.close()
            if self.state == State.CAPTURING:
                self.state = State.READY

    def _finalize(self) -> None:
        t = self.transcriber
        try:
            t.finish(timeout=self.settings.transcription_finish_timeout_s)
        except AppError as exc:
            self._notice("warning", exc.user_message, exc.code.value)
        finally:
            self.metrics["transcription"] = {k: v for k, v in t.stats.items() if k != "final_latency_s"}
            lat = t.stats["final_latency_s"]
            if lat:
                self.metrics["transcription"]["final_latency_median_s"] = sorted(lat)[len(lat) // 2]
            t.close()
        self.emit("transcript", {"segments": [s.to_dict() for s in self.assembler.snapshot()]})
        if not self.assembler.final_segments():
            err = AppError(ErrorCode.EMPTY_TRANSCRIPT)
            self._set_state(State.ERROR, err)
            return
        self._request_id = new_request_id()
        self._generate()

    def _generate(self) -> None:
        self._set_state(State.GENERATING)
        try:
            t0 = time.monotonic()
            note = self.note_client.generate(self.assembler.final_segments(), self.duration_s, self._request_id)
            self.metrics["generation_s"] = round(time.monotonic() - t0, 2)
            self.metrics["generation_cost_usd"] = note.cost_usd
        except AppError as exc:
            log.warning("note generation failed: %s", exc.code.value)
            self._set_state(State.ERROR, exc)
            return
        except Exception:  # noqa: BLE001
            log.exception("unexpected error during generation")
            self._set_state(State.ERROR, AppError(ErrorCode.INTERNAL))
            return
        self.note, self.note_text, self.note_edited = note, note.text, False
        self.emit("note", {"text": note.text, "meta": self.snapshot()["note_meta"]})
        self._set_state(State.DONE)
        self._save_history("generated")

    def regenerate(self) -> None:
        with self._lock:
            if self.state not in (State.ERROR, State.DONE) or not self.assembler.final_segments():
                raise AppError(ErrorCode.INVALID_STATE, "aucune transcription à résumer")
            if self.state == State.DONE:
                self._request_id = new_request_id()  # explicit new generation
        threading.Thread(target=self._generate, daemon=True).start()

    # ------------------------------------------------------------------ note actions

    def update_note(self, text: str) -> None:
        with self._lock:
            if self.state != State.DONE:
                raise AppError(ErrorCode.INVALID_STATE, "aucune note à modifier")
            self.note_text = text[:20_000]
            self.note_edited = True
            self._save_history("edited")

    def mark_copied(self) -> None:
        self._save_history("copied")

    def new_conversation(self) -> None:
        with self._lock:
            if self.state in (State.CAPTURING, State.FINALIZING, State.GENERATING):
                raise AppError(ErrorCode.INVALID_STATE, "terminez d'abord la conversation en cours")
            self._reset()
            self.session_id = None
            self._set_state(State.READY)

    def _save_history(self, status: str) -> None:
        if self.history is None or not self.note_text:
            return
        try:
            self.session_id = self.history.save(
                session_id=self.session_id, duration_s=self.duration_s, status=status, note=self.note_text,
                transcript=self.assembler.plain_text(),
            )
        except Exception:  # noqa: BLE001 - history must never break the main flow
            log.exception("history save failed")
