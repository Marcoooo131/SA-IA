"""Benchmark of the real streaming transcription on a SYNTHETIC French conversation.

- builds a 2-channel call spoken by espeak-ng (fictitious script, no real customer);
- plays it in real time through the same pipeline as the app (segmenter → recogniser → assembler);
- measures WER per turn, the latency of final text after the end of each sentence, the real-time
  factor, partial-result frequency, and checks the last words when stopping mid-sentence.

Usage: python scripts/benchmark_stt.py --model small --out report.json [--speed 1]
Requires espeak-ng and network access to download the faster-whisper model the first time.
Synthetic voices are easier AND harder than real calls in different ways: these numbers only
validate the mechanics; real accuracy must be measured on anonymised recordings of real calls.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import time
import unicodedata
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from phonecall_desktop.audio.dsp import Resampler, to_mono  # noqa: E402
from phonecall_desktop.audio.types import AudioChunk, Channel  # noqa: E402
from phonecall_desktop.stt.streaming import StreamingTranscriber  # noqa: E402
from phonecall_desktop.stt.whisper_local import WhisperRecognizer  # noqa: E402
from phonecall_desktop.synthetic import generate_wav  # noqa: E402
from phonecall_desktop.transcript.assembler import TranscriptAssembler  # noqa: E402

NUMBERS = {"deux": "2", "un": "1", "une": "1"}


def words(text: str) -> list[str]:
    text = unicodedata.normalize("NFKD", text.lower().replace("’", "'"))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return [NUMBERS.get(w, w) for w in re.findall(r"[a-z0-9]+", text)]


def wer(ref: str, hyp: str) -> float:
    r, h = words(ref), words(hyp)
    d = np.zeros((len(r) + 1, len(h) + 1), dtype=int)
    d[:, 0] = np.arange(len(r) + 1)
    d[0, :] = np.arange(len(h) + 1)
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i, j] = min(d[i - 1, j] + 1, d[i, j - 1] + 1, d[i - 1, j - 1] + (r[i - 1] != h[j - 1]))
    return d[len(r), len(h)] / max(1, len(r))


def load(wav: Path):
    with wave.open(str(wav)) as w:
        rate, n = w.getframerate(), w.getnframes()
        data = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32).reshape(-1, 2) / 32768
    return rate, data


def run(model: str, scenario: str, speed: float, stop_at: float | None, workdir: Path) -> dict:
    wav, script_path = generate_wav(scenario, workdir, tts=True)
    script = json.loads(script_path.read_text())["segments"]
    rate, data = load(wav)
    rec = WhisperRecognizer(model=model, hotwords="Sector Alarm")
    t0 = time.monotonic()
    rec.warmup()
    load_s = time.monotonic() - t0

    asm = TranscriptAssembler()
    final_times: dict[str, float] = {}
    partials = 0
    play_start = time.monotonic()

    def on_event(ev):
        nonlocal partials
        if ev.kind == "final":
            final_times[ev.utterance_id] = time.monotonic()
        else:
            partials += 1
        asm.apply(ev)

    st = StreamingTranscriber(rec, on_event, [Channel.SYSTEM, Channel.MIC], context_prompt="Sector Alarm")
    resamplers = {Channel.SYSTEM: Resampler(rate), Channel.MIC: Resampler(rate)}
    pos = {Channel.SYSTEM: 0.0, Channel.MIC: 0.0}
    step = int(0.02 * rate)
    total = len(data) if stop_at is None else int(stop_at * rate)
    for i in range(0, total, step):
        due = play_start + (i + step) / rate / speed
        if (delay := due - time.monotonic()) > 0:
            time.sleep(delay)
        for ci, ch in ((0, Channel.SYSTEM), (1, Channel.MIC)):
            out = resamplers[ch].process(to_mono(data[i : i + step, ci : ci + 1]))
            if out.size:
                st.feed(AudioChunk(ch, out, pos[ch]))
                pos[ch] += len(out) / 16000
    stop_wall = time.monotonic()
    st.finish(timeout=600)
    finish_s = time.monotonic() - stop_wall
    st.close()

    finals = asm.final_segments()
    per_turn = []
    for turn in script:
        if stop_at is not None and turn["start"] >= stop_at:
            continue
        ch = Channel(turn["channel"])
        hyp = " ".join(s.text for s in finals if s.channel == ch and s.t_start < turn["end"] and s.t_end > turn["start"])
        ref = turn["text"]
        if stop_at is not None and turn["end"] > stop_at:
            # cut turn: compare only with the words actually spoken before the stop
            spoken = (stop_at - turn["start"]) / (turn["end"] - turn["start"])
            ref = " ".join(ref.split()[: max(1, int(len(ref.split()) * spoken))])
        per_turn.append({"channel": ch.value, "ref": ref, "hyp": hyp, "wer": round(wer(ref, hyp), 3)})

    # latency: wall time between the end of a sentence (audio clock) and its final text
    latencies = []
    for s in finals:
        if s.utterance_id in final_times:
            sentence_end_wall = play_start + s.t_end / speed
            latencies.append(final_times[s.utterance_id] - sentence_end_wall)
    audio_s = total / rate
    ref_all = " ".join(t["ref"] for t in per_turn)
    hyp_all = " ".join(t["hyp"] for t in per_turn)
    return {
        "model": model, "scenario": scenario, "speed": speed, "stopped_at_s": stop_at,
        "audio_seconds": round(audio_s, 1), "model_load_s": round(load_s, 1),
        "wer_global": round(wer(ref_all, hyp_all), 3),
        "latency_final_median_s": round(float(np.median(latencies)), 2) if latencies else None,
        "latency_final_p90_s": round(float(np.percentile(latencies, 90)), 2) if latencies else None,
        "finish_after_stop_s": round(finish_s, 2),
        "recognition_cpu_s": round(st.stats["recognition_seconds"], 1),
        "real_time_factor": round(st.stats["recognition_seconds"] / audio_s, 2),
        "partials_shown": partials, "partials_skipped": st.stats["partials_skipped"],
        "duplicates_ignored": asm.duplicates_ignored,
        "turns": per_turn,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="small")
    ap.add_argument("--scenario", default="demenagement")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--out", default="stt_benchmark.json")
    args = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        full = run(args.model, args.scenario, args.speed, None, Path(tmp))
        # stop in the middle of the 4th turn: are the last words kept?
        script = json.loads((Path(tmp) / f"{args.scenario}_tts.script.json").read_text())["segments"]
        cut = script[3]["start"] + (script[3]["end"] - script[3]["start"]) * 0.6
        stopped = run(args.model, args.scenario, args.speed, round(cut, 2), Path(tmp))
    report = {"full_call": full, "stop_mid_sentence": stopped}
    Path(args.out).write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    for name, r in report.items():
        print(f"{name}: model={r['model']} WER={r['wer_global']:.1%} latency median={r['latency_final_median_s']}s "
              f"p90={r['latency_final_p90_s']}s RTF={r['real_time_factor']} finish={r['finish_after_stop_s']}s")
    last = stopped["turns"][-1]
    print(f"last words before stop: ref='{last['ref']}' hyp='{last['hyp']}'")
    return 0


if __name__ == "__main__":
    sys.exit(main())
