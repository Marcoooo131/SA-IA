import { describe, expect, it } from 'vitest';
import { generateQuotePdf, pdfText } from './pdf';
import { createDefaultCatalog } from '@/catalog/defaultCatalog';
import { demoHouseDossier } from '@/demo/demoData';
import { runAudit } from '@/rules/engine';
import { DEFAULT_RULES_CONFIG } from '@/rules/config';
import { buildComparison, quoteForDossier } from '@/quote/compare';
import { createQuoteRecord } from '@/quote/snapshot';
import { renderLevelSvg } from './planImage';

// PNG 1x1 valide
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('génération du devis PDF', () => {
  it('produit un PDF multi-pages contenant les informations du devis', () => {
    const catalog = createDefaultCatalog();
    const dossier = demoHouseDossier(catalog);
    const audit = runAudit(dossier, DEFAULT_RULES_CONFIG, catalog.products);
    const result = quoteForDossier(dossier, catalog);
    const record = createQuoteRecord(dossier, result, catalog);
    const doc = generateQuotePdf({
      dossier,
      catalog,
      record,
      result,
      audit,
      comparison: buildComparison(dossier, catalog, audit),
      planImages: [{ title: 'Plan 2D – RDC', dataUrl: PNG, width: 100, height: 60 }],
      view3d: { title: 'Vue 3D', dataUrl: PNG, width: 100, height: 60 },
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(4);
    const raw = doc.output();
    expect(raw.startsWith('%PDF-')).toBe(true);
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });

  it('remplace les caractères non supportés par les polices PDF standard', () => {
    expect(pdfText('l’offre – 2 × 3 ≤ 4')).toBe("l'offre - 2 x 3 <= 4");
  });

  it('rend le plan 2D en SVG autonome (même composant que l’éditeur)', () => {
    const catalog = createDefaultCatalog();
    const dossier = demoHouseDossier(catalog);
    const level = dossier.plan.levels[0];
    const { svg, width, height } = renderLevelSvg(level, dossier.devices.filter((d) => d.levelId === level.id), catalog.products);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Séjour');
    expect(svg).toContain('RDC-O01');
    expect(width).toBeGreaterThan(500);
    expect(height).toBeGreaterThan(300);
  });
});
