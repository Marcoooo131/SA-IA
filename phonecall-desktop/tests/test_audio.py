import time

import numpy as np
import pytest

from fakes import FakeBackend, tone
from phonecall_desktop.audio.capture import CaptureConfig, CaptureManager
from phonecall_desktop.audio.dsp import LevelMeter, Resampler, int16_bytes_to_float, rms_dbfs, to_mono
from phonecall_desktop.audio.timeline import ChannelTimeline
from phonecall_desktop.audio.types import Channel
from phonecall_desktop.audio.vad import EnergyVad
from phonecall_desktop.errors import AppError, ErrorCode


def test_int16_conversion_and_mono():
    raw = np.array([[32767, -32768], [0, 16384]], dtype="<i2").tobytes()
    frames = int16_bytes_to_float(raw, 2)
    assert frames.shape == (2, 2)
    assert frames[0, 0] == pytest.approx(1.0, abs=1e-4) and frames[0, 1] == -1.0
    assert to_mono(frames).tolist() == pytest.approx([0.0, 0.25], abs=1e-4)


def test_rms_dbfs():
    assert rms_dbfs(np.zeros(100, dtype=np.float32)) == -100.0
    full_sine = np.sin(np.linspace(0, 200 * np.pi, 16000)).astype(np.float32)
    assert rms_dbfs(full_sine) == pytest.approx(-3.01, abs=0.05)


def test_streaming_resampler_keeps_length_and_frequency():
    r = Resampler(48_000, 16_000)
    sig = tone(2.0, 48_000, freq=440.0)[:, 0]
    out = np.concatenate([r.process(sig[i : i + 960]) for i in range(0, len(sig), 960)] + [r.process(np.zeros(0, np.float32), last=True)])
    assert abs(len(out) - 32_000) <= 16
    spectrum = np.abs(np.fft.rfft(out[4000:20000]))
    peak_hz = np.argmax(spectrum) * 16_000 / 16_000
    assert peak_hz == pytest.approx(440, abs=2)


def test_timeline_inserts_gaps_and_fills_silence():
    tl = ChannelTimeline(Channel.SYSTEM, 16_000, session_start=100.0)
    chunks = tl.push(tone(1.0, 16_000), arrival_wall=101.0)  # first second of the call
    assert chunks[0].t_start == 0.0 and tl.position == pytest.approx(1.0)
    # Loopback sends nothing for 3 s, then 1 s of audio arriving at t=5 s
    chunks = tl.push(tone(1.0, 16_000), arrival_wall=105.0)
    assert len(chunks) == 2 and not chunks[0].samples.any()
    assert chunks[1].t_start == pytest.approx(4.0, abs=0.01)
    # Quiet source: the monitor advances the timeline
    filled = tl.fill_silence(now_wall=108.0, margin=0.3)
    assert filled.t_start == pytest.approx(5.0, abs=0.01) and tl.position == pytest.approx(7.7, abs=0.01)
    assert tl.fill_silence(now_wall=108.0) is None


def test_small_jitter_is_not_a_gap():
    tl = ChannelTimeline(Channel.MIC, 16_000, session_start=0.0)
    tl.push(tone(0.5, 16_000), arrival_wall=0.5)
    chunks = tl.push(tone(0.5, 16_000), arrival_wall=1.15)  # 150 ms late: jitter
    assert len(chunks) == 1


def test_vad_detects_voice_over_noise():
    vad = EnergyVad()
    rng = np.random.default_rng(0)
    noise = [rng.normal(0, 0.002, 480).astype(np.float32) for _ in range(50)]
    assert not any(vad.is_speech(f) for f in noise)
    voice = tone(0.3, 16_000)[:, 0]
    assert all(vad.is_speech(voice[i : i + 480]) for i in range(0, 4800, 480))
    assert vad.speech_confirmed


def test_level_meter():
    m = LevelMeter()
    m.update(tone(0.1, 16_000)[:, 0], now=1.0, duration_s=0.1)
    assert m.level > -20 and m.last_signal_at == 1.0
    m.update(np.zeros(1600, np.float32), now=2.0, duration_s=1.0)
    assert m.level < -40 and m.last_signal_at == 1.0


# ------------------------------------------------------------------ capture manager


def make_manager(backend, **cfg):
    chunks, events = [], []
    mgr = CaptureManager(backend, chunks.append, lambda t, p: events.append((t, p)))
    config = CaptureConfig(channels=cfg.pop("channels", {Channel.SYSTEM: None, Channel.MIC: None}),
                           monitor_interval_s=0.05, **cfg)
    return mgr, config, chunks, events


def wait_for(cond, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.02)
    return False


