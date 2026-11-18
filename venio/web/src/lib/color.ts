// Couleurs choisies par les entreprises pour leurs pages de réservation : on garantit toujours
// un texte lisible (WCAG AA, 4,5:1), quelle que soit la couleur saisie.

const INK = "#14213d";
const WHITE = "#ffffff";
export const MIN_CONTRAST = 4.5;

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Couleur de fond utilisable + couleur de texte associée.
 * Si ni le blanc ni l'encre n'atteignent 4,5:1 (teintes moyennes), la couleur est assombrie
 * progressivement jusqu'à ce que le texte blanc soit lisible : la teinte choisie est conservée.
 */
export function brandPair(input: string | null | undefined, fallback = INK): { bg: string; fg: string } {
  const base = parseHex(input ?? "") ? toHex(parseHex(input!)!) : fallback;
  if (contrast(base, WHITE) >= MIN_CONTRAST) return { bg: base, fg: WHITE };
  if (contrast(base, INK) >= MIN_CONTRAST) return { bg: base, fg: INK };
  let rgb = parseHex(base)!;
  for (let i = 0; i < 40 && contrast(toHex(rgb), WHITE) < MIN_CONTRAST; i++) {
    rgb = rgb.map((v) => v * 0.94) as [number, number, number];
  }
  return { bg: toHex(rgb), fg: WHITE };
}

/** Variables CSS d'une page de réservation. */
export function brandStyle(primary?: string | null, accent?: string | null): Record<string, string> {
  const p = brandPair(primary);
  return { "--brand": p.bg, "--brand-fg": p.fg, "--brand-accent": parseHex(accent ?? "") ? toHex(parseHex(accent!)!) : "#f28c28" };
}
