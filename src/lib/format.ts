/**
 * Formatage manuel (sans Intl) : les espaces insécables fines produites par Intl
 * ne sont pas supportées par les polices standard du PDF.
 */
export function formatNumber(value: number, decimals = 2): string {
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negative ? '-' : ''}${grouped}${decPart ? `,${decPart}` : ''}`;
}

export function formatEuro(value: number | null | undefined, opts: { decimals?: number } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'À confirmer';
  const decimals = opts.decimals ?? (Number.isInteger(value) ? 0 : 2);
  return `${formatNumber(value, decimals)} €`;
}

export function formatMonthly(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'À confirmer';
  return `${formatEuro(value, { decimals: Number.isInteger(value) ? 0 : 2 })}/mois`;
}

export function formatMeters(value: number, decimals = 2): string {
  return `${formatNumber(value, decimals)} m`;
}

export function formatArea(value: number): string {
  return `${formatNumber(value, 1)} m²`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convertit une saisie libre en prix : « 149 », « 149,00 € », « 1 234,50 », « 37.9 ».
 * Retourne `undefined` si la valeur est vide, `NaN` si elle est invalide.
 */
export function parsePrice(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : Number.NaN;
  const str = String(raw)
    .replace(/[\s  ]/g, '')
    .replace(/€|eur(os)?/gi, '')
    .replace(/\/mois|par mois|mois/gi, '')
    .trim();
  if (str === '' || str === '-') return undefined;
  let normalized = str;
  if (normalized.includes(',') && normalized.includes('.')) {
    // « 1.234,50 » -> séparateur décimal = virgule
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = normalized.replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}
