"""Audio device enumeration and opening.

Device ids are built from the *name* (PortAudio indexes change after re-enumeration, e.g. when a
headset is plugged in during a call).
"""

from __future__ import annotations

import logging
import sys
import threading
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from pathlib import Path

from ..errors import AppError, ErrorCode
from .sources import AudioSource, WasapiSource, WavFileSource
from .types import Channel

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class DeviceInfo:
    id: str
    name: str
    channel: Channel  # SYSTEM = output device captured in loopback, MIC = input device
    is_default: bool = False
    sample_rate: int = 0
    note: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        d["channel"] = self.channel.value
        return d


class DeviceBackend(ABC):
    name = "abstract"

    @abstractmethod
    def list_devices(self, refresh: bool = False) -> list[DeviceInfo]: ...

    @abstractmethod
    def open(self, device_id: str | None, channel: Channel) -> AudioSource:
        """Open the given device, or the default one for the channel when ``device_id`` is None.
        Raise AppError(DEVICE_UNAVAILABLE) when it cannot be opened."""

    def default_for(self, channel: Channel) -> DeviceInfo | None:
        devices = [d for d in self.list_devices() if d.channel == channel]
        return next((d for d in devices if d.is_default), devices[0] if devices else None)

    def close(self) -> None:
        pass


def _hint(name: str) -> str:
    lower = name.lower()
    if "hands-free" in lower or "mains libres" in lower or "headset" in lower and "bluetooth" in lower:
        return "Bluetooth mains libres : à choisir pendant les appels (qualité réduite)"
    if "bluetooth" in lower:
        return "Bluetooth"
    return ""


class WasapiBackend(DeviceBackend):  # pragma: no cover - requires Windows
    """WASAPI through PyAudioWPatch. PortAudio only sees devices present at initialisation:
    ``refresh=True`` terminates and re-creates the PortAudio instance."""

    name = "wasapi"

    def __init__(self):
        if sys.platform != "win32":
            raise AppError(ErrorCode.UNSUPPORTED_PLATFORM, "La capture WASAPI n'existe que sous Windows.")
        import pyaudiowpatch as pyaudio

        self._pyaudio = pyaudio
        self._lock = threading.RLock()
        self._pa = pyaudio.PyAudio()
        self._open_sources = 0

    def _reinit(self) -> None:
        with self._lock:
            if self._open_sources:
                return  # never re-initialise PortAudio under a running stream
            self._pa.terminate()
            self._pa = self._pyaudio.PyAudio()

    def _wasapi(self) -> dict:
        try:
            return self._pa.get_host_api_info_by_type(self._pyaudio.paWASAPI)
        except OSError as exc:
            raise AppError(ErrorCode.UNSUPPORTED_PLATFORM, "WASAPI n'est pas disponible sur ce poste.") from exc

    def list_devices(self, refresh: bool = False) -> list[DeviceInfo]:
        with self._lock:
            if refresh:
                self._reinit()
            api = self._wasapi()
            default_out, default_in = api.get("defaultOutputDevice", -1), api.get("defaultInputDevice", -1)
            default_out_name = None
            if default_out >= 0:
                default_out_name = self._pa.get_device_info_by_index(default_out)["name"]
            out: list[DeviceInfo] = []
            for d in self._pa.get_device_info_generator_by_host_api(host_api_index=api["index"]):
                if d.get("isLoopbackDevice"):
                    base = d["name"].replace(" [Loopback]", "")
                    out.append(DeviceInfo(
                        id=f"loopback:{base}", name=base, channel=Channel.SYSTEM,
                        is_default=(base == default_out_name), sample_rate=int(d["defaultSampleRate"]), note=_hint(base),
                    ))
                elif d["maxInputChannels"] > 0:
                    out.append(DeviceInfo(
                        id=f"input:{d['name']}", name=d["name"], channel=Channel.MIC,
                        is_default=(d["index"] == default_in), sample_rate=int(d["defaultSampleRate"]), note=_hint(d["name"]),
                    ))
            return out

    def _find_raw(self, device_id: str) -> dict | None:
        api = self._wasapi()
        kind, _, name = device_id.partition(":")
        for d in self._pa.get_device_info_generator_by_host_api(host_api_index=api["index"]):
            if kind == "loopback" and d.get("isLoopbackDevice") and d["name"].replace(" [Loopback]", "") == name:
                return d
            if kind == "input" and not d.get("isLoopbackDevice") and d["maxInputChannels"] > 0 and d["name"] == name:
                return d
        return None

    def open(self, device_id: str | None, channel: Channel) -> AudioSource:
        with self._lock:
            if device_id is None:
                default = self.default_for(channel)
                if default is None:
                    raise AppError(ErrorCode.NO_DEVICE, "Aucun périphérique audio disponible pour ce canal.")
                device_id = default.id
            raw = self._find_raw(device_id)
            if raw is None:
                raise AppError(ErrorCode.DEVICE_UNAVAILABLE, "Périphérique introuvable (débranché ?).")
            source = WasapiSource(self._pa, raw, channel)
            backend = self

            original_stop = source.stop

            def stop_and_release():
                original_stop()
                with backend._lock:
                    backend._open_sources = max(0, backend._open_sources - 1)

            source.stop = stop_and_release  # type: ignore[method-assign]
            self._open_sources += 1
            return source

    def close(self) -> None:
        with self._lock:
            self._pa.terminate()


