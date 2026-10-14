// Original soundtrack synthesised with the Web Audio API (OfflineAudioContext: rendered faster than
// real time, sample-exact, deterministic). Every event is placed on the SAME timeline as the image
// (config.js CUES): no independent timer, image and sound cannot drift apart.
//
// Style: cinematic electronic, 120 BPM. Tension (0–4 s) → hard cut → groove (5.5 s →) → filter
// drop on « Fin » → generation riser → full groove → riser → final impact (27.6 s).

import { CONVERSATION, CUES, NOTE, VIDEO } from "./config.js";
import { rng } from "./timeline.js";

const BEAT = 60 / CUES.bpm;
const NOTE_HZ = (midi) => 440 * 2 ** ((midi - 69) / 12);

export async function renderSoundtrack() {
  const sr = VIDEO.sampleRate;
  const ctx = new OfflineAudioContext(2, Math.round(sr * VIDEO.duration), sr);

  // ---------------------------------------------------------------- buses
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 8;
  comp.ratio.value = 3;
  comp.attack.value = 0.006;
  comp.release.value = 0.18;
  // peak limiter (fast, high ratio) so that loudness normalisation stays a simple linear gain
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  master.connect(comp).connect(limiter).connect(ctx.destination);

  // reverb (generated impulse response, seeded)
  const reverb = ctx.createConvolver();
  {
    const len = Math.round(sr * 2.6);
    const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const r = rng(900 + ch);
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * (1 - i / len) ** 3.2;
    }
    reverb.buffer = ir;
  }
  const revOut = ctx.createGain();
  revOut.gain.value = 0.32;
  reverb.connect(revOut).connect(master);

  // music bus with a low-pass for the « Fin » drop, and a hard cut at 4 s / 27 s
  const music = ctx.createGain();
  const musicLP = ctx.createBiquadFilter();
  musicLP.type = "lowpass";
  musicLP.frequency.value = 20000;
  musicLP.Q.value = 0.8;
  music.connect(musicLP).connect(master);
  const lp = musicLP.frequency;
  lp.setValueAtTime(20000, CUES.waveOff[0]);
  lp.exponentialRampToValueAtTime(380, CUES.waveOff[1]);
  lp.setValueAtTime(380, CUES.transform[1] - 0.02);
  lp.exponentialRampToValueAtTime(20000, CUES.transform[1] + 0.12);

  const sfx = ctx.createGain();
  sfx.gain.value = 1;
  sfx.connect(master);
  const send = (node, amount) => {
    const g = ctx.createGain();
    g.gain.value = amount;
    node.connect(g).connect(reverb);
  };

  // seeded white noise buffer
  const noise = ctx.createBuffer(1, sr * 2, sr);
  {
    const r = rng(1234);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  }
  const noiseSrc = (t, dur, offset = 0) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.start(t, offset % 2, dur + 0.05);
    return s;
  };

  const env = (g, t, a, peak, d, sustain = 0, rel = 0.05, hold = 0) => {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (sustain > 0) {
      g.gain.setTargetAtTime(sustain, t + a, d / 3);
      g.gain.setValueAtTime(sustain, t + a + hold);
      g.gain.linearRampToValueAtTime(0, t + a + hold + rel);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
  };

  // ---------------------------------------------------------------- instruments
  function kick(t, level = 1, out = music) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    env(g, t, 0.002, 0.95 * level, 0.42);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.5);
    const n = noiseSrc(t, 0.02, t * 7);
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 2500;
    const ng = ctx.createGain();
    env(ng, t, 0.001, 0.18 * level, 0.02);
    n.connect(f).connect(ng).connect(out);
  }

  function hat(t, level = 1, open = false) {
    const n = noiseSrc(t, open ? 0.25 : 0.06, t * 13);
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 8000;
    const g = ctx.createGain();
    env(g, t, 0.001, 0.12 * level, open ? 0.22 : 0.045);
    n.connect(f).connect(g).connect(music);
  }

  function clap(t, level = 1) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.011;
      const n = noiseSrc(tt, 0.2, tt * 5);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1600;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      env(g, tt, 0.001, (i === 2 ? 0.42 : 0.25) * level, i === 2 ? 0.16 : 0.02);
      n.connect(f).connect(g).connect(music);
      if (i === 2) send(g, 0.4);
    }
  }

  function bassNote(t, midi, dur, level = 1) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = NOTE_HZ(midi);
    const o2 = ctx.createOscillator();
    o2.type = "square";
    o2.frequency.value = NOTE_HZ(midi - 12);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 6;
    f.frequency.setValueAtTime(1200, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur * 0.9);
    const g = ctx.createGain();
    env(g, t, 0.004, 0.32 * level, dur * 0.85);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(music);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  function pad(t, dur, midis, level = 1, out = music) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 * level, t + Math.min(0.8, dur / 3));
    g.gain.setValueAtTime(0.06 * level, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1800;
    f.connect(g).connect(out);
    send(g, 0.5);
    midis.forEach((m, i) => {
      for (const det of [-9, 7]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = NOTE_HZ(m);
        o.detune.value = det + i;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    });
  }

  function pluck(t, midi, level = 1, out = sfx, decay = 0.35) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = NOTE_HZ(midi);
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = NOTE_HZ(midi + 12);
    const g = ctx.createGain();
    env(g, t, 0.003, 0.22 * level, decay);
    o.connect(g);
    o2.connect(g);
    g.connect(out);
    send(g, 0.35);
    o.start(t);
    o2.start(t);
    o.stop(t + decay + 0.1);
    o2.stop(t + decay + 0.1);
  }

  function click(t, level = 1) {
    const n = noiseSrc(t, 0.012, t * 3);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 3200;
    f.Q.value = 2;
    const g = ctx.createGain();
    env(g, t, 0.0005, 0.5 * level, 0.012);
    n.connect(f).connect(g).connect(sfx);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.03);
    const og = ctx.createGain();
    env(og, t, 0.0005, 0.12 * level, 0.03);
    o.connect(og).connect(sfx);
    o.start(t);
    o.stop(t + 0.06);
  }

  function beep(t, f1, f2, level = 1) {
    [f1, f2].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      env(g, t + i * 0.09, 0.004, 0.2 * level, 0.16);
      o.connect(g).connect(sfx);
      send(g, 0.3);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.25);
    });
  }

  function whoosh(t0, t1, level = 1, up = true) {
    const n = noiseSrc(t0, t1 - t0 + 0.3, t0 * 11);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(up ? 300 : 6000, t0);
    f.frequency.exponentialRampToValueAtTime(up ? 6000 : 300, t1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.4 * level, t1 - 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.25);
    n.connect(f).connect(g).connect(sfx);
    send(g, 0.3);
  }

  function riser(t0, t1, level = 1) {
    whoosh(t0, t1, 0.8 * level, true);
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(110, t0);
    o.frequency.exponentialRampToValueAtTime(880, t1);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(400, t0);
    f.frequency.exponentialRampToValueAtTime(5000, t1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.08 * level, t1);
    g.gain.linearRampToValueAtTime(0, t1 + 0.01);
    o.connect(f).connect(g).connect(sfx);
    o.start(t0);
    o.stop(t1 + 0.05);
  }

  function impact(t, level = 1, tail = 1.6) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(28, t + tail * 0.8);
    const g = ctx.createGain();
    env(g, t, 0.003, 0.9 * level, tail);
    o.connect(g).connect(sfx);
    o.start(t);
    o.stop(t + tail + 0.1);
    const n = noiseSrc(t, 0.6, t * 17);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(5000, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.5);
    const ng = ctx.createGain();
    env(ng, t, 0.001, 0.45 * level, 0.5);
    n.connect(f).connect(ng).connect(sfx);
    send(ng, 0.8);
  }

  function tick(t, level = 1) {
    const n = noiseSrc(t, 0.01, t * 23);
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 5000;
    const g = ctx.createGain();
    env(g, t, 0.0005, 0.2 * level, 0.008);
    n.connect(f).connect(g).connect(sfx);
  }

  function keystrokes(t0, t1, seed, level = 1, minGap = 0.05, maxGap = 0.1) {
    const r = rng(seed);
    for (let t = t0; t < t1; t += minGap + r() * (maxGap - minGap)) {
      const n = noiseSrc(t, 0.03, t * 29);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1800 + r() * 2200;
      f.Q.value = 3;
      const g = ctx.createGain();
      env(g, t, 0.0008, (0.22 + r() * 0.12) * level, 0.03);
      n.connect(f).connect(g).connect(sfx);
    }
  }

  // ---------------------------------------------------------------- score

  // Scene 1 — tension (0 → 4 s, hard cut at 4 s)
  {
    // pick-up and connection tones
    click(CUES.pickup, 1.2);
    beep(0.16, 620, 830, 0.6);
    impact(CUES.crmSlam, 0.55, 0.7);
    // dissonant drone, rising filter, cut at 4 s
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0.3);
    g.gain.linearRampToValueAtTime(0.06, 1.2);
    g.gain.linearRampToValueAtTime(0.11, 3.95);
    g.gain.setValueAtTime(0, CUES.cutToSilence);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(200, 0.3);
    f.frequency.exponentialRampToValueAtTime(1600, 3.95);
    f.connect(g).connect(master);
    for (const m of [33, 40, 44.5]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = NOTE_HZ(m);
      o.connect(f);
      o.start(0.3);
      o.stop(CUES.cutToSilence);
    }
    // clock ticks and heartbeat thumps
    for (let t = 0.6; t < 3.98; t += 0.25) tick(t, t % 0.5 < 0.01 ? 1 : 0.6);
    const thump = ctx.createGain();
    thump.gain.value = 0.4;
    thump.connect(master);
    for (let t = 0.75; t < 3.9; t += 0.5) kick(t, 0.5, thump);
    // typing and deleting
    CUES.typingBursts.forEach(([a, b], i) => keystrokes(a, b, 10 + i, 0.9));
    CUES.deleteBursts.forEach(([a, b], i) => keystrokes(a, b, 20 + i, 0.7, 0.035, 0.045));
    // tension riser, cut dead at 4.0
    const n = noiseSrc(3.0, 1.0, 3);
    const rf = ctx.createBiquadFilter();
    rf.type = "bandpass";
    rf.frequency.setValueAtTime(400, 3.0);
    rf.frequency.exponentialRampToValueAtTime(7000, 3.99);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0, 3.0);
    rg.gain.linearRampToValueAtTime(0.22, 3.99);
    rg.gain.setValueAtTime(0, CUES.cutToSilence);
    n.connect(rf).connect(rg).connect(master);
  }

  // Scene 2 — red impulse, « Démarrer », the groove starts
  impact(CUES.redPulse, 0.85, 1.4);
  whoosh(CUES.redPulse - 0.05, CUES.redPulse + 0.5, 0.4, false);
  whoosh(4.45, 4.98, 0.25, true); // the cursor moves to the button
  click(CUES.startClick, 1.3);
  beep(CUES.startClick + 0.04, 880, 1320, 1);
  riser(CUES.waveOn, CUES.beatStart, 0.5);

  // Groove: 120 BPM from beatStart; breaks during the « Fin » drop and stops at 27 s
  const grooveEnd = CUES.signatureCut;
  const chord = [
    { root: 45, pad: [57, 60, 64] }, // A minor
    { root: 41, pad: [53, 57, 60] }, // F
    { root: 48, pad: [55, 60, 64] }, // C
    { root: 43, pad: [55, 59, 62] }, // G
  ];
  for (let t = CUES.beatStart, i = 0; t < grooveEnd - 0.01; t += BEAT, i++) {
    const inDrop = t >= CUES.waveOff[0] && t < CUES.transform[1];
    const full = t >= CUES.splitIn;
    if (!inDrop) {
      kick(t, i % 4 === 0 ? 1 : 0.9);
      if (full && i % 2 === 1) clap(t, 0.8);
    }
    // hats on 8ths / 16ths when full
    for (let k = 0; k < (full ? 4 : 2); k++) {
      const ht = t + k * (BEAT / (full ? 4 : 2));
      if (ht >= grooveEnd) break;
      if (!inDrop || k % 2 === 1) hat(ht, k % 2 === 1 ? 1 : 0.55, full && k === 2 && i % 8 === 7);
    }
    // bass pulses on 8ths
    const bar = Math.floor((t - CUES.beatStart) / (BEAT * 4));
    const ch = chord[bar % chord.length];
    for (let k = 0; k < 2; k++) {
      const bt = t + k * BEAT / 2;
      if (bt >= grooveEnd) break;
      bassNote(bt, ch.root - 12 + (k === 1 && i % 4 === 3 ? 12 : 0), BEAT / 2 * 0.95, full ? 1 : 0.6);
    }
  }
  // pads every bar (2 s) from the split
  for (let t = CUES.splitIn, b = 0; t < grooveEnd - 0.5; t += BEAT * 4, b++) {
    pad(t, Math.min(BEAT * 4, grooveEnd - t), chord[(b + 1) % 4].pad, 1);
  }

  // Scene 3 — whip into the split screen, light transcription ticks
  whoosh(6.78, 7.02, 0.7, true);
  impact(CUES.splitIn, 0.4, 0.5);
  CONVERSATION.forEach((line, i) => keystrokes(line.start, line.end, 40 + i, 0.25, 0.07, 0.12));

  // Scene 4 — « Fin », drop, generation, fields
  click(CUES.endClick, 1.3);
  beep(CUES.endClick + 0.03, 1320, 660, 0.9);
  riser(CUES.transform[0] - 0.2, CUES.transform[1], 0.9);
  // sparkle arpeggio during the transformation
  [69, 72, 76, 81, 84, 88, 93].forEach((m, i) => pluck(CUES.transform[0] + i * 0.1, m, 0.7, sfx, 0.25));
  impact(CUES.transform[1], 0.6, 0.9);
  CUES.fieldPops.forEach((t, i) => pluck(t, [76, 79, 83, 88][i], 1, sfx, 0.4));
  whoosh(17.6, 18.0, 0.8, true);
  impact(CUES.zoomToNote, 0.7, 1.0);

  // Scene 5 — note written row by row, copy
  {
    const [a, b] = CUES.noteTyping;
    const per = (b - a) / NOTE.rows.length;
    NOTE.rows.forEach((_, i) => {
      tick(a + i * per, 0.8);
      pluck(a + i * per, 88 + (i % 3) * 2, 0.18, sfx, 0.12);
    });
  }
  click(CUES.copyClick, 1.3);
  pluck(CUES.copied, 81, 0.9, sfx, 0.5);
  pluck(CUES.copied + 0.09, 88, 0.9, sfx, 0.6);

  // Scene 6 — validation, accents
  whoosh(23.9, 24.2, 0.5, false);
  [72, 76, 79, 84].forEach((m, i) => pluck(CUES.validate + i * 0.07, m, 0.8, sfx, 0.7));
  impact(CUES.s6bIn, 0.45, 0.6);
  riser(CUES.riserToEnd[0], CUES.riserToEnd[1], 1.1);

  // Scene 7 — cut, line drawing shimmer, final impact, signature hits, long tail
  {
    const n = noiseSrc(CUES.lineDraw[0], CUES.lineDraw[1] - CUES.lineDraw[0], 77);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 4;
    f.frequency.setValueAtTime(800, CUES.lineDraw[0]);
    f.frequency.exponentialRampToValueAtTime(9000, CUES.lineDraw[1]);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, CUES.lineDraw[0]);
    g.gain.linearRampToValueAtTime(0.12, CUES.lineDraw[1] - 0.1);
    g.gain.linearRampToValueAtTime(0, CUES.lineDraw[1]);
    n.connect(f).connect(g).connect(sfx);
    send(g, 0.6);
  }
  impact(CUES.logoImpact, 1.25, 2.2);
  kick(CUES.logoImpact, 1.2, sfx);
  pad(CUES.logoImpact, VIDEO.duration - CUES.logoImpact - 0.05, [57, 64, 69, 72], 0.8, sfx);
  pluck(CUES.sign1In, 69, 0.7, sfx, 0.8);
  pluck(CUES.sign2In, 76, 0.8, sfx, 1.0);

  // master fade on the very last frames (no click at the end of the file)
  master.gain.setValueAtTime(0.8, VIDEO.duration - 0.6);
  master.gain.linearRampToValueAtTime(0, VIDEO.duration - 0.01);

  return ctx.startRendering();
}

/** AudioBuffer → 32-bit float stereo WAV (base64), for FFmpeg. */
export function toWavBase64(buffer) {
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const bytes = 44 + n * ch * 4;
  const view = new DataView(new ArrayBuffer(bytes));
  const str = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); // IEEE float
  view.setUint16(22, ch, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * ch * 4, true);
  view.setUint16(32, ch * 4, true);
  view.setUint16(34, 32, true);
  str(36, "data");
  view.setUint32(40, n * ch * 4, true);
  const data = [...Array(ch).keys()].map((c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      view.setFloat32(o, data[c][i], true);
      o += 4;
    }
  }
  const u8 = new Uint8Array(view.buffer);
  let bin = "";
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
