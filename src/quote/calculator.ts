import type { Catalog, Discount, Pack, Product, ProductCategory, QuoteDraft } from '@/domain/types';

/**
 * Calculateur de devis centralisé.
 * Principes :
 *  - le prix d'un pack est un FORFAIT (jamais la somme des prix unitaires) ;
 *  - un équipement inclus dans le forfait n'est jamais facturé une seconde fois ;
 *  - frais initiaux et coûts mensuels sont toujours séparés ;
 *  - un prix inconnu n'est jamais inventé : la ligne est marquée « à confirmer »
 *    et exclue des totaux (signalé par `unpriced`).
 * Les calculs sont faits en centimes pour éviter les erreurs d'arrondi.
 */

const toCents = (v: number) => Math.round(v * 100);
const fromCents = (c: number) => c / 100;

export interface QuoteLine {
  productId: string;
  reference: string;
  name: string;
  category: ProductCategory;
  /** Quantité nécessaire (plan + ajustements). */
  requested: number;
  /** Quantité couverte par le forfait. */
  included: number;
  /** Quantité supplémentaire (hors forfait). */
  extra: number;
  /** Quantité supplémentaire couverte par un lot (ex. pack périmétrique). */
  bundled: number;
  unitInitial: number | null;
  unitMonthly: number | null;
  /** Montants des unités supplémentaires facturées à l'unité. */
  extraInitial: number | null;
  extraMonthly: number | null;
  priceKnown: boolean;
}

export interface BundleLine {
  productId: string;
  reference: string;
  name: string;
  count: number;
  size: number;
  covers: number;
  coveredProductId: string;
  unitInitial: number;
  unitMonthly: number;
  initial: number;
  monthly: number;
  /** Économie par rapport à l'achat unitaire. */
  savingInitial: number;
  savingMonthly: number;
}

export interface AppliedDiscount {
  id: string;
  label: string;
  target: Discount['target'];
  amount: number;
}

export interface QuoteResult {
  pack: (Pick<Pack, 'id' | 'name' | 'initial' | 'monthly'> & { items: { productId: string; name: string; quantity: number; used: number }[] }) | null;
  lines: QuoteLine[];
  bundles: BundleLine[];
  /** Éléments du forfait non positionnés sur le plan (fournis quand même). */
  includedUnused: { productId: string; name: string; quantity: number }[];
  unpriced: { productId: string; name: string; quantity: number }[];
  extras: { initial: number; monthly: number };
  installation: number | null;
  discounts: AppliedDiscount[];
  totals: {
    initialBeforeDiscount: number;
    initialDiscount: number;
    initial: number;
    monthlyBeforeDiscount: number;
    monthlyDiscount: number;
    monthly: number;
  };
  vat: { basis: Catalog['settings']['priceBasis']; rate: number | null; initialTTC: number | null; monthlyTTC: number | null; initialVatIncluded: number | null; monthlyVatIncluded: number | null };
  hasUnpricedItems: boolean;
  warnings: string[];
  equipmentCount: number;
}

export function requestedQuantities(bom: Map<string, number>, draft: Pick<QuoteDraft, 'adjustments'>): Map<string, number> {
  const out = new Map(bom);
  for (const adj of draft.adjustments) {
    out.set(adj.productId, Math.max(0, (out.get(adj.productId) ?? 0) + adj.delta));
  }
  for (const [k, v] of out) if (v <= 0) out.delete(k);
  return out;
}

function bestBundle(n: number, size: number, unitI: number, unitM: number, bundleI: number, bundleM: number) {
  // centimes
  const baseI = n * unitI;
  const baseM = n * unitM;
  let best = { k: 0, initial: baseI, monthly: baseM };
  const maxK = Math.ceil(n / size);
  for (let k = 1; k <= maxK; k++) {
    const rem = Math.max(0, n - k * size);
    const i = k * bundleI + rem * unitI;
    const m = k * bundleM + rem * unitM;
    if (m > baseM) continue; // jamais plus cher au mois
    if (i < best.initial || (i === best.initial && m < best.monthly)) best = { k, initial: i, monthly: m };
  }
  return best;
}

