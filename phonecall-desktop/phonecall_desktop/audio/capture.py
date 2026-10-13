"""Capture manager: opens the selected sources (PC sound and/or microphone), normalises them onto
the session timeline and supervises them.

Guarantees:
- capture starts only through ``start()`` (called from an explicit user action);
- after ``stop()`` returns, no source is open and no audio is delivered any more;
- a source that dies (device unplugged, Bluetooth profile switch) is reopened with back-off,
  first on the same device, then on the default device of its channel — and the UI is told;
- a channel without signal for ``no_signal_warn_s`` raises a visible warning.
"""

from __future__ import annotations

import logging
import queue
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from ..errors import AppError, ErrorCode
from .devices import DeviceBackend
from .dsp import LevelMeter
from .sources import AudioSource
from .timeline import ChannelTimeline
from .types import AudioChunk, Channel

log = logging.getLogger(__name__)

EventCallback = Callable[[str, dict], None]
ChunkCallback = Callable[[AudioChunk], None]


@dataclass
class CaptureConfig:
    channels: dict[Channel, str | None]  # channel -> device id (None = default device)
    no_signal_warn_s: float = 10.0
    reconnect_delays: tuple[float, ...] = (0.5, 1.0, 2.0, 4.0, 8.0)
    monitor_interval_s: float = 0.2
    silence_fill_after_s: float = 0.4


@dataclass
class _ChannelState:
    channel: Channel
    device_id: str | None
    source: AudioSource | None = None
    timeline: ChannelTimeline | None = None
    queue: queue.Queue = field(default_factory=lambda: queue.Queue(maxsize=2000))
    worker: threading.Thread | None = None
    meter: LevelMeter = field(default_factory=LevelMeter)
    last_data_wall: float = 0.0
    reconnect_attempt: int = 0
    next_reconnect_at: float = 0.0
    warned_no_signal: bool = False
    dropped_chunks: int = 0
    failed: bool = False


_STOP = object()


