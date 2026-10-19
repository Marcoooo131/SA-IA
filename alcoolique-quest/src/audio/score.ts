// Partition et conception sonore, calées sur la timeline.
// Progression : calme mystérieux → découverte épique → montée en puissance → explosion d'action
// → silence et tension horrifique → impact final.
import { AudioEngine, chord, hz, type Cue } from './engine';
import { HITS, LINES } from '../core/timeline';

export function buildScore(a: AudioEngine): Cue[] {
  const cues: Cue[] = [];
  const M = (t: number, dur: number, fn: (w: number) => void) => cues.push({ t, dur, fn, music: true });
  const S = (t: number, dur: number, fn: (w: number) => void) => cues.push({ t, dur, fn });

  // ───────────── SCÈNE 1 — vent, éveil, envol
  S(0, 12.5, (w) => a.wind(w, 12.5, 0.32, 1, 450, 1.2));
  S(2, 10, (w) => a.wind(w, 10, 0.12, 2, 1600, 0.8));
  M(1.5, 11, (w) => a.pad(chord('D1 A1 D2'), w, 11, { vol: 0.16, cutoff: 380, attack: 5 }));
  M(5.2, 7, (w) => a.pad([hz('A4')], w, 7, { vol: 0.035, cutoff: 3000, attack: 3 }));
  M(7.4, 5, (w) => a.choir(chord('D3 F3 A3'), w, 5, 'u', 0.09, { attack: 1.5 }));
  S(8.25, 1, (w) => a.screech(w, 0.14));
  S(8.85, 1, (w) => a.flap(w, 0.35));
  S(9.15, 1, (w) => a.flap(w, 0.3));
  M(9.0, 3, (w) => a.riser(w, 3, 0.12));
  for (let k = 0; k < 3; k++) S(9.95 + k * 0.42, 0.6, (w) => a.flap(w, 0.4));
  S(10.2, 2, (w) => a.whoosh(w, 1.8, 0.25, 250, 1800));

  // ───────────── SCÈNE 2 — la mer, les nuages, les montagnes
  S(11.8, 10, (w) => a.surf(w, 10, 0.38));
  S(12, 18, (w) => a.wind(w, 18, 0.2, 5, 800, 1));
  S(13.4, 1, (w) => a.gull(w, 0.05));
  S(15.6, 1, (w) => a.gull(w, 0.035));
  S(16.8, 1, (w) => a.screech(w, 0.06, true));
  // thème héroïque (cors) sur nappe de cordes
  const prog2: [number, string, number][] = [
    [12, 'D2 A2 D3 F3', 3], [15, 'Bb1 F2 Bb2 D3', 3], [18, 'F2 C3 F3 A3', 3], [21, 'C2 G2 C3 E3', 3],
    [24, 'D2 A2 D3 F3 A3', 2], [26, 'Bb1 F2 Bb2 D3 F3', 2], [28, 'C2 G2 C3 E3 G3', 2],
  ];
  for (const [t, c, d] of prog2) M(t, d + 1.5, (w) => a.pad(chord(c), w, d + 0.3, { vol: t < 24 ? 0.12 : 0.17, cutoff: t < 18 ? 900 : 1800, attack: t < 24 ? 1.2 : 0.4 }));
  const theme: [number, string, number][] = [
    [12.6, 'D4', 1.4], [14.0, 'A4', 1.0], [15.0, 'G4', 0.5], [15.5, 'F4', 0.5], [16.0, 'E4', 0.8], [16.8, 'F4', 1.2],
    [18.2, 'C4', 0.6], [18.8, 'F4', 0.6], [19.4, 'A4', 1.2], [20.6, 'C5', 0.9], [21.5, 'Bb4', 0.5], [22.0, 'A4', 0.5], [22.5, 'G4', 1.4],
  ];
  for (const [t, n, d] of theme) M(t, d + 0.6, (w) => a.brass([hz(n), hz(n) / 2], w, d, 0.06, 0.6));
  // ostinato de cordes qui naît pendant la remontée
  for (let t = 18; t < 30; t += 0.25) {
    const bar = Math.floor((t - 18) / 2) % 4;
    const notes = [['D3', 'A3', 'D4', 'A3'], ['Bb2', 'F3', 'Bb3', 'F3'], ['C3', 'G3', 'C4', 'G3'], ['A2', 'E3', 'A3', 'E3']][bar];
    const n = notes[Math.round((t - 18) / 0.25) % 4];
    M(t, 0.3, (w) => a.pluck(hz(n), w, t < 24 ? 0.03 : 0.05));
  }
  S(18, 3, (w) => a.whoosh(w, 3, 0.3, 200, 1400));
  S(20.8, 3.4, (w) => a.wind(w, 3.4, 0.5, 9, 300, 1.6));
  M(20.5, 3.5, (w) => a.cymbal(w, 0.12, 3.5, true));
  S(23.8, 1.5, (w) => a.whoosh(w, 1.5, 0.35, 300, 3000));
  M(24, 3, (w) => a.drum(w, 0.7, 0.8, 0.6));
  M(24, 4, (w) => a.cymbal(w, 0.18, 4));
  M(24, 6, (w) => a.choir(chord('D3 A3 D4 F4 A4'), w, 5.5, 'a', 0.13, { attack: 0.4 }));
  M(24.4, 5.5, (w) => a.brass(chord('D3 A3 D4'), w, 1.6, 0.1));
  M(26, 4, (w) => a.brass(chord('Bb2 F3 Bb3 D4'), w, 1.8, 0.1));
  M(28, 3, (w) => a.brass(chord('C3 G3 C4 E4'), w, 1.6, 0.11));
  for (const t of [26, 27, 28, 28.5, 29, 29.25, 29.5]) M(t, 1, (w) => a.drum(w, 0.45, 1, 0.4));

  // ───────────── SCÈNE 3 — la plaine oubliée (mystère)
  S(29.8, 12.5, (w) => a.wind(w, 12.5, 0.22, 13, 650, 1.1));
  const prog3: [number, string][] = [[30, 'G1 D2 G2 Bb2'], [33, 'D2 A2 D3 F3'], [36, 'Eb2 Bb2 Eb3 G3'], [39, 'D2 A2 D3 F3']];
  for (const [t, c] of prog3) M(t, 4.5, (w) => a.pad(chord(c), w, 3.2, { vol: 0.1, cutoff: 700, attack: 1 }));
  const solo: [number, string, number][] = [[30.6, 'D4', 1.6], [32.2, 'Eb4', 0.8], [33.0, 'D4', 1.2], [34.4, 'C4', 0.8], [35.2, 'Bb3', 1.6], [36.9, 'A3', 2.2], [39.3, 'D4', 2.4]];
  for (const [t, n, d] of solo) M(t, d + 1.4, (w) => a.choir([hz(n)], w, d, 'o', 0.06, { attack: 0.5, release: 1.2 }));
  for (let t = 30.5; t < 42; t += 2) M(t, 1, (w) => a.drum(w, 0.22, 0.6, 0.6));
  S(36.2, 5, (w) => a.thunder(w, 0.18));
  M(37.6, 4, (w) => a.bell(w, hz('D3'), 0.04, 4));
  S(39.2, 1.2, (w) => a.whoosh(w, 1.1, 0.2, 400, 2000));
  M(40.5, 1.5, (w) => a.riser(w, 1.5, 0.12));

  // ───────────── SCÈNE 4 — la grande cité (procession, montée en puissance)
  S(42, 18, (w) => a.crowd(w, 18, 0.07));
  S(42, 18, (w) => a.wind(w, 18, 0.1, 21, 900, 0.6));
  for (const t of [42.2, 46.0, 50.2, 54.2]) M(t, 6, (w) => a.bell(w, hz('A2'), 0.09, 6));
  for (const t of [47.1, 47.7, 48.6, 49.2]) S(t, 1.5, (w) => a.clang(w, 0.08, 900, 0.8));
  for (const t of [43.6, 46.2, 50.6, 52.4]) S(t, 1.2, (w) => a.whoosh(w, 1.1, 0.25, 300, 2400));
  const prog4: [number, string][] = [[42, 'D2 A2 D3 F3'], [44.4, 'Bb1 F2 Bb2 D3'], [46.8, 'G1 D2 G2 Bb2'], [49.2, 'A1 E2 A2 C#3'], [51.6, 'D2 A2 D3 F3'], [54, 'Bb1 F2 Bb2 D3'], [56.4, 'C2 G2 C3 E3'], [58.2, 'A1 E2 A2 C#3 E3']];
  for (const [t, c] of prog4) M(t, 3.6, (w) => a.pad(chord(c), w, 2.4, { vol: 0.13, cutoff: 1300, attack: 0.3 }));
  for (const [t, c] of prog4.slice(2)) M(t, 3, (w) => a.brass(chord(c).map((f) => f * 2), w, 1.9, 0.09));
  for (let t = 42; t < 60; t += 0.6) {
    const beat = Math.round((t - 42) / 0.6) % 4;
    if (beat === 0 || beat === 2 || (t > 51 && beat === 3)) M(t, 1, (w) => a.drum(w, t < 51 ? 0.35 : 0.5, beat === 0 ? 0.8 : 1));
  }
  M(51.6, 8, (w) => a.choir(chord('D3 A3 D4 F4'), w, 8, 'a', 0.1, { attack: 2 }));
  for (let t = 54; t < 60; t += 0.3) M(t, 0.4, (w) => a.pluck(hz(['D3', 'F3', 'A3', 'D4'][Math.round((t - 54) / 0.3) % 4]), w, 0.04));
  M(57.5, 2.5, (w) => a.riser(w, 2.5, 0.2));
  M(57.8, 2.3, (w) => a.cymbal(w, 0.2, 2.2, true));
  for (const t of [59.1, 59.4, 59.55, 59.7, 59.85]) M(t, 1, (w) => a.drum(w, 0.55, 1.1));

  // ───────────── SCÈNE 5 — les combats (120 BPM, percussions synchronisées aux impacts)
  const B = 0.5;
  const riff = ['D3', 'D3', 'F3', 'D3', 'G3', 'D3', 'F3', 'E3'];
  const roots = ['D', 'D', 'Bb', 'Bb', 'G', 'G', 'A', 'A'];
  for (let t = 60; t < 81.8; t += B / 2) {
    const i = Math.round((t - 60) / (B / 2));
    const bar = Math.floor((t - 60) / 2) % 8;
    const shift = { D: 0, Bb: -4, G: -7, A: -5 }[roots[bar] as 'D' | 'Bb' | 'G' | 'A'];
    const f = hz(riff[i % 8]) * Math.pow(2, shift / 12);
    if (!(t > 76.8 && t < 78)) M(t, 0.3, (w) => a.pluck(f, w, 0.05, 0.13));
    if (i % 4 === 0 && !(t > 75 && t < 78)) M(t, 1, (w) => a.drum(w, 0.5, 0.9));
    if (i % 8 === 6 && !(t > 75 && t < 78)) M(t, 1, (w) => a.drum(w, 0.35, 1.3));
  }
  const chords5: [number, string][] = [[60, 'D3 A3 D4 F4'], [64, 'Bb2 F3 Bb3 D4'], [68, 'G2 D3 G3 Bb3'], [72, 'A2 E3 A3 C#4'], [76, 'D3 A3 D4 F4'], [78, 'Bb2 F3 Bb3 D4'], [80, 'A2 E3 A3 C#4 E4']];
  for (const [t, c] of chords5) {
    M(t, 4.5, (w) => a.choir(chord(c), w, t >= 78 ? 1.8 : 3.6, 'a', 0.12, { attack: 0.2 }));
    M(t, 4, (w) => a.brass(chord(c), w, t >= 78 ? 1.8 : 1.2, 0.1));
    M(t, 4, (w) => a.pad(chord(c).map((f) => f / 2), w, t >= 78 ? 1.8 : 3.6, { vol: 0.12, cutoff: 1600, attack: 0.1 }));
  }
  // bruitages synchronisés
  S(60.6, 1.2, (w) => a.riser(w, 0.9, 0.12));
  S(60.8, 1.2, (w) => a.bell(w, hz('A5'), 0.03, 1.2));
  S(HITS.fireballLaunch, 1, (w) => a.whoosh(w, 0.9, 0.45, 200, 1600));
  S(HITS.fireballLaunch, 1, (w) => a.crackle(w, 0.9, 0.12));
  S(HITS.fireballImpact, 4, (w) => a.explosion(w, 0.9));
  M(HITS.fireballImpact, 2, (w) => a.cymbal(w, 0.18, 2));
  S(HITS.parry, 1.4, (w) => a.clang(w, 0.35, 610));
  S(HITS.dodge, 0.6, (w) => a.whoosh(w, 0.45, 0.3, 500, 3000));
  S(HITS.spin - 0.2, 1.2, (w) => a.whoosh(w, 1.1, 0.4, 300, 4000));
  S(HITS.spin + 0.35, 1.4, (w) => a.clang(w, 0.25, 480));
  M(HITS.spin + 0.35, 3, (w) => a.boom(w, 0.4, 1.5));
  S(HITS.runeSlam, 3, (w) => a.boom(w, 0.6, 2));
  S(HITS.runeSlam, 1.5, (w) => a.crackle(w, 1.4, 0.15, 800));
  S(HITS.portal - 0.6, 1, (w) => a.riser(w, 0.7, 0.2));
  S(HITS.portal, 2, (w) => a.whoosh(w, 1.5, 0.3, 100, 900));
  S(HITS.roar, 2, (w) => a.roar(w, 1.6, 0.55, 1.2));
  S(HITS.creatureLeap, 0.8, (w) => a.whoosh(w, 0.6, 0.35, 300, 2400));
  S(HITS.berserkCharge, 1.6, (w) => a.roar(w, 1.0, 0.25, 2.2));
  for (let k = 0; k < 4; k++) S(HITS.berserkCharge + 0.1 + k * 0.24, 0.5, (w) => a.drum(w, 0.25, 1.6, 0.1));
  S(HITS.weaponBreak, 1.5, (w) => a.clang(w, 0.45, 380, 1));
  S(HITS.weaponBreak, 1, (w) => a.crackle(w, 0.4, 0.3, 2000, 300));
  S(HITS.grabMaul, 1, (w) => a.boom(w, 0.3, 0.6));
  S(HITS.maulSmash, 3, (w) => a.boom(w, 0.9, 2.5));
  S(HITS.maulSmash, 1, (w) => a.crackle(w, 0.8, 0.25, 600));
  S(HITS.arrowRelease, 1, (w) => a.twang(w, 0.35));
  S(HITS.arrowRelease + 0.05, 2.4, (w) => a.whoosh(w, 2.3, 0.22, 150, 600));
  M(HITS.arrowRelease + 0.2, 2, (w) => a.choir(chord('A3 E4'), w, 1.8, 'u', 0.06, { attack: 0.6 }));
  S(HITS.arrowImpact, 1, (w) => a.clang(w, 0.2, 260, 0.4));
  M(HITS.arrowImpact, 2, (w) => a.drum(w, 0.8, 0.7));
  S(HITS.monsterStep1, 3, (w) => a.boom(w, 0.8, 2.2));
  S(HITS.monsterStep2, 3, (w) => a.boom(w, 0.9, 2.2));
  S(HITS.monsterRoar, 2.2, (w) => a.roar(w, 1.9, 0.75, 0.5));
  S(78.2, 3.6, (w) => a.rumble(w, 3.6, 0.35, 'hall'));
  M(80.9, 1, (w) => a.drum(w, 0.8, 0.7));
  M(81.2, 0.6, (w) => a.cymbal(w, 0.2, 0.6, true));

  // ───────────── SCÈNE 6 — silence, la cathédrale, la relique
  S(82.6, 25.4, (w) => a.wind(w, 25.4, 0.12, 41, 300, 0.7));
  for (const t of [84.1, 86.7, 89.9, 93.3, 96.2, 101.9, 105.7]) S(t, 1, (w) => a.drip(w, 0.04));
  M(84.5, 23, (w) => a.pad(chord('D1 A1'), w, 23, { vol: 0.07, cutoff: 200, attack: 6, space: 'cathedral' }));
  for (let t = 88; t < 91.4; t += 1.15) S(t, 1, (w) => a.heartbeat(w, 0.3));
  S(88.2, 3.2, (w) => a.whoosh(w, 3.2, 0.18, 150, 700));
  S(88.0, 3.5, (w) => a.crackle(w, 3.5, 0.03, 3000, 40, 'cathedral'));
  // la relique : chœur « céleste » en ré MAJEUR, cloche, scintillement — un sérieux absolu
  M(HITS.bottleReveal, 5, (w) => a.choir(chord('D4 F#4 A4 D5'), w, 3.4, 'a', 0.1, { attack: 0.25, space: 'cathedral' }));
  M(HITS.bottleReveal, 6, (w) => a.bell(w, hz('D5'), 0.06, 5, 'cathedral'));
  M(HITS.bottleReveal + 0.05, 4, (w) => a.pad([hz('A5'), hz('D6')], w, 3, { vol: 0.03, cutoff: 6000, attack: 0.5, space: 'cathedral' }));
  for (const t of [95, 96.2]) S(t, 1, (w) => a.heartbeat(w, 0.4));
  // elle saisit la bouteille… le plastique crépite, amplifié par la nef
  S(HITS.grab - 0.05, 0.9, (w) => a.crackle(w, 0.8, 0.5, 2500, 90, 'cathedral'));
  S(HITS.grab, 4, (w) => a.rumble(w, 3.5, 0.6));
  S(HITS.wingsBurst, 4, (w) => a.boom(w, 0.9, 3.5, 0.9, 'cathedral'));
  S(HITS.wingsBurst - 0.1, 1.5, (w) => a.flap(w, 0.9, true));
  M(HITS.wingsBurst, 5, (w) => a.choir(chord('D2 Eb2 A2'), w, 4, 'o', 0.1, { attack: 0.1, space: 'cathedral' }));
  M(HITS.wingsBurst, 5, (w) => a.pad(chord('D1 Eb1'), w, 4.5, { vol: 0.14, cutoff: 300, attack: 0.1, space: 'cathedral' }));
  for (const l of LINES) {
    S(l.start, l.end - l.start, (w) => a.voice(l.id, l.text, w));
    S(l.start, l.end - l.start, (w) => a.whisper(w, l.end - l.start, 0.05));
  }
  S(HITS.bottleRaise, 3.6, (w) => a.rumble(w, 3.5, 0.45));
  M(HITS.bottleRaise, 3.6, (w) => a.choir(chord('D2 A2 Eb3'), w, 3.3, 'u', 0.07, { attack: 2.5, space: 'cathedral' }));
  S(HITS.blackLightning, 4, (w) => a.thunder(w, 1, 'cathedral'));

  // ───────────── SCÈNE 7 — le titre
  S(HITS.titleBoom, 6, (w) => a.boom(w, 1, 5, 0.8));
  M(HITS.titleBoom, 9, (w) => a.gong(w, 0.3, 9));
  M(HITS.titleBoom, 10, (w) => a.choir(chord('D3 A3 D4 F4 A4'), w, 7.5, 'a', 0.14, { attack: 0.15, release: 3 }));
  M(HITS.titleBoom, 10, (w) => a.brass(chord('D2 A2 D3 F3'), w, 6, 0.12, 0.8));
  M(HITS.titleBoom, 10, (w) => a.pad(chord('D1 A1 D2'), w, 8, { vol: 0.16, cutoff: 500, attack: 0.1, release: 3 }));
  M(HITS.subtitleIn, 5, (w) => a.choir(chord('F4 A4 D5'), w, 4, 'o', 0.06, { attack: 1.2 }));
  S(HITS.silhouette, 3, (w) => a.whisper(w, 1.6, 0.03));
  M(HITS.bottleGlint, 4, (w) => a.bell(w, hz('A6'), 0.035, 3.5));
  M(HITS.bottleGlint + 0.12, 4, (w) => a.bell(w, hz('D7'), 0.02, 3));
  return cues;
}
