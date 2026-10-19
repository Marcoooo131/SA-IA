// Pure time helpers: everything is a function of t (seconds). No timer, no Date, no Math.random:
// the same t always gives the same image, whatever the rendering order.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;

/** Progress 0 → 1 of t between a and b (clamped). */
export const seg = (t, a, b) => clamp((t - a) / (b - a));

/** 0 → 1 → 0: in over [a, a+fi], out over [b-fo, b]. */
export const window01 = (t, a, b, fi = 0.25, fo = 0.25) => Math.min(seg(t, a, a + fi), 1 - seg(t, b - fo, b));

export const ease = {
  linear: (x) => x,
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - (1 - x) ** 3,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  outQuint: (x) => 1 - (1 - x) ** 5,
  inQuint: (x) => x ** 5,
  outExpo: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  inOutExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2),
  outBack: (x, s = 1.70158) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2,
  outElastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

/** Deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth deterministic noise in [-1, 1] (sum of sines, enough for waveforms and jitter). */
export function wave(t, seed = 0) {
  return (
    Math.sin(t * 2.1 + seed * 1.3) * 0.5 +
    Math.sin(t * 5.7 + seed * 2.7) * 0.3 +
    Math.sin(t * 13.3 + seed * 4.1) * 0.2
  );
}

/** Index of the current scene and local progress. */
export function sceneAt(scenes, t) {
  const i = Math.max(0, scenes.findIndex((s) => t >= s.start && t < s.end));
  const s = scenes[i === -1 ? scenes.length - 1 : i];
  return { ...s, local: t - s.start, k: seg(t, s.start, s.end) };
}
