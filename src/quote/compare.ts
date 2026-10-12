import type { Catalog, Dossier, ProductCategory, ProtectionMode } from '@/domain/types';
import type { AuditResult } from '@/rules/engine';
import { billOfMaterials, proposalBom } from '@/rules/apply';
import { computeQuote, type QuoteResult } from './calculator';

export type ConfigKey = 'plan' | ProtectionMode;

export const CONFIG_LABELS: Record<ConfigKey, string> = {
  plan: 'Configuration retenue (plan)',
  volumetrique: 'Configuration standard – volumétrique',
  perimetrique: 'Configuration alternative – périmétrique',
};

export interface ScenarioCell {
  config: ConfigKey;
  packId: string | null;
  packName: string;
  result: QuoteResult;
}

export interface Comparison {
  configs: { key: ConfigKey; label: string; counts: Partial<Record<ProductCategory, number>>; total: number }[];
  offers: { packId: string | null; name: string }[];
  cells: ScenarioCell[];
}

export function bomCounts(bom: Map<string, number>, catalog: Catalog): Partial<Record<ProductCategory, number>> {
  const out: Partial<Record<ProductCategory, number>> = {};
  for (const [id, q] of bom) {
    const p = catalog.products.find((x) => x.id === id);
    if (!p) continue;
    out[p.category] = (out[p.category] ?? 0) + q;
  }
  return out;
}

export function buildComparison(dossier: Dossier, catalog: Catalog, audit: AuditResult): Comparison {
  const boms: Record<ConfigKey, Map<string, number>> = {
    plan: billOfMaterials(dossier.devices),
    volumetrique: proposalBom(audit.proposals.volumetrique, catalog.products),
    perimetrique: proposalBom(audit.proposals.perimetrique, catalog.products),
  };
  const offers = [
    ...catalog.packs.filter((p) => p.active).map((p) => ({ packId: p.id as string | null, name: p.name })),
    { packId: null, name: 'Sans forfait (à la carte)' },
  ];
  const cells: ScenarioCell[] = [];
  for (const config of Object.keys(boms) as ConfigKey[]) {
    for (const offer of offers) {
      const result = computeQuote(
        boms[config],
        {
          packId: offer.packId,
          adjustments: config === 'plan' ? dossier.quoteDraft.adjustments : [],
          discountIds: dossier.quoteDraft.discountIds,
        },
        catalog,
      );
      cells.push({ config, packId: offer.packId, packName: offer.name, result });
    }
  }
  return {
    configs: (Object.keys(boms) as ConfigKey[]).map((key) => {
      const counts = bomCounts(boms[key], catalog);
      return { key, label: CONFIG_LABELS[key], counts, total: Object.values(counts).reduce((s, v) => s + (v ?? 0), 0) };
    }),
    offers,
    cells,
  };
}

export function quoteForDossier(dossier: Dossier, catalog: Catalog): QuoteResult {
  return computeQuote(billOfMaterials(dossier.devices), dossier.quoteDraft, catalog);
}
