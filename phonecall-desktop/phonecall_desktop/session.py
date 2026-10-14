"""Session controller: the single place where the conversation life cycle is decided.

Each call is a ``Call`` (its own transcript, note and state). States (shown to the user):
  ready → capturing → finalizing ("transcription en cours") → generating → done
                                                    ↘ error (transcript kept, retry possible)

Queue: after « Fin », a call can keep finishing (end of transcription, note) in the background
while the advisor already starts the next call. The controller shows one « current » call; the
others stay in ``calls`` (memory of this session only) until they are removed.

Rules:
- capture starts only from ``start()`` (explicit click), after the consent confirmation when the
  company requires it;
- ``stop()`` closes the audio sources synchronously before anything else;
- capture stops by itself after ``max_session_minutes``, when the window is closed, or when the
  interface has been disconnected for ``ui_disconnect_stop_s``;
- nothing about a finished conversation is kept after ``new_conversation()`` or « Retirer »
  (unless history is enabled); at most ``MAX_CALLS`` calls are kept in memory.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
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


MAX_CALLS = 10
SPEAKER_LABELS = {"advisor": "Conseiller", "remote": "Interlocuteur"}


@dataclass
class Call:
    """One phone call: its capture, transcript and note."""

    id: str
    state: State = State.READY
    error: dict | None = None
    assembler: TranscriptAssembler = field(default_factory=TranscriptAssembler)
    capture: CaptureManager | None = None
    transcriber: StreamingTranscriber | None = None
    note: NoteResult | None = None
    note_text: str = ""  # what the user sees / edits / copies
    note_edited: bool = False
    started_at: float | None = None
    duration_s: int = 0
    call_meta: dict = field(default_factory=dict)  # PC clock, call direction / type chosen by the advisor
    metrics: dict = field(default_factory=dict)
    opened_devices: dict = field(default_factory=dict)
    session_id: str | None = None  # history id
    request_id: str | None = None
    copilot: object = None  # last prompt prepared for Copilot Chat

    @property
    def busy(self) -> bool:
        return self.state in (State.FINALIZING, State.GENERATING)

    def transcript_text(self, partials: bool = True) -> str:
        """Plain text, one line per utterance: « [mm:ss] Interlocuteur : ... » (live partials marked …)."""
        lines = []
        for seg in self.assembler.snapshot(include_partials=partials):
            if seg.echo or not seg.text.strip():
                continue
            ts = f"{int(seg.t_start // 60):02d}:{int(seg.t_start % 60):02d}"
            lines.append(f"[{ts}] {SPEAKER_LABELS.get(seg.speaker, seg.speaker)} : {seg.text.strip()}"
                         + ("" if seg.final else " …"))
        return "\n".join(lines)

    def summary(self) -> dict:
        first = next((s.text for s in self.assembler.snapshot(include_partials=False) if s.text.strip()), "")
        return {
            "id": self.id, "state": self.state.value, "label": STATE_LABELS[self.state],
            "started_at": self.started_at, "duration_s": self.duration_s, "has_note": bool(self.note_text),
            "error": self.error, "preview": (first[:70] + "…") if len(first) > 70 else first,
            "segments": len(self.assembler.final_segments()),
        }


@dataclass
class StartRequest:
    use_system: bool = True
    use_mic: bool = True
    system_device: str | None = None
    mic_device: str | None = None
    consent: bool = False
    call_direction: str | None = None  # entrant | sortant | None (automatic detection)
    call_type: str | None = None  # movers | frontline | autre | None (automatic detection)


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
        self.current = Call(id=new_request_id())
        self.calls: list[Call] = []  # started calls of this session (current one included)
        self.notices: list[dict] = []
        self._tpl_cache = None
        self._timer: threading.Timer | None = None
        self.recognizer_ready = False
        self.recognizer_status = "idle"  # idle | loading | ready | error

    # ------------------------------------------------------------------ helpers

    def _set_state(self, state: State, error: AppError | None = None, call: Call | None = None) -> None:
        call = call or self.current
        call.state = state
        call.error = error.to_dict() if error else None
        if call is self.current:
            self.emit("state", self.snapshot_state())
        self.emit("calls", {"calls": self.calls_summary(), "current_id": self.current.id})

    def calls_summary(self) -> list[dict]:
        return [c.summary() for c in reversed(self.calls)]

    def _call(self, call_id: str) -> Call:
        call = next((c for c in self.calls if c.id == call_id), None)
        if call is None:
            raise AppError(ErrorCode.INVALID_STATE, "appel introuvable")
        return call

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
            "recognizer_status": self.recognizer_status,
            "call_id": self.current.id,
            "queue_busy": sum(1 for c in self.calls if c.busy and c is not self.current),
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
            "copilot_enabled": self.settings.copilot_enabled,
            "metrics": self.metrics,
            "calls": self.calls_summary(),
        }

    def warmup(self) -> None:
        """Load the recognition model in the background at application start (the first time,
        faster-whisper downloads it: several minutes)."""
        self.recognizer_status = "loading"
        self.emit("state", self.snapshot_state())
        try:
            self.recognizer.warmup()
            self.recognizer_ready = True
            self.recognizer_status = "ready"
        except AppError as exc:
            self.recognizer_status = "error"
            self._notice("error", exc.user_message + " Vérifiez la connexion Internet au premier lancement "
                         "(téléchargement du modèle), puis relancez l'application.", exc.code.value)
        self.emit("state", self.snapshot_state())

    # ------------------------------------------------------------------ start

    def start(self, req: StartRequest) -> dict:
        with self._lock:
            if self.state == State.CAPTURING:
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
            self.recognizer.warmup()  # raises RECOGNIZER_UNAVAILABLE before any capture
            self.recognizer_ready = True
            # A new call; the previous one keeps finishing in the queue (or stays there, finished)
            call = Call(id=new_request_id())
            if self.current not in self.calls or not self.current.busy and not self.current.note_text \
                    and not self.current.assembler.final_segments():
                self._forget(self.current)
            self.current = call
            self.calls.append(call)
            self._trim_calls()
            self.notices = []
            call.transcriber = StreamingTranscriber(self.recognizer, lambda ev, c=call: self._on_transcript(c, ev),
                                                    list(channels), context_prompt=self.settings.vocabulary,
                                                    vocabulary=self.settings.vocabulary)
            call.capture = CaptureManager(self.backend, self._on_chunk, self._on_capture_event)
            try:
                self.opened_devices = self.capture.start(CaptureConfig(channels, no_signal_warn_s=self.settings.no_signal_warn_s))
            except AppError as exc:
                self.transcriber.close()
                self.transcriber = None
                self._set_state(State.ERROR, exc)
                raise
            self.started_at = time.time()
            self.call_meta = {
                "started_at": self.started_at,
                "direction": req.call_direction if req.call_direction in ("entrant", "sortant") else None,
                "variant": req.call_type if req.call_type in ("movers", "frontline", "autre") else None,
            }
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

    def _forget(self, call: Call) -> None:
        if call in self.calls and not call.busy and call.state != State.CAPTURING:
            self.calls.remove(call)

    def _trim_calls(self) -> None:
        """Keeps at most MAX_CALLS calls in memory: the oldest finished ones go first."""
        while len(self.calls) > MAX_CALLS:
            old = next((c for c in self.calls if not c.busy and c.state != State.CAPTURING and c is not self.current), None)
            if old is None:
                break
            self.calls.remove(old)

    def _on_chunk(self, chunk: AudioChunk) -> None:
        t = self.transcriber
        if t is not None:
            t.feed(chunk)

    def _on_transcript(self, call: Call, ev: TranscriptEvent) -> None:
        for seg in call.assembler.apply(ev):
            if call is self.current:
                self.emit("segment", {**seg.to_dict(), "call_id": call.id})

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
            call = self.current
        worker = threading.Thread(target=self._finalize, args=(call,), daemon=True, name="finalize")
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
            for call in self.calls:  # also the calls still finishing in the queue
                if call.transcriber is not None:
                    call.transcriber.close()
            if self.state == State.CAPTURING:
                self.state = State.READY

    def _finalize(self, call: Call) -> None:
        t = call.transcriber
        try:
            t.finish(timeout=self.settings.transcription_finish_timeout_s)
        except AppError as exc:
            self._notice("warning", exc.user_message, exc.code.value)
        finally:
            call.metrics["transcription"] = {k: v for k, v in t.stats.items() if k != "final_latency_s"}
            lat = t.stats["final_latency_s"]
            if lat:
                call.metrics["transcription"]["final_latency_median_s"] = sorted(lat)[len(lat) // 2]
            t.close()
        if call is self.current:
            self.emit("transcript", {"segments": [s.to_dict() for s in call.assembler.snapshot()], "call_id": call.id})
        if not call.assembler.final_segments():
            self._set_state(State.ERROR, AppError(ErrorCode.EMPTY_TRANSCRIPT), call)
            return
        call.request_id = new_request_id()
        self._generate(call)

    def _generate(self, call: Call | None = None) -> None:
        call = call or self.current
        self._set_state(State.GENERATING, call=call)
        try:
            t0 = time.monotonic()
            note = self.note_client.generate(call.assembler.final_segments(), call.duration_s, call.request_id,
                                             meta=call.call_meta)
            call.metrics["generation_s"] = round(time.monotonic() - t0, 2)
            call.metrics["generation_cost_usd"] = note.cost_usd
        except AppError as exc:
            log.warning("note generation failed: %s", exc.code.value)
            self._set_state(State.ERROR, exc, call)
            return
        except Exception:  # noqa: BLE001
            log.exception("unexpected error during generation")
            self._set_state(State.ERROR, AppError(ErrorCode.INTERNAL), call)
            return
        call.note, call.note_text, call.note_edited = note, note.text, False
        if call is self.current:
            self.emit("note", {"text": note.text, "meta": self.snapshot()["note_meta"]})
        else:
            when = time.strftime("%H:%M", time.localtime(call.started_at)) if call.started_at else ""
            self._notice("info", f"Note prête pour l'appel de {when} (liste des appels).", "queue_done")
        self._set_state(State.DONE, call=call)
        self._save_history("generated", call)

    def regenerate(self) -> None:
        with self._lock:
            if self.state not in (State.ERROR, State.DONE) or not self.assembler.final_segments():
                raise AppError(ErrorCode.INVALID_STATE, "aucune transcription à résumer")
            if self.state == State.DONE:
                self.current.request_id = new_request_id()  # explicit new generation
            call = self.current
        threading.Thread(target=self._generate, args=(call,), daemon=True).start()

    # ------------------------------------------------------------------ note actions

    # ------------------------------------------------------------------ Microsoft 365 Copilot Chat

    def _call_context(self):
        from .notes.template import CallContext

        meta = self.call_meta or {}
        return CallContext(direction=meta.get("direction"), variant=meta.get("variant"), started_at=meta.get("started_at"),
                           duration_s=self.duration_s, agent_name=self.settings.agent_name)

    def _template_and_categories(self):
        if self._tpl_cache is None:
            from .notes.business import load_categories
            from .notes.template import load_template, template_path

            self._tpl_cache = (load_template(template_path(self.settings)), load_categories(self.settings))
        return self._tpl_cache

    def copilot_prompt(self) -> dict:
        """Prompt to paste into Copilot Chat: instructions + template + transcript (after « Fin »)."""
        from .notes.copilot import build_prompt

        with self._lock:
            segments = self.assembler.final_segments()
            if self.state not in (State.DONE, State.ERROR) or not segments:
                raise AppError(ErrorCode.INVALID_STATE, "terminez d'abord la conversation (Fin)")
            ctx = self._call_context()
        template, categories = self._template_and_categories()
        self.current.copilot = build_prompt(template, segments, ctx, categories)
        text = self.current.copilot.text
        return {"prompt": text, "chars": len(text), "max_chars": self.settings.copilot_max_chars,
                "too_long": len(text) > self.settings.copilot_max_chars}

    def apply_copilot_answer(self, answer: str) -> None:
        """Copilot's answer pasted by the advisor becomes the note, after the automatic check."""
        from .notes.copilot import check_answer
        from .notes.local_summary import metadata_text, transcript_text

        with self._lock:
            prompt = self.current.copilot
            if prompt is None or self.state not in (State.DONE, State.ERROR):
                raise AppError(ErrorCode.INVALID_STATE, "préparez d'abord la demande pour Copilot")
            template, _categories = self._template_and_categories()
            text, flags, points = check_answer(template, prompt, answer[:50_000],
                                               transcript_text(self.assembler.final_segments()),
                                               metadata_text(self._call_context()))
            self.note = NoteResult(text=text, flags=flags, points_to_verify=points, prompt_version=template.version,
                                   model="Microsoft 365 Copilot Chat")
            self.note_text, self.note_edited = text, False
        self.emit("note", {"text": text, "meta": self.snapshot()["note_meta"]})
        self._set_state(State.DONE)
        self._save_history("copilot")

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
        """Empty screen for a new call. A call still finishing stays in the queue; a finished one is
        cleared (as before), unless it is kept in the history."""
        with self._lock:
            if self.state == State.CAPTURING:
                raise AppError(ErrorCode.INVALID_STATE, "terminez d'abord la conversation en cours")
            self._forget(self.current)
            self.current = Call(id=new_request_id())
            self._set_state(State.READY)

    # ------------------------------------------------------------------ list of calls (queue)

    def select(self, call_id: str) -> dict:
        """Shows another call of the list (not during a capture: the live call stays on screen)."""
        with self._lock:
            if self.state == State.CAPTURING:
                raise AppError(ErrorCode.INVALID_STATE, "terminez d'abord l'appel en cours (Fin) pour en ouvrir un autre")
            call = self._call(call_id)
            self.current = call
            self.emit("state", self.snapshot_state())
            return self.snapshot()

    def remove(self, call_id: str) -> None:
        with self._lock:
            call = self._call(call_id)
            if call.busy or call.state == State.CAPTURING:
                raise AppError(ErrorCode.INVALID_STATE, "cet appel n'est pas terminé")
            self.calls.remove(call)
            if call is self.current:
                self.current = Call(id=new_request_id())
                self.emit("state", self.snapshot_state())
            self.emit("calls", {"calls": self.calls_summary(), "current_id": self.current.id})

    def call_details(self, call_id: str) -> dict:
        call = self._call(call_id)
        return {**call.summary(), "transcript": call.transcript_text(partials=True), "note": call.note_text}

    def transcript_text(self, call_id: str | None = None) -> str:
        call = self._call(call_id) if call_id else self.current
        return call.transcript_text(partials=True)

    def _save_history(self, status: str, call: Call | None = None) -> None:
        call = call or self.current
        if self.history is None or not call.note_text:
            return
        try:
            call.session_id = self.history.save(
                session_id=call.session_id, duration_s=call.duration_s, status=status, note=call.note_text,
                transcript=call.assembler.plain_text(),
            )
        except Exception:  # noqa: BLE001 - history must never break the main flow
            log.exception("history save failed")


# Per-call attributes read and written through the controller act on the current call
# (``controller.state``, ``controller.assembler``, ``controller.note_text``...).
def _delegate(name: str) -> property:
    return property(lambda self: getattr(self.current, name), lambda self, value: setattr(self.current, name, value))


for _name in ("state", "error", "assembler", "capture", "transcriber", "note", "note_text", "note_edited", "started_at",
              "duration_s", "call_meta", "metrics", "opened_devices", "session_id"):
    setattr(SessionController, _name, _delegate(_name))
