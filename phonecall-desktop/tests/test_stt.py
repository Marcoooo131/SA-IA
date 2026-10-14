import time

import numpy as np
import pytest

from phonecall_desktop.audio.devices import SyntheticFileBackend
from phonecall_desktop.audio.dsp import Resampler, to_mono
from phonecall_desktop.audio.types import AudioChunk, Channel
from phonecall_desktop.errors import AppError, ErrorCode
from phonecall_desktop.stt.base import RecognitionResult, Recognizer
from phonecall_desktop.stt.scripted import ScriptedRecognizer
from phonecall_desktop.stt.segmenter import Segmenter, SegmenterConfig
from phonecall_desktop.stt.streaming import StreamingTranscriber, is_hallucination
from phonecall_desktop.synthetic import generate_wav


@pytest.fixture(scope="module")
def call(tmp_path_factory):
    d = tmp_path_factory.mktemp("audio")
    wav, script = generate_wav("demenagement", d)
    return d, wav, script


def chunks_from_wav(wav, channel_index, channel, chunk_s=0.05):
    import wave

    with wave.open(str(wav)) as w:
        rate, n = w.getframerate(), w.getnframes()
        data = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32).reshape(-1, 2) / 32768
    r = Resampler(rate)
    pos, t = 0, 0.0
    step = int(chunk_s * rate)
    while pos < len(data):
        out = r.process(to_mono(data[pos : pos + step, channel_index : channel_index + 1]))
        if out.size:
            yield AudioChunk(channel, out, t)
            t += len(out) / 16000
        pos += step


def test_segmenter_finds_each_turn(call):
    _, wav, script = call
    import json

    expected = [s for s in json.loads(script.read_text(encoding="utf-8"))["segments"] if s["channel"] == "system"]
    seg = Segmenter(Channel.SYSTEM)
    finals = []
    for chunk in chunks_from_wav(wav, 0, Channel.SYSTEM):
        finals += [u for u in seg.feed(chunk) if u.final]
    finals += seg.flush()
    assert len(finals) == len(expected)
    for u, e in zip(finals, expected, strict=True):
        assert u.t_start == pytest.approx(e["start"], abs=0.35)
        assert u.t_end == pytest.approx(e["end"], abs=0.5)
    assert [u.id for u in finals] == [f"system-{i}" for i in range(len(expected))]


def test_long_monologue_is_cut_and_partials_emitted():
    seg = Segmenter(Channel.MIC, SegmenterConfig(max_utterance_s=4.0, partial_every_s=1.0))
    from fakes import tone

    audio = tone(10.0, 16_000)[:, 0]
    out = []
    for i in range(0, len(audio), 800):
        out += seg.feed(AudioChunk(Channel.MIC, audio[i : i + 800], i / 16000))
    finals = [u for u in out if u.final]
    partials = [u for u in out if not u.final]
    assert len(finals) == 2 and all(3.9 <= len(u.audio) / 16000 <= 4.1 for u in finals)
    assert len(partials) >= 4
    assert seg.flush()[0].final  # the rest (about 2 s) is kept at the end


def test_flush_keeps_last_words():
    from fakes import tone

    seg = Segmenter(Channel.MIC)
    audio = tone(1.0, 16_000)[:, 0]
    assert all(not u.final for u in seg.feed(AudioChunk(Channel.MIC, audio, 0.0)))
    last = seg.flush()
    assert len(last) == 1 and last[0].final and len(last[0].audio) >= 15_000


def run_transcriber(call, delay=0.0, **kw):
    _, wav, script = call
    rec = ScriptedRecognizer.from_file(script, delay_s=delay)
    events = []
    st = StreamingTranscriber(rec, events.append, [Channel.SYSTEM, Channel.MIC], **kw)
    for ci, ch in ((0, Channel.SYSTEM), (1, Channel.MIC)):
        for chunk in chunks_from_wav(wav, ci, ch):
            st.feed(chunk)
    st.finish(timeout=30)
    st.close()
    return events, rec, st


def test_streaming_produces_every_turn_once(call):
    import json

    events, _, st = run_transcriber(call)
    finals = [e for e in events if e.kind == "final" and e.text]
    expected = json.loads(call[2].read_text(encoding="utf-8"))["segments"]
    assert sorted(e.text for e in finals) == sorted(s["text"] for s in expected)
    ids = [e.utterance_id for e in events if e.kind == "final"]
    assert len(ids) == len(set(ids))  # no duplicate final
    assert any(e.kind == "partial" for e in events)  # progressive display
    assert st.stats["finals"] == len(ids)


def test_partials_never_after_final(call):
    events, _, _ = run_transcriber(call, delay=0.02)
    finalized = set()
    for e in events:
        if e.kind == "final":
            finalized.add(e.utterance_id)
        else:
            assert e.utterance_id not in finalized