class SyntheticFileBackend(DeviceBackend):
    """TEST MODE: exposes synthetic / anonymised WAV files as devices. Never real calls."""

    name = "test-files"

    def __init__(self, directory: str | Path, speed: float = 1.0):
        self.directory = Path(directory)
        self.speed = speed

    def list_devices(self, refresh: bool = False) -> list[DeviceInfo]:
        out = []
        for i, path in enumerate(sorted(self.directory.glob("*.wav"))):
            stem = path.stem
            # Two-channel files: channel 0 = remote party (system), channel 1 = advisor (mic)
            out.append(DeviceInfo(f"file:{path.name}#0", f"[TEST] {stem} — interlocuteur", Channel.SYSTEM, i == 0))
            out.append(DeviceInfo(f"file:{path.name}#1", f"[TEST] {stem} — conseiller", Channel.MIC, i == 0))
        return out

    def open(self, device_id: str | None, channel: Channel) -> AudioSource:
        if device_id is None:
            default = self.default_for(channel)
            if default is None:
                raise AppError(ErrorCode.NO_DEVICE, "Aucun fichier de test disponible.")
            device_id = default.id
        name, _, idx = device_id.removeprefix("file:").partition("#")
        path = self.directory / name
        if not path.exists() or path.parent != self.directory:
            raise AppError(ErrorCode.DEVICE_UNAVAILABLE, "Fichier de test introuvable.")
        import wave

        with wave.open(str(path), "rb") as w:
            channels = w.getnchannels()
        index = int(idx or 0)
        if index >= channels:
            index = 0 if channel == Channel.SYSTEM else channels - 1
        # Mimic WASAPI loopback (no packets during silence) only in real time: the gap detection
        # relies on the wall clock, which accelerated playback does not follow.
        return WavFileSource(path, channel, channel_index=index, speed=self.speed,
                             skip_silent_chunks=channel == Channel.SYSTEM and self.speed == 1.0)


def build_backend(kind: str, test_audio_dir: str | Path | None = None, speed: float = 1.0) -> DeviceBackend:
    if kind == "wasapi":
        return WasapiBackend()
    if kind == "test-files":
        return SyntheticFileBackend(test_audio_dir or Path(__file__).resolve().parent.parent / "test_audio", speed=speed)
    raise ValueError(f"unknown audio backend {kind!r}")
