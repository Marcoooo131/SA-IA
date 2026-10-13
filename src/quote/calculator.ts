import type { Catalog, Discount, Pack, Product, ProductCategory, QuoteDraft } from '@/domain/types';

/**
 * Calculateur de devis centralisé.
 * Principes :
 *  - le prix d'un pack est un FORFAIT (jamais la somme des prix unitaires) ;
 *  - un équipement inclus dans le forfait n'est jamais facturé une seconde fois ;
 *  - frais initiaux et coûts mensuels sont toujours séparés ;
 *  - un prix inconnu n'est jamais inventé : la ligne est marquée « à confirmer »
 *    et exclue des totaux (signalé par `unpriced`) ;
 *  - un prix peut être modifié pour un devis sans changer le catalogue ;
 *  - les équipements repris lors du déménagement sont à 0 € et 0 €/mois ;
 *  - la centrale n'a jamais de supplément mensuel (règle métier validée : 0 €).
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
  /** Unités supplémentaires reprises du logement précédent (déménagement, 0 €). */
  moved: number;
  /** Quantité supplémentaire couverte par un lot (ex. pack périmétrique). */
  bundled: number;
  /** Prix appliqués (prix modifié pour ce devis, sinon prix du catalogue). */
  unitInitial: number | null;
  unitMonthly: number | null;
  catalogInitial: number | null;
  catalogMonthly: number | null;
  overridden: boolean;
  /** Montants des unités supplémentaires facturées à l'unité. */
  extraInitial: number | null;
  extraMonthly: number | null;
  /** Prix matériel et mensuel tous deux connus. */
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
  pack:
    | (Pick<Pack, 'id' | 'name' | 'initial' | 'monthly'> & {
        catalogInitial: number;
        catalogMonthly: number;
        overridden: boolean;
        /** Abonnement transféré (déménagement) : frais matériels à 0 €, mensualité conservée. */
        transferred: boolean;
        items: { productId: string; name: string; quantity: number; used: number }[];
      })
    | null;
  lines: QuoteLine[];
  bundles: BundleLine[];
  /** Éléments du forfait non positionnés sur le plan (fournis quand même). */
  includedUnused: { productId: string; name: string; quantity: number }[];
  /** Unités supplémentaires dont un prix (matériel et/ou mensuel) reste à confirmer. */
  unpriced: { productId: string; name: string; quantity: number; missing: ('materiel' | 'mensuel')[] }[];
  /** Nombre total d'équipements repris lors du déménagement. */
  movedCount: number;
  extras: { initial: number; monthly: number };
  installation: number | null;
  discounts: AppliedDiscount[];
  /** Écart entre le montant saisi manuellement et le montant calculé (null = pas d'ajustement). */
  manualAdjustment: { initial: number | null; monthly: number | null; note: string } | null;
  totals: {
    /** Montants calculés avant ajustement manuel. */
    initialComputed: number;
    monthlyComputed: number;
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

  const overrides = new Map((draft.priceOverrides ?? []).map((o) => [o.productId, o]));
  const movedMap = new Map((draft.moved ?? []).map((m) => [m.productId, Math.max(0, Math.round(m.quantity))]));
  const lines: QuoteLine[] = [];
  const unpriced: QuoteResult['unpriced'] = [];
  for (const [productId, qty] of requested) {
    const p = products.get(productId);
    if (!p) {
      warnings.push(`Produit inconnu ignoré (${productId}).`);
      continue;
    }
    const o = overrides.get(productId);
    const usable = p.active && p.billing !== 'sur_devis';
    if (!p.active) warnings.push(`« ${p.name} » est désactivé dans le catalogue : prix à confirmer.`);
    const unitInitial = o?.initial ?? (usable ? p.priceInitial : null);
    // Règle métier : la centrale n'a jamais de supplément mensuel (ni catalogue, ni prix modifié).
    const unitMonthly = p.category === 'centrale' ? 0 : (o?.monthly ?? (usable ? p.monthly : null));
    const included = Math.min(qty, includedMap.get(productId) ?? 0);
    const extra = qty - included;
    const moved = Math.min(extra, movedMap.get(productId) ?? 0);
    const billable = extra - moved;
    const missing: ('materiel' | 'mensuel')[] = [];
    if (unitInitial === null) missing.push('materiel');
    if (unitMonthly === null) missing.push('mensuel');
    lines.push({
      productId,
      reference: p.reference,
      name: p.name,
      category: p.category,
      requested: qty,
      included,
      extra,
      moved,
      bundled: 0,
      unitInitial,
      unitMonthly,
      catalogInitial: p.priceInitial,
      catalogMonthly: p.monthly,
      overridden: o !== undefined && (o.initial !== undefined || o.monthly !== undefined),
      extraInitial: unitInitial !== null ? fromCents(billable * toCents(unitInitial)) : null,
      // Déménagement : seuls les frais matériels sont offerts, la mensualité reste due
      extraMonthly: unitMonthly !== null ? fromCents(extra * toCents(unitMonthly)) : null,
      priceKnown: unitInitial !== null && unitMonthly !== null,
    });
    const missingNow = missing.filter((m) => (m === 'materiel' ? billable > 0 : extra > 0));
    if (missingNow.length) unpriced.push({ productId, name: p.name, quantity: missingNow.includes('materiel') ? billable : extra, missing: missingNow });
  }

  // Regroupement en lots (ex. pack périmétrique) lorsque c'est plus avantageux
  const bundles: BundleLine[] = [];
  if (catalog.settings.autoBundle) {
    const bundleProducts = catalog.products.filter(
      (p) => p.active && p.billing === 'lot' && p.bundleOf && p.packQuantity > 1 && p.priceInitial !== null && p.monthly !== null,
    );
    for (const b of bundleProducts) {
      for (const line of lines) {
        const billable = line.extra - line.moved;
        if (line.category !== b.bundleOf || !line.priceKnown || billable <= 0) continue;
        const choice = bestBundle(
          billable,
          b.packQuantity,
          toCents(line.unitInitial!),
          toCents(line.unitMonthly!),
          toCents(b.priceInitial!),
          toCents(b.monthly!),
        );
        if (choice.k === 0) continue;
        const covers = Math.min(billable, choice.k * b.packQuantity);
        const rem = billable - covers;
        line.bundled = covers;
        line.extraInitial = fromCents(rem * toCents(line.unitInitial!));
        line.extraMonthly = fromCents((rem + line.moved) * toCents(line.unitMonthly!));
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
          savingInitial: fromCents(billable * toCents(line.unitInitial!) - choice.initial),
          savingMonthly: fromCents(billable * toCents(line.unitMonthly!) - choice.monthly),
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
  const transferred = !!pack && !!draft.packTransferred;
  const packInitial = pack ? (transferred ? 0 : (draft.packOverride?.initial ?? pack.initial)) : 0;
  const packMonthly = pack ? (draft.packOverride?.monthly ?? pack.monthly) : 0;
  const packInitialC = toCents(packInitial);
  const packMonthlyC = toCents(packMonthly);
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

  const initialComputedC = initialBeforeC - initialDiscountC;
  const monthlyComputedC = monthlyBeforeC - monthlyDiscountC;
  // Montants finaux saisis manuellement par le conseiller
  const to = draft.totalOverride;
  const initialC = to?.initial !== undefined && to !== null ? toCents(to.initial) : initialComputedC;
  const monthlyC = to?.monthly !== undefined && to !== null ? toCents(to.monthly) : monthlyComputedC;
  const manualAdjustment =
    to && (to.initial !== undefined || to.monthly !== undefined)
      ? {
          initial: to.initial !== undefined ? fromCents(initialC - initialComputedC) : null,
          monthly: to.monthly !== undefined ? fromCents(monthlyC - monthlyComputedC) : null,
          note: to.note ?? '',
        }
      : null;
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
    const missing = lines.filter((l) => !l.priceKnown && l.extra - l.moved > 0).map((l) => l.name);
    if (missing.length) warnings.push(`Sans forfait, prix à confirmer pour : ${missing.join(', ')}.`);
  }
  if (installation === null) warnings.push("Frais d'installation éventuels : à confirmer.");

  return {
    pack: pack
      ? {
          id: pack.id,
          name: pack.name,
          initial: packInitial,
          monthly: packMonthly,
          catalogInitial: pack.initial,
          catalogMonthly: pack.monthly,
          overridden: !!draft.packOverride && ((!transferred && draft.packOverride.initial !== undefined) || draft.packOverride.monthly !== undefined),
          transferred,
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
    movedCount: lines.reduce((s, l) => s + l.moved, 0),
    extras: { initial: fromCents(extrasInitialC), monthly: fromCents(extrasMonthlyC) },
    installation,
    discounts: applied,
    manualAdjustment,
    totals: {
      initialComputed: fromCents(initialComputedC),
      monthlyComputed: fromCents(monthlyComputedC),
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