def test_both_channels_captured_and_resampled():
    backend = FakeBackend()
    mgr, cfg, chunks, _ = make_manager(backend)
    opened = mgr.start(cfg)
    assert opened == {"system": "Casque", "mic": "Micro casque"}
    backend.last(Channel.SYSTEM).emit(tone(0.5, 48_000, channels=2))
    backend.last(Channel.MIC).emit(tone(0.5, 16_000))
    assert wait_for(lambda: {c.channel for c in chunks if c.samples.any()} == {Channel.SYSTEM, Channel.MIC})
    mgr.stop()
    sys_samples = sum(len(c.samples) for c in chunks if c.channel == Channel.SYSTEM)
    assert sys_samples >= 7_900  # 0.5 s at 16 kHz (+ silence fill)


def test_nothing_delivered_after_stop():
    backend = FakeBackend()
    mgr, cfg, chunks, _ = make_manager(backend)
    mgr.start(cfg)
    sources = list(backend.opened)
    mgr.stop()
    assert all(s.stopped and not s.alive for s in sources)
    n = len(chunks)
    assert not any(s.emit(tone(0.2, s.sample_rate, channels=s.channels)) for s in sources)
    time.sleep(0.2)
    assert len(chunks) == n
    assert not mgr.capturing
    mgr.stop()  # idempotent


def test_no_source_raises():
    backend = FakeBackend()
    backend.devices.clear()
    mgr, cfg, _, _ = make_manager(backend)
    with pytest.raises(AppError) as exc:
        mgr.start(cfg)
    assert exc.value.code == ErrorCode.NO_SOURCE
    assert not mgr.capturing


def test_one_channel_failing_still_starts_with_warning():
    backend = FakeBackend()
    mgr, cfg, _, events = make_manager(backend, channels={Channel.SYSTEM: "loopback:Absent", Channel.MIC: None})
    assert mgr.start(cfg) == {"mic": "Micro casque"}
    assert any(t == "warning" and p["channel"] == "system" for t, p in events)
    mgr.stop()


def test_no_signal_warning_and_recovery():
    backend = FakeBackend()
    mgr, cfg, _, events = make_manager(backend, channels={Channel.MIC: None}, no_signal_warn_s=0.3)
    mgr.start(cfg)
    assert wait_for(lambda: any(t == "no_signal" for t, _ in events))
    src = backend.last(Channel.MIC)
    assert wait_for(lambda: src.emit(tone(0.1, 16_000)) and any(t == "signal_back" for t, _ in events))
    mgr.stop()


def test_device_lost_reconnects_same_device():
    backend = FakeBackend()
    mgr, cfg, _, events = make_manager(backend, channels={Channel.SYSTEM: "loopback:Casque"})
    mgr.start(cfg)
    first = backend.last(Channel.SYSTEM)
    first.alive = False  # unplugged
    assert wait_for(lambda: any(t == "device_reconnected" for t, _ in events))
    assert any(t == "device_lost" for t, _ in events)
    assert backend.last(Channel.SYSTEM) is not first and backend.refreshes >= 1
    mgr.stop()


def test_device_removed_falls_back_to_default():
    backend = FakeBackend()
    mgr, cfg, _, events = make_manager(backend, channels={Channel.SYSTEM: "loopback:Haut-parleurs"})
    mgr.start(cfg)
    backend.devices.pop("loopback:Haut-parleurs")
    backend.last(Channel.SYSTEM).alive = False
    assert wait_for(lambda: any(t == "device_reconnected" for t, _ in events))
    ev = next(p for t, p in events if t == "device_reconnected")
    assert ev["fallback_to_default"] and ev["device"] == "Casque"
    mgr.stop()


def test_levels_events_report_connection():
    backend = FakeBackend()
    mgr, cfg, _, events = make_manager(backend)
    mgr.start(cfg)
    backend.last(Channel.SYSTEM).emit(tone(0.3, 48_000, channels=2))
    assert wait_for(lambda: any(t == "levels" and p["channels"]["system"]["signal"] for t, p in events))
    mgr.stop()


def test_silence_fill_keeps_timeline_moving_without_data():
    backend = FakeBackend()
    mgr, cfg, chunks, _ = make_manager(backend, channels={Channel.SYSTEM: None})
    mgr.start(cfg)
    time.sleep(0.8)
    mgr.stop()
    assert sum(c.duration for c in chunks) >= 0.3  # silence pushed although the source sent nothing


def test_source_failing_to_open_gives_clear_error():
    backend = FakeBackend()
    original_open = backend.open

    def failing_open(device_id, channel):
        src = original_open(device_id, channel)
        if channel == Channel.MIC:
            def boom(on_data, on_error):
                raise OSError("[Errno -9999] Unanticipated host error: access denied")
            src.start = boom
        return src

    backend.open = failing_open
    mgr, cfg, _, events = make_manager(backend)
    assert mgr.start(cfg) == {"system": "Casque"}
    warning = next(p for t, p in events if t == "warning")
    assert warning["channel"] == "mic" and "micro" in warning["message"].lower()
    mgr.stop()
    mgr2, cfg2, _, _ = make_manager(backend, channels={Channel.MIC: None})
    with pytest.raises(AppError) as exc:
        mgr2.start(cfg2)
    assert exc.value.code == ErrorCode.NO_SOURCE and "Windows bloque" in str(exc.value)
