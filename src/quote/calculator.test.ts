import { describe, expect, it } from 'vitest';
import { computeQuote } from './calculator';
import { createDefaultCatalog } from '@/catalog/defaultCatalog';
import { createQuoteRecord } from './snapshot';
import { demoHouseDossier } from '@/demo/demoData';
import type { Catalog, QuoteDraft } from '@/domain/types';

const bom = (entries: Record<string, number>) => new Map(Object.entries(entries));
const draft = (packId: string | null, extra: Partial<QuoteDraft> = {}): QuoteDraft => ({
  packId,
  adjustments: [],
  discountIds: [],
  priceOverrides: [],
  moved: [],
  packOverride: null,
  packTransferred: false,
  totalOverride: null,
  ...extra,
});

describe('calculateur de devis', () => {
  const catalog = createDefaultCatalog();

  it('facture le pack comme un forfait et non comme la somme des prix unitaires', () => {
    const r = computeQuote(bom({ prd_centrale: 1, prd_clavier: 1, prd_choc: 1, prd_mouvement: 1, prd_fumee: 1 }), draft('pack_essentiel'), catalog);
    expect(r.totals.initial).toBe(799);
    expect(r.totals.monthly).toBe(37.9);
    expect(r.extras).toEqual({ initial: 0, monthly: 0 });
    expect(r.hasUnpricedItems).toBe(false);
  });

  it('ne facture jamais deux fois un équipement inclus et calcule les suppléments', () => {
    // Sérénité inclut 3 détecteurs de mouvement : 5 demandés -> 2 supplémentaires
    const r = computeQuote(bom({ prd_centrale: 1, prd_clavier: 1, prd_mouvement: 5 }), draft('pack_serenite'), catalog);
    const line = r.lines.find((l) => l.productId === 'prd_mouvement')!;
    expect(line.included).toBe(3);
    expect(line.extra).toBe(2);
    expect(line.extraInitial).toBe(298);
    expect(line.extraMonthly).toBe(4);
    expect(r.totals.initial).toBe(999 + 298);
    expect(r.totals.monthly).toBe(47.9);
  });

  it('sépare frais initiaux et coût mensuel (scénario de démonstration Sérénité)', () => {
    const r = computeQuote(
      bom({ prd_centrale: 1, prd_clavier: 1, prd_mouvement: 5, prd_choc: 2, prd_fumee: 4, prd_sirene_int: 1 }),
      draft('pack_serenite'),
      catalog,
    );
    expect(r.extras.initial).toBe(894);
    expect(r.extras.monthly).toBe(12);
    expect(r.totals.initial).toBe(1893);
    expect(r.totals.monthly).toBe(55.9);
    // Les éléments inclus mais non positionnés (1 détecteur de choc, boîtier Save) sont signalés
    expect(r.includedUnused).toEqual([
      { productId: 'prd_choc', name: "Détecteur de choc et d'ouverture", quantity: 1 },
      { productId: 'prd_save', name: 'Boîtier Save', quantity: 1 },
    ]);
  });

  it('applique les prix de la centrale (499 €, 0 €/mois) et du clavier (149 €, 0 €/mois) sans forfait', () => {
    const r = computeQuote(bom({ prd_centrale: 1, prd_clavier: 1, prd_choc: 1 }), draft(null), catalog);
    expect(r.totals.initial).toBe(499 + 149 + 79);
    expect(r.totals.monthly).toBe(2);
    expect(r.unpriced).toEqual([]);
  });

  it("n'ajoute jamais de supplément mensuel pour la centrale, même si le catalogue ou le devis en indique un", () => {
    const c: Catalog = { ...catalog, products: catalog.products.map((p) => (p.id === 'prd_centrale' ? { ...p, monthly: 9 } : p)) };
    const r = computeQuote(bom({ prd_centrale: 2 }), draft('pack_essentiel', { priceOverrides: [{ productId: 'prd_centrale', monthly: 5 }] }), c);
    const line = r.lines.find((l) => l.productId === 'prd_centrale')!;
    expect(line.unitMonthly).toBe(0);
    expect(line.extraMonthly).toBe(0);
    expect(r.totals.monthly).toBe(37.9);
    expect(r.totals.initial).toBe(799 + 499);
  });

  it('n’invente jamais un prix non communiqué', () => {
    const c: Catalog = { ...catalog, products: catalog.products.map((p) => (p.id === 'prd_save' ? { ...p, priceInitial: null, monthly: null } : p)) };
    const r = computeQuote(bom({ prd_save: 1 }), draft(null), c);
    expect(r.totals.initial).toBe(0);
    expect(r.unpriced[0].missing).toEqual(['materiel', 'mensuel']);
    expect(r.warnings.join(' ')).toMatch(/prix à confirmer/);
  });

  it('permet de modifier un prix pour ce devis sans changer le catalogue', () => {
    const r = computeQuote(
      bom({ prd_fumee: 3 }),
      draft('pack_essentiel', { priceOverrides: [{ productId: 'prd_fumee', initial: 99, monthly: 1 }], packOverride: { initial: 699 } }),
      catalog,
    );
    const line = r.lines.find((l) => l.productId === 'prd_fumee')!;
    expect(line.overridden).toBe(true);
    expect(line.catalogInitial).toBe(149);
    expect(r.extras).toEqual({ initial: 198, monthly: 2 });
    expect(r.pack!.initial).toBe(699);
    expect(r.pack!.monthly).toBe(37.9);
    expect(r.pack!.overridden).toBe(true);
    expect(r.totals.initial).toBe(699 + 198);
    expect(catalog.products.find((p) => p.id === 'prd_fumee')!.priceInitial).toBe(149);
  });

  it('déménagement : frais matériels à 0 €, mensualité conservée (équipements repris et abonnement transféré)', () => {
    const base = bom({ prd_centrale: 1, prd_clavier: 1, prd_mouvement: 5, prd_fumee: 2 });
    const partial = computeQuote(base, draft('pack_serenite', { moved: [{ productId: 'prd_mouvement', quantity: 1 }] }), catalog);
    // 2 détecteurs de mouvement supplémentaires dont 1 repris -> 1 facturé
    expect(partial.lines.find((l) => l.productId === 'prd_mouvement')!.moved).toBe(1);
    expect(partial.extras.initial).toBe(149 + 149);
    expect(partial.movedCount).toBe(1);
    const none = computeQuote(base, draft('pack_serenite'), catalog);
    expect(partial.totals.monthly).toBe(none.totals.monthly);
    const all = computeQuote(
      base,
      draft('pack_serenite', {
        packTransferred: true,
        moved: [
          { productId: 'prd_mouvement', quantity: 2 },
          { productId: 'prd_fumee', quantity: 5 },
        ],
      }),
      catalog,
    );
    expect(all.pack!.transferred).toBe(true);
    expect(all.totals.initial).toBe(0);
    // mensualité conservée : forfait Sérénité + 2 mouvements + 1 fumée supplémentaires
    expect(all.pack!.monthly).toBe(43.9);
    expect(all.totals.monthly).toBe(none.totals.monthly);
    expect(all.totals.monthly).toBeCloseTo(43.9 + 3 * 2);
    // la reprise ne dépasse jamais la quantité supplémentaire
    expect(all.lines.find((l) => l.productId === 'prd_fumee')!.moved).toBe(1);
  });

  it('accepte des montants finaux saisis manuellement et affiche l’écart', () => {
    const base = bom({ prd_fumee: 3 });
    const computed = computeQuote(base, draft('pack_essentiel'), catalog);
    expect(computed.manualAdjustment).toBeNull();
    const r = computeQuote(base, draft('pack_essentiel', { totalOverride: { initial: 1000, monthly: 39, note: 'Geste commercial' } }), catalog);
    expect(r.totals.initialComputed).toBe(799 + 298);
    expect(r.totals.initial).toBe(1000);
    expect(r.totals.monthly).toBe(39);
    expect(r.manualAdjustment).toEqual({ initial: -97, monthly: -2.9, note: 'Geste commercial' });
    // un seul montant modifié : l'autre reste calculé
    const onlyMonthly = computeQuote(base, draft('pack_essentiel', { totalOverride: { monthly: 35, note: '' } }), catalog);
    expect(onlyMonthly.totals.initial).toBe(1097);
    expect(onlyMonthly.manualAdjustment!.initial).toBeNull();
  });

  it('regroupe les détecteurs de choc en pack périmétrique lorsque c’est plus avantageux', () => {
    // 13 détecteurs, 1 inclus dans Essentiel -> 12 supplémentaires = 2 lots de 5 + 2 unités
    const r = computeQuote(bom({ prd_choc: 13 }), draft('pack_essentiel'), catalog);
    const line = r.lines.find((l) => l.productId === 'prd_choc')!;
    expect(line.extra).toBe(12);
    expect(r.bundles).toHaveLength(1);
    expect(r.bundles[0].count).toBe(2);
    expect(line.bundled).toBe(10);
    expect(r.extras.initial).toBe(2 * 249 + 2 * 79);
    expect(r.extras.monthly).toBe(2 * 5 + 2 * 2);
  });

  it('ne regroupe pas quand ce n’est pas plus avantageux (3 unités)', () => {
    const r = computeQuote(bom({ prd_choc: 3 }), draft(null), catalog);
    expect(r.bundles).toHaveLength(0);
    expect(r.extras.initial).toBe(237);
  });

  it('applique les ajustements de quantité', () => {
    const r = computeQuote(bom({ prd_fumee: 1 }), draft('pack_essentiel', { adjustments: [{ productId: 'prd_fumee', delta: 2 }, { productId: 'prd_sirene_ext', delta: 1 }] }), catalog);
    expect(r.lines.find((l) => l.productId === 'prd_fumee')!.extra).toBe(2);
    expect(r.lines.find((l) => l.productId === 'prd_sirene_ext')!.extra).toBe(1);
    expect(r.extras.initial).toBe(3 * 149);
  });

  it('applique une remise configurée sans dépasser la base', () => {
    const r = computeQuote(bom({ prd_fumee: 3 }), draft('pack_essentiel', { discountIds: ['disc_exemple'] }), catalog);
    // 2 fumées supplémentaires = 298 € ; 10 % = 29,80 €
    expect(r.discounts[0].amount).toBe(29.8);
    expect(r.totals.initial).toBe(799 + 298 - 29.8);
    const fixed: Catalog = {
      ...catalog,
      discounts: [{ id: 'd', label: 'Fixe', target: 'mensuel_total', kind: 'montant', value: 1000, active: true, note: '' }],
    };
    const r2 = computeQuote(bom({}), draft('pack_essentiel', { discountIds: ['d'] }), fixed);
    expect(r2.totals.monthly).toBe(0);
  });

  it('ignore une remise désactivée en le signalant', () => {
    const c: Catalog = { ...catalog, discounts: catalog.discounts.map((d) => ({ ...d, active: false })) };
    const r = computeQuote(bom({ prd_fumee: 3 }), draft('pack_essentiel', { discountIds: ['disc_exemple'] }), c);
    expect(r.discounts).toHaveLength(0);
    expect(r.warnings.join(' ')).toMatch(/désactivée/);
  });

  it('calcule la TVA uniquement si elle est renseignée', () => {
    const r = computeQuote(bom({}), draft('pack_essentiel'), catalog);
    expect(r.vat.initialTTC).toBeNull();
    const ht: Catalog = { ...catalog, settings: { ...catalog.settings, priceBasis: 'HT', vatRate: 20 } };
    const r2 = computeQuote(bom({}), draft('pack_essentiel'), ht);
    expect(r2.vat.initialTTC).toBe(958.8);
    expect(r2.vat.monthlyTTC).toBe(45.48);
  });

  it("intègre les frais d'installation lorsqu'ils sont configurés", () => {
    const c: Catalog = { ...catalog, settings: { ...catalog.settings, installationFee: 150 } };
    const r = computeQuote(bom({}), draft('pack_essentiel'), c);
    expect(r.totals.initial).toBe(949);
    expect(r.warnings.join(' ')).not.toMatch(/installation/);
  });

  it('recalcule instantanément après modification d’un tarif', () => {
    const c: Catalog = { ...catalog, products: catalog.products.map((p) => (p.id === 'prd_fumee' ? { ...p, priceInitial: 99 } : p)) };
    const r = computeQuote(bom({ prd_fumee: 2 }), draft('pack_essentiel'), c);
    expect(r.extras.initial).toBe(99);
  });

  it('évite les erreurs d’arrondi flottant', () => {
    const c: Catalog = { ...catalog, products: catalog.products.map((p) => (p.id === 'prd_choc' ? { ...p, priceInitial: 0.1, monthly: 0.2 } : p)), settings: { ...catalog.settings, autoBundle: false } };
    const r = computeQuote(bom({ prd_choc: 3 }), draft(null), c);
    expect(r.extras.initial).toBe(0.3);
    expect(r.extras.monthly).toBe(0.6);
  });
});

describe('historique des prix', () => {
  it('conserve une copie des prix appliqués même si le catalogue change ensuite', () => {
    const catalog = createDefaultCatalog();
    const dossier = demoHouseDossier(catalog);
    const r = computeQuote(new Map([['prd_fumee', 3]]), draft('pack_essentiel'), catalog);
    const record = createQuoteRecord(dossier, r, catalog);
    catalog.products.find((p) => p.id === 'prd_fumee')!.priceInitial = 999;
    catalog.packs[0].initial = 1;
    expect(record.priceSnapshot.products.find((p) => p.id === 'prd_fumee')!.priceInitial).toBe(149);
    expect(record.priceSnapshot.pack!.initial).toBe(799);
    expect(record.totals.initial).toBe(799 + 298);
    expect(record.reference).toBe('DEV-MOV-DEMO-0001-01');
  });
});
