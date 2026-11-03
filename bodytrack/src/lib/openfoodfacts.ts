import type { Food } from './types';
import { nowISO, uid } from './format';

/**
 * Intégration Open Food Facts (base collaborative, licence ODbL).
 * Règle stricte : on n'invente JAMAIS une valeur nutritionnelle. Si une valeur manque
 * pour 100 g / 100 ml, le produit est signalé « incomplet » et l'utilisateur complète lui-même.
 * Seule conversion appliquée : kJ → kcal (÷ 4,184) quand les kcal ne sont pas fournies.
 */
const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_fr,brands,nutriments,serving_size,quantity';

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string;
  serving_size?: string;
  quantity?: string;
  nutriments?: Record<string, number | string | undefined>;
}

export interface OffResult {
  food: Food;
  complete: boolean;
  missing: string[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function mapProduct(p: OffProduct): OffResult | null {
  const name = (p.product_name_fr || p.product_name || '').trim();
  if (!name) return null;
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === null) {
    const kj = num(n['energy-kj_100g']) ?? (n['energy_unit'] === 'kJ' ? num(n['energy_100g']) : null);
    if (kj !== null) kcal = Math.round((kj / 4.184) * 10) / 10;
  }
  const protein = num(n['proteins_100g']);
  const carbs = num(n['carbohydrates_100g']);
  const fat = num(n['fat_100g']);
  const missing = [kcal === null && 'calories', protein === null && 'protéines', carbs === null && 'glucides', fat === null && 'lipides'].filter(Boolean) as string[];
  const isLiquid = /\b(ml|cl|l)\b/i.test(p.quantity ?? '') && !/\bg\b/i.test(p.quantity ?? '');
  const serving = num((p.serving_size ?? '').match(/([\d.,]+)\s*(g|ml)/i)?.[1]);
  return {
    complete: missing.length === 0,
    missing,
    food: {
      id: `off-${p.code ?? uid()}`,
      name,
      brand: (p.brands ?? '').split(',')[0].trim(),
      unit: isLiquid ? 'ml' : 'g',
      kcal100: kcal ?? 0,
      protein100: protein ?? 0,
      carbs100: carbs ?? 0,
      fat100: fat ?? 0,
      servingSize: serving,
      servingLabel: p.serving_size ?? '',
      category: 'Open Food Facts',
      source: 'openfoodfacts',
      barcode: p.code ?? null,
      updatedAt: nowISO(),
    },
  };
}

async function get(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Open Food Facts a répondu ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupBarcode(code: string): Promise<OffResult | null> {
  const clean = code.replace(/\D/g, '');
  if (clean.length < 6) throw new Error('Code-barres invalide');
  const json = (await get(`${BASE}/api/v2/product/${clean}.json?fields=${FIELDS}`)) as { status?: number; product?: OffProduct };
  if (json.status !== 1 || !json.product) return null;
  return mapProduct({ ...json.product, code: clean });
}

export async function searchProducts(q: string): Promise<OffResult[]> {
  const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}&lc=fr`;
  const json = (await get(url)) as { products?: OffProduct[] };
  return (json.products ?? []).map(mapProduct).filter((x): x is OffResult => !!x);
}
