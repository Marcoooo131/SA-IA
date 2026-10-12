import type { Catalog, Dossier, QuoteRecord } from '@/domain/types';
import { uid } from '@/lib/id';
import type { QuoteResult } from './calculator';

export function nextQuoteReference(dossier: Dossier, date = new Date()): string {
  const base = dossier.info.reference.replace(/[^A-Za-z0-9-]/g, '') || `DOSSIER-${date.getFullYear()}`;
  return `DEV-${base}-${String(dossier.quotes.length + 1).padStart(2, '0')}`;
}

/**
 * Crée l'enregistrement historique d'un devis : les prix appliqués sont COPIÉS,
 * de sorte qu'une modification ultérieure du catalogue ne change pas un devis émis.
 */
export function createQuoteRecord(dossier: Dossier, result: QuoteResult, catalog: Catalog, date = new Date()): QuoteRecord {
  const usedIds = new Set([
    ...result.lines.map((l) => l.productId),
    ...result.bundles.map((b) => b.productId),
    ...(result.pack?.items.map((i) => i.productId) ?? []),
  ]);
  const pack = result.pack ? catalog.packs.find((p) => p.id === result.pack!.id) : null;
  return {
    id: uid('quote'),
    reference: nextQuoteReference(dossier, date),
    createdAt: date.toISOString(),
    packId: result.pack?.id ?? null,
    packName: result.pack?.name ?? 'Sans forfait (à la carte)',
    priceSnapshot: structuredClone({
      products: catalog.products
        .filter((p) => usedIds.has(p.id))
        .map((p) => {
          // prix réellement appliqués (y compris les prix modifiés pour ce devis)
          const line = result.lines.find((l) => l.productId === p.id);
          return {
            id: p.id,
            reference: p.reference,
            name: p.name,
            priceInitial: line ? line.unitInitial : p.priceInitial,
            monthly: line ? line.unitMonthly : p.monthly,
            packQuantity: p.packQuantity,
          };
        }),
      pack: pack && result.pack ? { id: pack.id, name: pack.name, initial: result.pack.initial, monthly: result.pack.monthly, items: pack.items } : null,
      discounts: catalog.discounts.filter((d) => result.discounts.some((a) => a.id === d.id)),
      settings: catalog.settings,
      catalogVersion: catalog.version,
    }),
    totals: { initial: result.totals.initial, monthly: result.totals.monthly, hasUnpricedItems: result.hasUnpricedItems },
    lines: [
      ...result.lines.map((l) => ({
        label: l.name,
        quantity: l.requested,
        unitInitial: l.unitInitial,
        unitMonthly: l.unitMonthly,
        included: l.included,
        moved: l.moved,
      })),
      ...result.bundles.map((b) => ({
        label: b.name,
        quantity: b.count,
        unitInitial: b.unitInitial,
        unitMonthly: b.unitMonthly,
        included: 0,
      })),
    ],
  };
}
