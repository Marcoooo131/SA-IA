import type { Catalog, Dossier } from '@/domain/types';
import type { RulesConfig } from '@/rules/config';
import { runAudit } from '@/rules/engine';
import { buildComparison, quoteForDossier } from '@/quote/compare';
import { createQuoteRecord } from '@/quote/snapshot';
import { generateQuotePdf, type PdfImage } from './pdf';
import { renderLevelSvg, svgToPng } from './planImage';

/**
 * Chaîne complète de génération du devis : calcul, copie des prix (historique),
 * images du plan (2D) et de la maquette (3D), puis PDF.
 */
export async function generateQuoteForDossier(
  dossier: Dossier,
  catalog: Catalog,
  rules: RulesConfig,
  opts: { view3d?: string | null; include3d?: boolean } = {},
) {
  const audit = runAudit(dossier, rules, catalog.products);
  const result = quoteForDossier(dossier, catalog);
  const record = createQuoteRecord(dossier, result, catalog);
  const comparison = buildComparison(dossier, catalog, audit);

  const planImages: PdfImage[] = [];
  for (const level of [...dossier.plan.levels].sort((a, b) => a.index - b.index)) {
    if (!level.rooms.length) continue;
    const { svg, width, height } = renderLevelSvg(
      level,
      dossier.devices.filter((d) => d.levelId === level.id),
      catalog.products,
      { motionAngle: rules.motion.angleDeg, motionRange: rules.motion.rangeM },
    );
    try {
      const png = await svgToPng(svg, width, height);
      planImages.push({ title: `Plan 2D – ${level.name}`, ...png });
    } catch {
      /* le PDF signale l'image manquante */
    }
  }

  let view3d: PdfImage | null = null;
  if (opts.include3d !== false) {
    if (opts.view3d) {
      const img = await loadSize(opts.view3d);
      view3d = { title: 'Vue 3D retenue par le conseiller', dataUrl: opts.view3d, ...img };
    } else {
      try {
        const { capture3DView } = await import('@/view3d/snapshot');
        const shot = await capture3DView(dossier, catalog.products, rules);
        view3d = { title: 'Vue 3D isométrique (murs coupés)', ...shot };
      } catch {
        view3d = null;
      }
    }
  }

  const doc = generateQuotePdf({ dossier, catalog, record, result, audit, comparison, planImages, view3d });
  const blob = doc.output('blob');
  return { record, blob, result };
}

function loadSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1400, height: 900 });
    img.src = dataUrl;
  });
}
