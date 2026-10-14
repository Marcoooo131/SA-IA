#!/usr/bin/env node
// Technical validation of out/phone-call-ai.mp4 + contact sheet. Writes out/validation.md.
// Exit code 1 if a check fails.

import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");
const FILE = join(OUT, process.argv[2] || "phone-call-ai.mp4");
const { VIDEO, SCENES, CUES } = await import(join(ROOT, "src/config.js"));

const probe = (args) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-of", "json", ...args, FILE], { encoding: "utf8", maxBuffer: 1 << 28 }));
const ffStderr = (args) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", FILE, ...args], { encoding: "utf8", maxBuffer: 1 << 28 }).stderr;

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "OK  " : "ÉCHEC"}  ${name} — ${detail}`);
};

// ---------------------------------------------------------------- streams
const info = probe(["-show_streams", "-show_format"]);
const v = info.streams.find((s) => s.codec_type === "video");
const a = info.streams.find((s) => s.codec_type === "audio");
const duration = Number(info.format.duration);
check("Durée", Math.abs(duration - VIDEO.duration) < 0.02, `${duration.toFixed(3)} s (attendu ${VIDEO.duration} s)`);
check("Résolution", v.width === VIDEO.width && v.height === VIDEO.height, `${v.width}×${v.height}`);
check("Codec vidéo", v.codec_name === "h264" && v.pix_fmt === "yuv420p", `${v.codec_name} ${v.profile} ${v.pix_fmt}, ${v.color_space ?? "?"}`);
check("Fréquence", v.r_frame_rate === `${VIDEO.fps}/1` && v.avg_frame_rate === `${VIDEO.fps}/1`, `${v.r_frame_rate} (moyenne ${v.avg_frame_rate})`);
const frames = probe(["-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets"]).streams[0].nb_read_packets;
check("Nombre d'images", Number(frames) === VIDEO.fps * VIDEO.duration, `${frames} (attendu ${VIDEO.fps * VIDEO.duration})`);
// regular timestamps = no missing or duplicated frame
const pts = probe(["-select_streams", "v:0", "-show_entries", "packet=pts_time"]).packets.map((p) => Number(p.pts_time)).sort((x, y) => x - y);
const gaps = pts.slice(1).map((p, i) => p - pts[i]);
const irregular = gaps.filter((g) => Math.abs(g - 1 / VIDEO.fps) > 0.0005).length;
check("Images régulières (pas de saut)", irregular === 0, `${irregular} écart(s) irrégulier(s) sur ${gaps.length}`);
check("Audio", a && a.codec_name === "aac" && a.channels === 2 && Number(a.sample_rate) === VIDEO.sampleRate,
      a ? `${a.codec_name} ${a.channels} canaux ${a.sample_rate} Hz ${Math.round(a.bit_rate / 1000)} kb/s` : "absent");
const aDur = Number(a?.duration ?? 0);
const vStart = Number(v.start_time);
const aStart = Number(a?.start_time ?? 0);
check("Synchronisation A/V", Math.abs(vStart - aStart) < 0.005 && Math.abs(aDur - VIDEO.duration) < 0.03,
      `départs vidéo ${vStart.toFixed(3)} s / audio ${aStart.toFixed(3)} s, durée audio ${aDur.toFixed(3)} s`);

// ---------------------------------------------------------------- loudness
const r128 = ffStderr(["-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"]);
const summary = r128.slice(r128.lastIndexOf("Summary:"));
const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
const LRA = Number(/LRA:\s+(-?[\d.]+) LU/.exec(summary)?.[1]);
const TP = Number(/True peak:\s+Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]);
check("Loudness intégré", Math.abs(I + 14) <= 1, `${I} LUFS (cible -14)`);
check("True peak", TP <= -1.0, `${TP} dBTP (max -1)`);

// ---------------------------------------------------------------- black frames
const bd = ffStderr(["-map", "0:v:0", "-vf", "blackdetect=d=0.05:pix_th=0.08:pic_th=0.985", "-f", "null", "-"]);
const blacks = [...bd.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
// intentional: the opening (black screen + call indicator), the hard cut to silence at 4 s and the
// deep black background of the signature while the red line draws, before the logo
const allowed = [[0, CUES.crmSlam + 0.05], [CUES.cutToSilence - 0.02, CUES.redPulse + 0.1],
                 [CUES.signatureCut, CUES.logoImpact + 0.05]];
const unexpected = blacks.filter(([s, e]) => !allowed.some(([as, ae]) => s >= as - 0.02 && e <= ae + 0.02));
check("Pas d'écran noir accidentel", unexpected.length === 0,
      blacks.length ? `noirs détectés : ${blacks.map(([s, e]) => `${s.toFixed(2)}–${e.toFixed(2)} s`).join(", ")} (voulus : ouverture, coupure à ${CUES.cutToSilence} s, fond noir de la signature avant le logo)` : "aucun");
// last frames are not black
const last = ffStderr(["-ss", String(VIDEO.duration - 0.05), "-map", "0:v:0", "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YMAX", "-f", "null", "-"]);
const ymax = Math.max(...[...last.matchAll(/YMAX=(\d+)/g)].map((m) => Number(m[1])));
check("Dernières images", ymax > 200, `luminance max ${ymax} (texte et logo visibles)`);

// ---------------------------------------------------------------- contact sheet
const times = [];
for (const s of SCENES) {
  const d = s.end - s.start;
  times.push(s.start + d * 0.35, s.start + d * 0.8);
}
const sheet = join(OUT, "contact_sheet.jpg");
const select = times.map((t) => `eq(n\\,${Math.round(t * VIDEO.fps)})`).join("+");
const fontFile = execFileSync("fc-match", ["-f", "%{file}", "Inter:weight=200"], { encoding: "utf8" }).trim();
spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", FILE, "-vf",
  `select='${select}',scale=360:640,drawtext=fontfile=${fontFile}:text='%{pts\\:hms}':x=10:y=10:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6,tile=7x2:padding=6:color=0x222222`,
  "-frames:v", "1", "-q:v", "2", sheet]);
check("Planche de contact", true, `${sheet} (${times.length} images clés)`);

// ---------------------------------------------------------------- report
const failed = checks.filter((c) => !c.ok);
const md = [
  "# Validation technique — PHONE CALL AI (vidéo 30 s)",
  "",
  `Fichier : \`${FILE.replace(ROOT + "/", "")}\` — ${(Number(info.format.size) / 1e6).toFixed(1)} Mo, ${Math.round(info.format.bit_rate / 1000)} kb/s`,
  "",
  "| Contrôle | Résultat | Détail |",
  "|---|---|---|",
  ...checks.map((c) => `| ${c.name} | ${c.ok ? "OK" : "**ÉCHEC**"} | ${c.detail} |`),
  "",
  `Loudness : intégré ${I} LUFS, LRA ${LRA} LU, true peak ${TP} dBTP (EBU R128, filtre ebur128 de FFmpeg).`,
  "",
  failed.length ? `**${failed.length} contrôle(s) en échec.**` : "Tous les contrôles automatiques sont passés.",
  "",
].join("\n");
writeFileSync(join(OUT, "validation.md"), md);
console.log(failed.length ? `\n${failed.length} échec(s)` : "\nTous les contrôles sont OK — out/validation.md");
process.exit(failed.length ? 1 : 0);