class SlowRecognizer(Recognizer):
    def __init__(self, delay):
        self.delay, self.calls = delay, []

    def transcribe(self, audio, *, context="", fast=False, channel=None, t_start=0.0):
        self.calls.append(fast)
        time.sleep(self.delay)
        return RecognitionResult("texte")


def test_slow_recognizer_still_gets_every_final(call):
    slow = SlowRecognizer(0.05)
    ev2 = []
    st2 = StreamingTranscriber(slow, ev2.append, [Channel.SYSTEM])
    for chunk in chunks_from_wav(call[1], 0, Channel.SYSTEM, chunk_s=0.5):
        st2.feed(chunk)
    st2.finish(timeout=30)
    st2.close()
    assert sum(1 for e in ev2 if e.kind == "final") == 5
    assert st2.stats["finals"] == 5


def test_finish_timeout(call):
    rec = SlowRecognizer(1.0)
    st = StreamingTranscriber(rec, lambda e: None, [Channel.MIC])
    from fakes import tone

    audio = tone(3.0, 16_000)[:, 0]
    st.feed(AudioChunk(Channel.MIC, audio, 0.0))
    with pytest.raises(AppError) as exc:
        st.finish(timeout=0.3)
    assert exc.value.code == ErrorCode.TRANSCRIPTION_TIMEOUT
    st.close()


def test_recognizer_crash_does_not_lose_the_utterance():
    class Broken(Recognizer):
        def transcribe(self, audio, **kw):
            raise RuntimeError("boom")

    events = []
    st = StreamingTranscriber(Broken(), events.append, [Channel.MIC])
    from fakes import silence, tone

    st.feed(AudioChunk(Channel.MIC, np.concatenate([tone(1.0, 16000)[:, 0], silence(1.0, 16000)[:, 0]]), 0.0))
    st.finish(timeout=5)
    st.close()
    assert events and events[-1].kind == "final" and events[-1].uncertain and "non transcrit" in events[-1].text


def test_hallucination_filter():
    assert is_hallucination("Sous-titres réalisés par la communauté d'Amara.org")
    assert not is_hallucination("Je voudrais résilier mon contrat.")


def test_file_backend_plays_whole_file(call):
    d, wav, _ = call
    backend = SyntheticFileBackend(d, speed=50)
    src = backend.open(f"file:{wav.name}#0", Channel.SYSTEM)
    got = []
    src.start(lambda f: got.append(len(f)), lambda e: None)
    assert src.finished.wait(10)
    src.stop()
    import wave

    with wave.open(str(wav)) as w:
        total = w.getnframes()
    assert sum(got) == total  # accelerated: every chunk delivered
    rt = SyntheticFileBackend(d, speed=1.0).open(f"file:{wav.name}#0", Channel.SYSTEM)
    assert rt.skip_silent_chunks  # real time: silent chunks skipped like WASAPI loopback
    assert backend.open(None, Channel.MIC).channel_index == 1
    with pytest.raises(AppError):
        backend.open("file:../../etc/passwd#0", Channel.SYSTEM)


def test_repetition_loops_are_collapsed():
    from phonecall_desktop.stt.streaming import collapse_repetitions

    assert collapse_repetitions("Non, non, non, non, non, non, non.") == ("Non,", True)
    assert collapse_repetitions("je vous dis je vous dis je vous dis je vous dis bonjour") == ("je vous dis bonjour", True)
    assert collapse_repetitions("Oui oui, d'accord.") == ("Oui oui, d'accord.", False)  # two is natural
    assert collapse_repetitions("C'est très très bien.") == ("C'est très très bien.", False)


def test_repetition_marks_final_uncertain():
    class Looping(Recognizer):
        def transcribe(self, audio, **kw):
            return RecognitionResult("Non, non, non, non, mais non.")

    from fakes import silence, tone

    events = []
    st = StreamingTranscriber(Looping(), events.append, [Channel.MIC])
    st.feed(AudioChunk(Channel.MIC, np.concatenate([tone(1.0, 16000)[:, 0], silence(1.0, 16000)[:, 0]]), 0.0))
    st.finish(timeout=5)
    st.close()
    final = [e for e in events if e.kind == "final"][0]
    assert final.uncertain and final.text == "Non, mais non."


def test_vocabulary_word_alone_is_an_artefact():
    from phonecall_desktop.stt.streaming import is_hallucination, vocabulary_terms

    terms = vocabulary_terms("Sector Alarm, télésurveillance, alarme")
    for text in ("Sector Alarm", "Sector Alarm.", "sector alarm, Sector Alarm", "Télésurveillance !"):
        assert is_hallucination(text, terms), text
    for text in ("Oui bonjour, Société Sector Alarm, vous allez bien ?", "Mon alarme sonne la nuit.", "Sector"):
        assert not is_hallucination(text, terms), text
