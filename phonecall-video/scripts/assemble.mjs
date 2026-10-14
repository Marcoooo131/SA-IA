#!/usr/bin/env node
// Assembles out/video_noaudio.mp4 + out/soundtrack.wav → out/phone-call-ai.mp4 with FFmpeg.
// Loudness: two-pass EBU R128 normalisation (loudnorm), target -14 LUFS integrated and a true peak
// of -1.5 dBTP before AAC encoding, so that the encoded file stays at or below -1 dBTP
// (checked by verify.mjs).

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");
const { VIDEO } = await import(join(ROOT, "src/config.js"));
const TARGET = { I: -14, TP: -1.5, LRA: 11 };

/** Runs ffmpeg, returns its stderr (where loudnorm prints its JSON). */
function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stderr;
}

const wav = join(OUT, "soundtrack.wav");
const video = join(OUT, "video_noaudio.mp4");
const final = join(OUT, "phone-call-ai.mp4");

// pass 1: measure the soundtrack
const p1 = ffmpeg(["-i", wav, "-af", `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`, "-f", "null", "-"]);
const m = JSON.parse(p1.slice(p1.lastIndexOf("{"), p1.lastIndexOf("}") + 1));
console.log(`Bande-son brute : ${m.input_i} LUFS, true peak ${m.input_tp} dBTP, LRA ${m.input_lra} LU`);

// pass 2: normalise with the measured values (linear gain when possible), mux, exact duration
const af = [
  `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}`
    + `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
  `aresample=${VIDEO.sampleRate}`,
  `atrim=0:${VIDEO.duration}`,
].join(",");
ffmpeg([
  "-y", "-i", video, "-i", wav,
  "-map", "0:v:0", "-map", "1:a:0",
  "-af", af,
  "-c:v", "copy",
  "-c:a", "aac", "-b:a", "256k", "-ar", String(VIDEO.sampleRate), "-ac", "2",
  "-t", String(VIDEO.duration),
  "-movflags", "+faststart",
  final,
]);
console.log(`Fichier final : ${final}`);
