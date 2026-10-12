let counter = 0;

/** Identifiant unique local (suffisant pour un prototype mono-poste). */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function round(value: number, step = 0.01): number {
  return Math.round(value / step) * step;
}

/** Arrondi à 2 décimales sans artefacts flottants. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
