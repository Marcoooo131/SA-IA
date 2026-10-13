"""Test doubles for audio devices."""

from __future__ import annotations

import threading

import numpy as np

from phonecall_desktop.audio.devices import DeviceBackend, DeviceInfo
from phonecall_desktop.audio.sources import AudioSource
from phonecall_desktop.audio.types import Channel
from phonecall_desktop.errors import AppError, ErrorCode


class FakeSource(AudioSource):
    def __init__(self, channel: Channel, name: str, rate: int = 48_000, channels: int = 2):
        self.channel, self.device_name, self.sample_rate, self.channels = channel, name, rate, channels
        self.alive = False
        self.stopped = False
        self._on_data = None
        self._lock = threading.Lock()

    def start(self, on_data, on_error):
        self._on_data, self.alive = on_data, True

    def emit(self, frames: np.ndarray) -> bool:
        """Simulates the audio driver calling back. Returns False if the source is closed."""
        with self._lock:
            if not self.alive or self._on_data is None:
                return False
            self._on_data(frames)
            return True

    def stop(self):
        with self._lock:
            self.alive, self.stopped, self._on_data = False, True, None

    def is_alive(self):
        return self.alive


class FakeBackend(DeviceBackend):
    def __init__(self):
        self.devices = {
            "loopback:Casque": DeviceInfo("loopback:Casque", "Casque", Channel.SYSTEM, True, 48_000),
            "loopback:Haut-parleurs": DeviceInfo("loopback:Haut-parleurs", "Haut-parleurs", Channel.SYSTEM, False, 48_000),
            "input:Micro casque": DeviceInfo("input:Micro casque", "Micro casque", Channel.MIC, True, 16_000),
        }
        self.opened: list[FakeSource] = []
        self.refreshes = 0

    def list_devices(self, refresh: bool = False):
        self.refreshes += int(refresh)
        return list(self.devices.values())

    def open(self, device_id, channel):
        if device_id is None:
            default = self.default_for(channel)
            if default is None:
                raise AppError(ErrorCode.NO_DEVICE)
            device_id = default.id
        info = self.devices.get(device_id)
        if info is None or info.channel != channel:
            raise AppError(ErrorCode.DEVICE_UNAVAILABLE)
        src = FakeSource(channel, info.name, rate=info.sample_rate, channels=2 if channel == Channel.SYSTEM else 1)
        self.opened.append(src)
        return src

    def last(self, channel: Channel) -> FakeSource:
        return [s for s in self.opened if s.channel == channel][-1]


def tone(seconds: float, rate: int, freq: float = 220.0, amp: float = 0.3, channels: int = 1) -> np.ndarray:
    t = np.arange(int(seconds * rate)) / rate
    # harmonic-rich "voiced" signal
    sig = amp * (np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * 2 * freq * t) + 0.25 * np.sin(2 * np.pi * 3 * freq * t)) / 1.75
    sig = sig.astype(np.float32)
    return np.repeat(sig[:, None], channels, axis=1) if channels > 1 else sig[:, None]


def silence(seconds: float, rate: int, channels: int = 1) -> np.ndarray:
    return np.zeros((int(seconds * rate), channels), dtype=np.float32)
