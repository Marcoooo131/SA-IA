"""Audio sources. A source delivers raw frames (n, channels) float32 to a callback.

- ``WasapiSource``: Windows WASAPI microphone or loopback (PyAudioWPatch / PortAudio).
- ``WavFileSource``: plays a WAV file in real time — TEST MODE ONLY (synthetic / anonymised files).
"""

from __future__ import annotations

import logging
import threading
import time
import wave
from abc import ABC, abstractmethod
from collections.abc import Callable
from pathlib import Path

import numpy as np

from .dsp import int16_bytes_to_float
from .types import Channel

log = logging.getLogger(__name__)

DataCallback = Callable[[np.ndarray], None]
ErrorCallback = Callable[[Exception], None]


class AudioSource(ABC):
    channel: Channel
    sample_rate: int
    channels: int
    device_name: str

    @abstractmethod
    def start(self, on_data: DataCallback, on_error: ErrorCallback) -> None: ...

    @abstractmethod
    def stop(self) -> None:
        """Must be idempotent and must guarantee that no callback is invoked after it returns."""

    @abstractmethod
    def is_alive(self) -> bool: ...


class WasapiSource(AudioSource):  # pragma: no cover - requires Windows audio hardware
    """WASAPI stream through PyAudioWPatch. For loopback, ``device_info`` is the loopback analogue
    (``isLoopbackDevice`` True) of an output device."""

    def __init__(self, pa, device_info: dict, channel: Channel, frames_per_buffer: int = 1024):
        self._pa = pa
        self.info = device_info
        self.channel = channel
        self.device_name = device_info["name"]
        self.sample_rate = int(device_info["defaultSampleRate"])
        self.channels = max(1, min(2, int(device_info["maxInputChannels"])))
        self.frames_per_buffer = frames_per_buffer
        self._stream = None
        self._lock = threading.Lock()
        self._active = False

    def start(self, on_data: DataCallback, on_error: ErrorCallback) -> None:
        import pyaudiowpatch as pyaudio

        def callback(in_data, frame_count, time_info, status):
            if not self._active:
                return (None, pyaudio.paComplete)
            try:
                on_data(int16_bytes_to_float(in_data, self.channels))
            except Exception as exc:  # never let an exception kill the PortAudio thread silently
                on_error(exc)
            return (None, pyaudio.paContinue)

        with self._lock:
            self._active = True
            self._stream = self._pa.open(
                format=pyaudio.paInt16,
                channels=self.channels,
                rate=self.sample_rate,
                input=True,
                input_device_index=self.info["index"],
                frames_per_buffer=self.frames_per_buffer,
                stream_callback=callback,
            )
            self._stream.start_stream()

    def stop(self) -> None:
        with self._lock:
            self._active = False
            stream, self._stream = self._stream, None
        if stream is not None:
            try:
                stream.stop_stream()
            finally:
                stream.close()

    def is_alive(self) -> bool:
        stream = self._stream
        try:
            return bool(stream is not None and self._active and stream.is_active())
        except OSError:
            return False


class WavFileSource(AudioSource):
    """Plays a PCM16 WAV file in (accelerated) real time. ``channel_index`` picks one channel of a
    multichannel file (e.g. a 2-channel synthetic call: 0 = remote party, 1 = advisor)."""

    def __init__(self, path: str | Path, channel: Channel, channel_index: int | None = None,
                 speed: float = 1.0, chunk_ms: int = 20, skip_silent_chunks: bool = False):
        self.path = Path(path)
        self.channel = channel
        self.channel_index = channel_index
        self.speed = speed
        self.chunk_ms = chunk_ms
        self.skip_silent_chunks = skip_silent_chunks  # mimics WASAPI loopback behaviour
        self.device_name = f"Fichier de test : {self.path.name}"
        with wave.open(str(self.path), "rb") as w:
            if w.getsampwidth() != 2:
                raise ValueError("only PCM16 WAV files are supported")
            self.sample_rate = w.getframerate()
            self._file_channels = w.getnchannels()
        self.channels = 1 if channel_index is not None else self._file_channels
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.finished = threading.Event()

    def start(self, on_data: DataCallback, on_error: ErrorCallback) -> None:
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, args=(on_data, on_error), daemon=True,
                                        name=f"wav-{self.channel.value}")
        self._thread.start()

    def _run(self, on_data: DataCallback, on_error: ErrorCallback) -> None:
        try:
            with wave.open(str(self.path), "rb") as w:
                n = max(1, int(self.sample_rate * self.chunk_ms / 1000))
                t0 = time.monotonic()
                sent = 0
                while not self._stop.is_set():
                    data = w.readframes(n)
                    if not data:
                        break
                    frames = int16_bytes_to_float(data, self._file_channels)
                    if self.channel_index is not None:
                        frames = frames[:, self.channel_index : self.channel_index + 1]
                    sent += len(frames)
                    due = t0 + sent / self.sample_rate / self.speed
                    delay = due - time.monotonic()
                    if delay > 0 and self._stop.wait(delay):
                        break
                    if self.skip_silent_chunks and not np.any(frames):
                        continue
                    if not self._stop.is_set():
                        on_data(frames)
        except Exception as exc:
            on_error(exc)
        finally:
            self.finished.set()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread is not threading.current_thread():
            self._thread.join(timeout=5)

    def is_alive(self) -> bool:
        # A finished file is not an error: the source simply stays silent.
        return self._thread is not None and not self._stop.is_set()
