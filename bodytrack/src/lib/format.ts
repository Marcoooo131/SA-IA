/** Formatage des nombres en français, avec gestion des valeurs manquantes */
export function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Arrondi « intelligent » : 1 décimale si nécessaire */
export function fmtSmart(n: number | null | undefined, maxDigits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('fr-FR', { maximumFractionDigits: maxDigits });
}

export function fmtSigned(n: number | null | undefined, digits = 1, unit = ''): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const r = Number(n.toFixed(digits));
  const s = r > 0 ? '+' : r < 0 ? '−' : '±';
  return `${s}${Math.abs(r).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit ? ` ${unit}` : ''}`;
}

export function fmtKg(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : `${fmtSmart(n, digits)} kg`;
}

export function fmtVolume(kg: number): string {
  if (kg >= 10000) return `${fmtSmart(kg / 1000, 1)} t`;
  return `${fmt(kg)} kg`;
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Arrondi au multiple le plus proche (ex. 2,5 kg) */
export function roundTo(n: number, step: number): number {
  if (step <= 0) return n;
  return round(Math.round(n / step) * step, 3);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function pct(value: number, target: number): number {
  if (!target || !Number.isFinite(value)) return 0;
  return (value / target) * 100;
}

/** Lecture d'un nombre saisi (virgule ou point), null si vide ou invalide */
export function parseNum(input: string): number | null {
  const s = input.replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Repli (anciens navigateurs) : UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function mean(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Régression linéaire simple : pente et ordonnée à l'origine */
export function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  let ssTot = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
    ssTot += (p.y - my) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  const ssRes = points.reduce((a, p) => a + (p.y - (intercept + slope * p.x)) ** 2, 0);
  return { slope, intercept, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot };
}