class CaptureManager:
    def __init__(self, backend: DeviceBackend, on_chunk: ChunkCallback, on_event: EventCallback,
                 clock: Callable[[], float] = time.monotonic):
        self.backend = backend
        self.on_chunk = on_chunk
        self.on_event = on_event
        self.clock = clock
        self._states: dict[Channel, _ChannelState] = {}
        self._capturing = threading.Event()
        self._stopped = threading.Event()
        self._lock = threading.RLock()
        self._monitor: threading.Thread | None = None
        self.session_start = 0.0
        self.cfg: CaptureConfig | None = None

    @property
    def capturing(self) -> bool:
        return self._capturing.is_set()

    # ------------------------------------------------------------------ lifecycle

    def start(self, cfg: CaptureConfig) -> dict[str, str]:
        with self._lock:
            if self.capturing:
                raise AppError(ErrorCode.INVALID_STATE, "capture déjà en cours")
            if not cfg.channels:
                raise AppError(ErrorCode.NO_SOURCE, "aucune source sélectionnée")
            self.cfg = cfg
            self.session_start = self.clock()
            self._states = {ch: _ChannelState(ch, dev) for ch, dev in cfg.channels.items()}
            self._stopped.clear()
            self._capturing.set()
            opened: dict[str, str] = {}
            errors: dict[str, str] = {}
            for state in self._states.values():
                try:
                    self._open(state)
                    opened[state.channel.value] = state.source.device_name
                except AppError as exc:
                    state.failed = True
                    errors[state.channel.value] = exc.user_message
            if not opened:
                self._capturing.clear()
                self._shutdown_workers()
                raise AppError(ErrorCode.NO_SOURCE, "; ".join(errors.values()))
            for ch, msg in errors.items():
                self.on_event("warning", {"channel": ch, "code": "source_failed", "message": msg})
            self._monitor = threading.Thread(target=self._monitor_loop, daemon=True, name="capture-monitor")
            self._monitor.start()
            return opened

    def stop(self) -> None:
        """Idempotent. Returns only when every source is closed and every chunk delivered."""
        with self._lock:
            was_capturing = self.capturing
            self._capturing.clear()  # from here on, callbacks drop their data
            self._stopped.set()
            for state in self._states.values():
                if state.source is not None:
                    try:
                        state.source.stop()
                    except Exception:  # noqa: BLE001 - closing must go on for the other channel
                        log.exception("error while closing a source")
                    state.source = None
            if self._monitor and self._monitor is not threading.current_thread():
                self._monitor.join(timeout=5)
            self._shutdown_workers(flush=was_capturing)

    def _shutdown_workers(self, flush: bool = False) -> None:
        for state in self._states.values():
            if state.worker is not None:
                state.queue.put(_STOP)
                state.worker.join(timeout=10)
                state.worker = None
            if flush and state.timeline is not None:
                tail = state.timeline.flush()
                if tail is not None:
                    self.on_chunk(tail)

    # ------------------------------------------------------------------ sources

    def _open(self, state: _ChannelState) -> None:
        source = self.backend.open(state.device_id, state.channel)
        if state.timeline is None:
            state.timeline = ChannelTimeline(state.channel, source.sample_rate, self.session_start)
        elif state.timeline.in_rate != source.sample_rate:
            # New device with another rate: keep the same timeline position, new resampler.
            position = state.timeline.produced
            state.timeline = ChannelTimeline(state.channel, source.sample_rate, self.session_start)
            state.timeline.produced = position
        if state.worker is None:
            state.worker = threading.Thread(target=self._worker_loop, args=(state,), daemon=True,
                                            name=f"capture-{state.channel.value}")
            state.worker.start()

        def on_data(frames: np.ndarray, st=state) -> None:
            if not self._capturing.is_set():
                return
            try:
                st.queue.put_nowait(("data", frames, self.clock()))
            except queue.Full:
                st.dropped_chunks += 1  # processing far behind: count it, never block the audio thread

        def on_error(exc: Exception, st=state) -> None:
            log.warning("source error on %s: %s", st.channel.value, type(exc).__name__)

        source.start(on_data, on_error)
        state.source = source
        state.last_data_wall = self.clock()
        state.failed = False

    def _worker_loop(self, state: _ChannelState) -> None:
        while True:
            item = state.queue.get()
            if item is _STOP:
                return
            kind = item[0]
            try:
                if kind == "data":
                    _, frames, wall = item
                    state.last_data_wall = wall
                    chunks = state.timeline.push(frames, wall)
                elif kind == "fill":
                    chunk = state.timeline.fill_silence(item[1])
                    chunks = [chunk] if chunk else []
                else:
                    chunks = []
                for chunk in chunks:
                    state.meter.update(chunk.samples, self.clock(), chunk.duration)
                    self.on_chunk(chunk)
            except Exception:  # noqa: BLE001
                log.exception("audio processing error on %s", state.channel.value)

    # ------------------------------------------------------------------ supervision

    def _monitor_loop(self) -> None:
        cfg = self.cfg
        while not self._stopped.wait(cfg.monitor_interval_s):
            now = self.clock()
            levels = {}
            for state in self._states.values():
                if state.source is not None and not state.source.is_alive():
                    self._handle_dead_source(state, now)
                if state.source is None:
                    self._try_reconnect(state, now)
                if now - state.last_data_wall > cfg.silence_fill_after_s:
                    state.queue.put(("fill", now))
                levels[state.channel.value] = {
                    "dbfs": round(state.meter.level, 1),
                    "signal": state.meter.last_signal_at is not None and now - state.meter.last_signal_at < 1.5,
                    "connected": state.source is not None,
                    "device": state.source.device_name if state.source else None,
                }
                self._check_signal(state, now)
            self.on_event("levels", {"channels": levels, "elapsed": round(now - self.session_start, 1)})

    def _check_signal(self, state: _ChannelState, now: float) -> None:
        last = state.meter.last_signal_at
        silent_for = now - (last if last is not None else self.session_start)
        if silent_for >= self.cfg.no_signal_warn_s and not state.warned_no_signal:
            state.warned_no_signal = True
            self.on_event("no_signal", {"channel": state.channel.value, "seconds": round(silent_for)})
        elif last is not None and now - last < 1.0 and state.warned_no_signal:
            state.warned_no_signal = False
            self.on_event("signal_back", {"channel": state.channel.value})

    def _handle_dead_source(self, state: _ChannelState, now: float) -> None:
        with self._lock:
            if not self.capturing or state.source is None:
                return
            name = state.source.device_name
            try:
                state.source.stop()
            except Exception:  # noqa: BLE001
                pass
            state.source = None
            state.reconnect_attempt = 0
            state.next_reconnect_at = now
            self.on_event("device_lost", {"channel": state.channel.value, "device": name})

    def _try_reconnect(self, state: _ChannelState, now: float) -> None:
        if now < state.next_reconnect_at:
            return
        with self._lock:
            if not self.capturing:
                return
            delays = self.cfg.reconnect_delays
            attempt = state.reconnect_attempt
            state.reconnect_attempt += 1
            state.next_reconnect_at = now + delays[min(attempt, len(delays) - 1)]
            try:
                self.backend.list_devices(refresh=True)
            except Exception:  # noqa: BLE001
                pass
            wanted = state.device_id
            for opener, fallback in ((self._open, False), (self._open_default, True)):
                if fallback and wanted is None:
                    break
                try:
                    opener(state)
                except AppError:
                    continue
                self.on_event("device_reconnected", {
                    "channel": state.channel.value, "device": state.source.device_name, "fallback_to_default": fallback,
                })
                return

    def _open_default(self, state: _ChannelState) -> None:
        wanted = state.device_id
        state.device_id = None
        try:
            self._open(state)
        except AppError:
            state.device_id = wanted
            raise

    def stats(self) -> dict:
        return {
            ch.value: {"dropped_chunks": st.dropped_chunks, "position_s": round(st.timeline.position, 2) if st.timeline else 0}
            for ch, st in self._states.items()
        }
