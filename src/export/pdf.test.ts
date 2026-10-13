import { describe, expect, it } from 'vitest';
import { generateQuotePdf, pdfText } from './pdf';
import { createDefaultCatalog } from '@/catalog/defaultCatalog';
import { demoHouseDossier } from '@/demo/demoData';
import { runAudit } from '@/rules/engine';
import { DEFAULT_RULES_CONFIG } from '@/rules/config';
import { buildComparison, quoteForDossier, selectedVariants, variantKey } from '@/quote/compare';
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

  it('n’affiche les variantes du comparateur que si elles sont sélectionnées', async () => {
    const catalog = createDefaultCatalog();
    const dossier = demoHouseDossier(catalog);
    const audit = runAudit(dossier, DEFAULT_RULES_CONFIG, catalog.products);
    const comparison = buildComparison(dossier, catalog, audit);
    const result = quoteForDossier(dossier, catalog);
    const record = createQuoteRecord(dossier, result, catalog);
    expect(selectedVariants(comparison, dossier)).toEqual([]);

    // texte des flux PDF (compressés) décodés
    const inflate = async (bytes: Uint8Array<ArrayBuffer>) =>
      new Uint8Array(await new Response(new Response(bytes).body!.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    const render = async (variants: ReturnType<typeof selectedVariants>) => {
      const raw = new Uint8Array(generateQuotePdf({ dossier, catalog, record, result, audit, comparison, variants, planImages: [], view3d: null }).output('arraybuffer'));
      const latin1 = new TextDecoder('latin1');
      const src = latin1.decode(raw);
      const out: string[] = [];
      let i = 0;
      while ((i = src.indexOf('stream', i)) !== -1) {
        let start = i + 6;
        if (src[start] === '\r') start++;
        if (src[start] === '\n') start++;
        const end = src.indexOf('endstream', start);
        let stop = end;
        while (src[stop - 1] === '\n' || src[stop - 1] === '\r') stop--;
        try {
          out.push(latin1.decode(await inflate(raw.slice(start, stop))));
        } catch {
          /* flux non compressé ou image */
        }
        i = end + 9;
      }
      return out.join('\n');
    };
    expect(await render([])).not.toContain('Variantes proposées');

    // l'offre retenue n'est jamais une « variante » ; une variante cochée est affichée
    const withVariant = {
      ...dossier,
      quoteDraft: { ...dossier.quoteDraft, pdfVariants: [variantKey('plan', dossier.quoteDraft.packId), variantKey('perimetrique', 'pack_essentiel')] },
    };
    const variants = selectedVariants(comparison, withVariant);
    expect(variants.map((v) => variantKey(v.config, v.packId))).toEqual([variantKey('perimetrique', 'pack_essentiel')]);
    const text = await render(variants);
    expect(text).toContain('Variantes proposées');
    expect(text).toContain('Configuration alternative - périmétrique');
  });
});