export function computeQuote(bom: Map<string, number>, draft: QuoteDraft, catalog: Catalog): QuoteResult {
  const warnings: string[] = [];
  const products = new Map(catalog.products.map((p) => [p.id, p]));
  const requested = requestedQuantities(bom, draft);
  const pack = draft.packId ? catalog.packs.find((p) => p.id === draft.packId) ?? null : null;
  if (draft.packId && !pack) warnings.push('Le forfait sélectionné n’existe plus dans le catalogue.');
  if (pack && !pack.active) warnings.push(`Le forfait « ${pack.name} » est désactivé dans le catalogue.`);

  const includedMap = new Map<string, number>();
  for (const item of pack?.items ?? []) {
    includedMap.set(item.productId, (includedMap.get(item.productId) ?? 0) + item.quantity);
    const p = products.get(item.productId);
    if (!p) warnings.push(`Le forfait référence un produit absent du catalogue (${item.productId}).`);
  }

  const lines: QuoteLine[] = [];
  const unpriced: QuoteResult['unpriced'] = [];
  for (const [productId, qty] of requested) {
    const p = products.get(productId);
    if (!p) {
      warnings.push(`Produit inconnu ignoré (${productId}).`);
      continue;
    }
    if (!p.active) warnings.push(`« ${p.name} » est désactivé dans le catalogue : prix à confirmer.`);
    const included = Math.min(qty, includedMap.get(productId) ?? 0);
    const extra = qty - included;
    const priceKnown = p.active && p.priceInitial !== null && p.monthly !== null && p.billing !== 'sur_devis';
    lines.push({
      productId,
      reference: p.reference,
      name: p.name,
      category: p.category,
      requested: qty,
      included,
      extra,
      bundled: 0,
      unitInitial: p.priceInitial,
      unitMonthly: p.monthly,
      extraInitial: priceKnown ? fromCents(extra * toCents(p.priceInitial!)) : null,
      extraMonthly: priceKnown ? fromCents(extra * toCents(p.monthly!)) : null,
      priceKnown,
    });
    if (extra > 0 && !priceKnown) unpriced.push({ productId, name: p.name, quantity: extra });
  }

  // Regroupement en lots (ex. pack périmétrique) lorsque c'est plus avantageux
  const bundles: BundleLine[] = [];
  if (catalog.settings.autoBundle) {
    const bundleProducts = catalog.products.filter(
      (p) => p.active && p.billing === 'lot' && p.bundleOf && p.packQuantity > 1 && p.priceInitial !== null && p.monthly !== null,
    );
    for (const b of bundleProducts) {
      for (const line of lines) {
        if (line.category !== b.bundleOf || !line.priceKnown || line.extra <= 0) continue;
        const choice = bestBundle(
          line.extra,
          b.packQuantity,
          toCents(line.unitInitial!),
          toCents(line.unitMonthly!),
          toCents(b.priceInitial!),
          toCents(b.monthly!),
        );
        if (choice.k === 0) continue;
        const covers = Math.min(line.extra, choice.k * b.packQuantity);
        const rem = line.extra - covers;
        line.bundled = covers;
        line.extraInitial = fromCents(rem * toCents(line.unitInitial!));
        line.extraMonthly = fromCents(rem * toCents(line.unitMonthly!));
        bundles.push({
          productId: b.id,
          reference: b.reference,
          name: b.name,
          count: choice.k,
          size: b.packQuantity,
          covers,
          coveredProductId: line.productId,
          unitInitial: b.priceInitial!,
          unitMonthly: b.monthly!,
          initial: fromCents(choice.k * toCents(b.priceInitial!)),
          monthly: fromCents(choice.k * toCents(b.monthly!)),
          savingInitial: fromCents(line.extra * toCents(line.unitInitial!) - choice.initial),
          savingMonthly: fromCents(line.extra * toCents(line.unitMonthly!) - choice.monthly),
        });
      }
    }
  }

  const includedUnused: QuoteResult['includedUnused'] = [];
  for (const [productId, qty] of includedMap) {
    const used = requested.get(productId) ?? 0;
    if (qty > used) includedUnused.push({ productId, name: products.get(productId)?.name ?? productId, quantity: qty - used });
  }

  const extrasInitialC =
    lines.reduce((s, l) => s + (l.extraInitial !== null ? toCents(l.extraInitial) : 0), 0) +
    bundles.reduce((s, b) => s + toCents(b.initial), 0);
  const extrasMonthlyC =
    lines.reduce((s, l) => s + (l.extraMonthly !== null ? toCents(l.extraMonthly) : 0), 0) +
    bundles.reduce((s, b) => s + toCents(b.monthly), 0);

  const installation = catalog.settings.installationFee;
  const packInitialC = pack ? toCents(pack.initial) : 0;
  const packMonthlyC = pack ? toCents(pack.monthly) : 0;
  const initialBeforeC = packInitialC + extrasInitialC + (installation !== null ? toCents(installation) : 0);
  const monthlyBeforeC = packMonthlyC + extrasMonthlyC;

  // Remises configurées
  const applied: AppliedDiscount[] = [];
  let initialDiscountC = 0;
  let monthlyDiscountC = 0;
  for (const id of draft.discountIds) {
    const d = catalog.discounts.find((x) => x.id === id);
    if (!d) continue;
    if (!d.active) {
      warnings.push(`Remise « ${d.label} » désactivée : non appliquée.`);
      continue;
    }
    const base =
      d.target === 'materiel_supplementaire'
        ? extrasInitialC
        : d.target === 'initial_total'
          ? initialBeforeC - initialDiscountC
          : monthlyBeforeC - monthlyDiscountC;
    const remaining = d.target === 'mensuel_total' ? monthlyBeforeC - monthlyDiscountC : initialBeforeC - initialDiscountC;
    let amount = d.kind === 'pourcentage' ? Math.round((base * Math.max(0, Math.min(100, d.value))) / 100) : toCents(Math.max(0, d.value));
    amount = Math.max(0, Math.min(amount, base, remaining));
    if (d.target === 'mensuel_total') monthlyDiscountC += amount;
    else initialDiscountC += amount;
    applied.push({ id: d.id, label: d.label, target: d.target, amount: fromCents(amount) });
  }

  const initialC = initialBeforeC - initialDiscountC;
  const monthlyC = monthlyBeforeC - monthlyDiscountC;
  const { priceBasis, vatRate } = catalog.settings;
  const vat: QuoteResult['vat'] = {
    basis: priceBasis,
    rate: vatRate,
    initialTTC: null,
    monthlyTTC: null,
    initialVatIncluded: null,
    monthlyVatIncluded: null,
  };
  if (vatRate !== null && priceBasis === 'HT') {
    vat.initialTTC = fromCents(Math.round(initialC * (1 + vatRate / 100)));
    vat.monthlyTTC = fromCents(Math.round(monthlyC * (1 + vatRate / 100)));
  } else if (vatRate !== null && priceBasis === 'TTC') {
    vat.initialVatIncluded = fromCents(initialC - Math.round(initialC / (1 + vatRate / 100)));
    vat.monthlyVatIncluded = fromCents(monthlyC - Math.round(monthlyC / (1 + vatRate / 100)));
  }

  if (!pack) {
    const missing = lines.filter((l) => !l.priceKnown && l.extra > 0).map((l) => l.name);
    if (missing.length) warnings.push(`Sans forfait, prix à confirmer pour : ${missing.join(', ')}.`);
  }
  if (installation === null) warnings.push("Frais d'installation éventuels : à confirmer.");

  return {
    pack: pack
      ? {
          id: pack.id,
          name: pack.name,
          initial: pack.initial,
          monthly: pack.monthly,
          items: pack.items.map((i) => ({
            productId: i.productId,
            name: products.get(i.productId)?.name ?? i.productId,
            quantity: i.quantity,
            used: Math.min(i.quantity, requested.get(i.productId) ?? 0),
          })),
        }
      : null,
    lines: lines.sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category)),
    bundles,
    includedUnused,
    unpriced,
    extras: { initial: fromCents(extrasInitialC), monthly: fromCents(extrasMonthlyC) },
    installation,
    discounts: applied,
    totals: {
      initialBeforeDiscount: fromCents(initialBeforeC),
      initialDiscount: fromCents(initialDiscountC),
      initial: fromCents(initialC),
      monthlyBeforeDiscount: fromCents(monthlyBeforeC),
      monthlyDiscount: fromCents(monthlyDiscountC),
      monthly: fromCents(monthlyC),
    },
    vat,
    hasUnpricedItems: unpriced.length > 0,
    warnings,
    equipmentCount: Array.from(requested.values()).reduce((s, v) => s + v, 0),
  };
}

const ORDER: ProductCategory[] = [
  'centrale',
  'clavier',
  'detecteur_mouvement',
  'detecteur_choc',
  'detecteur_fumee',
  'sirene_interieure',
  'sirene_exterieure',
  'boitier_save',
  'pack_perimetrique',
  'autre',
];
export function categoryOrder(c: ProductCategory): number {
  return ORDER.indexOf(c);
}

export function productName(products: Product[], id: string): string {
  return products.find((p) => p.id === id)?.name ?? id;
}
