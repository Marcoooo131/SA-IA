import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Catalog, Dossier, ProductCategory, QuoteRecord } from '@/domain/types';
import type { QuoteResult } from '@/quote/calculator';
import type { AuditResult } from '@/rules/engine';
import { ALERT_STATUS_LABELS } from '@/rules/engine';
import type { Comparison } from '@/quote/compare';
import { CATEGORY_COLORS, CATEGORY_LABELS, HOUSING_TYPE_LABELS, MODE_LABELS, OPENING_TYPE_LABELS } from '@/domain/labels';
import { formatArea, formatDate, formatEuro, formatMonthly } from '@/lib/format';

export interface PdfImage {
  title: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface QuotePdfInput {
  dossier: Dossier;
  catalog: Catalog;
  record: QuoteRecord;
  result: QuoteResult;
  audit: AuditResult;
  comparison: Comparison | null;
  planImages: PdfImage[];
  view3d: PdfImage | null;
}

const NAVY: [number, number, number] = [15, 61, 94];
const SLATE: [number, number, number] = [71, 85, 105];
const LIGHT: [number, number, number] = [241, 245, 249];
const MARGIN = 14;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** jsPDF ne gère que le jeu WinAnsi avec les polices standard : on remplace les caractères hors jeu. */
export function pdfText(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[  ]/g, ' ')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/×/g, 'x')
    .replace(/²/g, '²');
}

export function generateQuotePdf(input: QuotePdfInput): jsPDF {
  const { dossier, record, result, audit, comparison, catalog } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const T = (s: string) => pdfText(s);
  let y = 0;

  const sectionTitle = (title: string) => {
    if (y > H - 40) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text(T(title), MARGIN, y);
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y + 1.5, W - MARGIN, y + 1.5);
    y += 7;
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  };
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ---------------------------------------------------------------- En-tête
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(T('Proposition de solution de sécurité'), MARGIN, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(T('Service Movers - audit de sécurité lors d’un déménagement'), MARGIN, 19);
  doc.text(T('PROTOTYPE DE DÉMONSTRATION - document non contractuel, non officiel'), MARGIN, 24.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(T(record.reference), W - MARGIN, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(T(`Émis le ${formatDate(record.createdAt)}`), W - MARGIN, 19, { align: 'right' });
  doc.text(T(`Validité indicative : ${catalog.settings.validityDays} jours`), W - MARGIN, 24.5, { align: 'right' });
  y = 38;

  // ---------------------------------------------------------------- Dossier
  sectionTitle('Dossier et logement');
  const levels = [...dossier.plan.levels].sort((a, b) => a.index - b.index);
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42, textColor: SLATE }, 2: { fontStyle: 'bold', cellWidth: 42, textColor: SLATE } },
    margin: { left: MARGIN, right: MARGIN },
    body: [
      [T('Référence dossier'), T(dossier.info.reference), T('Type de logement'), T(HOUSING_TYPE_LABELS[dossier.info.housingType])],
      [T('Client'), T(dossier.info.clientName || '-'), T('Surface déclarée'), dossier.info.surface ? T(formatArea(dossier.info.surface)) : T('Non renseignée')],
      [T('Adresse du logement'), T(dossier.info.address || 'Non renseignée'), T('Surface du plan'), T(formatArea(audit.inventory.totalArea))],
      [T('Installation souhaitée'), T(formatDate(dossier.info.installationDate)), T('Niveaux / pièces'), T(`${levels.length} / ${levels.reduce((s, l) => s + l.rooms.length, 0)}`)],
      [T('Mode de protection'), T(MODE_LABELS[dossier.protectionMode]), T('Ouvertures extérieures'), String(audit.inventory.exteriorOpenings.length)],
    ],
  });
  y = lastY() + 6;

  // ---------------------------------------------------------------- Synthèse
  sectionTitle('Synthèse de la proposition');
  const boxW = (W - MARGIN * 2 - 8) / 3;
  const boxes: [string, string, string][] = [
    ['Offre', record.packName, result.pack ? 'Forfait (prix communiqué)' : 'Sans forfait'],
    ['Frais initiaux', formatEuro(result.totals.initial), result.hasUnpricedItems ? 'Hors éléments à confirmer' : 'Matériel' + (result.installation === null ? ', hors installation (à confirmer)' : ' et installation')],
    ['Mensualité', formatMonthly(result.totals.monthly), result.totals.monthlyDiscount ? 'Après remise' : 'Forfait + suppléments'],
  ];
  boxes.forEach(([label, value, sub], i) => {
    const x = MARGIN + i * (boxW + 4);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(x, y, boxW, 22, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text(T(label.toUpperCase()), x + 4, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(i === 0 ? 11 : 14);
    doc.setTextColor(...NAVY);
    doc.text(T(value), x + 4, y + 13.5, { maxWidth: boxW - 8 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(T(sub), x + 4, y + 19, { maxWidth: boxW - 8 });
  });
  y += 28;
  doc.setFontSize(8);
  doc.setTextColor(...SLATE);
  const vatText =
    result.vat.rate === null || result.vat.basis === 'inconnue'
      ? 'TVA : non renseignée dans le catalogue - montants affichés tels que communiqués (base HT/TTC à confirmer).'
      : result.vat.basis === 'HT'
        ? `Montants HT. TVA ${result.vat.rate} % : ${formatEuro(result.vat.initialTTC)} TTC de frais initiaux, ${formatMonthly(result.vat.monthlyTTC)} TTC.`
        : `Montants TTC, dont TVA ${result.vat.rate} % : ${formatEuro(result.vat.initialVatIncluded)} (initial), ${formatEuro(result.vat.monthlyVatIncluded)} (mensuel).`;
  doc.text(T(vatText), MARGIN, y, { maxWidth: W - MARGIN * 2 });
  y += 8;

  // ---------------------------------------------------------------- Détail
  sectionTitle("Détail de l'offre et des équipements");
  if (result.pack) {
    doc.text(
      T(`${result.pack.name} : forfait de ${formatEuro(result.pack.initial)} de frais matériel et ${formatMonthly(result.pack.monthly)}. Le forfait n'est pas la somme des prix unitaires.`),
      MARGIN,
      y,
      { maxWidth: W - MARGIN * 2 },
    );
    y += 5;
  }
  const body: (string | number)[][] = result.lines.map((l) => [
    T(l.name),
    T(l.reference),
    l.requested,
    l.included || '-',
    l.extra ? (l.bundled ? `${l.extra} (dont ${l.bundled} en lot)` : l.extra) : '-',
    T(l.priceKnown ? formatEuro(l.unitInitial) : 'À confirmer'),
    T(l.priceKnown ? formatMonthly(l.unitMonthly) : 'À confirmer'),
    T(l.extra - l.bundled > 0 ? (l.extraInitial === null ? 'À confirmer' : formatEuro(l.extraInitial)) : '-'),
    T(l.extra - l.bundled > 0 ? (l.extraMonthly === null ? 'À confirmer' : formatMonthly(l.extraMonthly)) : '-'),
  ]);
  for (const b of result.bundles)
    body.push([T(b.name), T(b.reference), `${b.count} lot(s)`, '-', `${b.covers} unités`, T(formatEuro(b.unitInitial)), T(formatMonthly(b.unitMonthly)), T(formatEuro(b.initial)), T(formatMonthly(b.monthly))]);
  for (const u of result.includedUnused) body.push([T(`${u.name} (inclus, non positionné)`), '', u.quantity, u.quantity, '-', '-', '-', '-', '-']);
  autoTable(doc, {
    startY: y,
    head: [[T('Équipement'), T('Réf.'), T('Qté'), T('Inclus forfait'), T('Supplément.'), T('Prix unit.'), T('Mensuel unit.'), T('Total supp.'), T('Mensuel supp.')]],
    body,
    theme: 'striped',
    headStyles: { fillColor: NAVY, fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 1.4 },
    columnStyles: { 0: { cellWidth: 46 }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = lastY() + 4;

  const totals: string[][] = [];
  if (result.pack) totals.push([T(`Forfait ${result.pack.name}`), T(formatEuro(result.pack.initial)), T(formatMonthly(result.pack.monthly))]);
  totals.push([T('Équipements supplémentaires'), T(formatEuro(result.extras.initial)), T(formatMonthly(result.extras.monthly))]);
  totals.push([T("Frais d'installation"), T(result.installation === null ? 'À confirmer' : formatEuro(result.installation)), '-']);
  for (const d of result.discounts)
    totals.push([T(`Remise : ${d.label}`), d.target === 'mensuel_total' ? '-' : T(`- ${formatEuro(d.amount)}`), d.target === 'mensuel_total' ? T(`- ${formatMonthly(d.amount)}`) : '-']);
  totals.push([T('TOTAL'), T(formatEuro(result.totals.initial)), T(formatMonthly(result.totals.monthly))]);
  autoTable(doc, {
    startY: y,
    head: [[T('Récapitulatif'), T('Frais initiaux'), T('Mensuel')]],
    body: totals,
    theme: 'grid',
    headStyles: { fillColor: SLATE, fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    columnStyles: { 1: { halign: 'right', cellWidth: 40 }, 2: { halign: 'right', cellWidth: 40 } },
    margin: { left: W / 2 - 20, right: MARGIN },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === totals.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = LIGHT;
      }
    },
  });
  y = lastY() + 4;
  if (result.unpriced.length) {
    doc.setTextColor(180, 83, 9);
    doc.text(T(`Prix à confirmer (exclus des totaux) : ${result.unpriced.map((u) => `${u.quantity} x ${u.name}`).join(', ')}.`), MARGIN, y, { maxWidth: W - MARGIN * 2 });
    doc.setTextColor(30, 41, 59);
    y += 8;
  }

  // ---------------------------------------------------------------- Plans
  const addImage = (img: PdfImage, maxH: number) => {
    const maxW = W - MARGIN * 2;
    let w = maxW;
    let h = (img.height / img.width) * w;
    if (h > maxH) {
      h = maxH;
      w = (img.width / img.height) * h;
    }
    if (y + h + 10 > H - 15) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(T(img.title), MARGIN, y);
    doc.setFont('helvetica', 'normal');
    y += 2;
    try {
      doc.addImage(img.dataUrl, img.dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', MARGIN + (maxW - w) / 2, y, w, h);
      doc.setDrawColor(226, 232, 240);
      doc.rect(MARGIN + (maxW - w) / 2, y, w, h);
    } catch {
      doc.text(T('Image indisponible'), MARGIN, y + 6);
    }
    y += h + 6;
  };

  doc.addPage();
  y = 20;
  sectionTitle('Plans du logement et implantation indicative');
  for (const img of input.planImages) addImage(img, input.planImages.length > 1 ? 105 : 200);
  drawLegend();
  if (input.view3d) {
    doc.addPage();
    y = 20;
    sectionTitle('Maquette 3D');
    addImage(input.view3d, 150);
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text(T('Représentation simplifiée. Les zones de détection éventuellement visibles sont des simulations indicatives.'), MARGIN, y);
    y += 6;
    drawLegend();
  }

  function drawLegend() {
    const cats = Array.from(
      new Set(
        dossier.devices
          .map((d) => catalog.products.find((p) => p.id === d.productId)?.category)
          .filter((c): c is ProductCategory => !!c),
      ),
    );
    if (!cats.length) return;
    if (y > H - 30) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(8);
    let x = MARGIN;
    for (const c of cats) {
      const label = T(CATEGORY_LABELS[c]);
      const tw = doc.getTextWidth(label) + 9;
      if (x + tw > W - MARGIN) {
        x = MARGIN;
        y += 5;
      }
      doc.setFillColor(...hexToRgb(CATEGORY_COLORS[c]));
      doc.circle(x + 2, y - 1, 1.8, 'F');
      doc.setTextColor(30, 41, 59);
      doc.text(label, x + 5, y);
      x += tw;
    }
    y += 5;
    doc.setTextColor(...SLATE);
    doc.text(T('Cercle plein : équipement placé par le conseiller ou validé - cercle pointillé : suggestion automatique non validée.'), MARGIN, y);
    y += 6;
  }

  // ---------------------------------------------------------------- Ouvertures
  doc.addPage();
  y = 20;
  sectionTitle('Ouvertures extérieures recensées');
  autoTable(doc, {
    startY: y,
    head: [[T('Identifiant'), T('Niveau'), T('Type'), T('Largeur'), T('Remarque')]],
    body: audit.inventory.exteriorOpenings.map(({ opening, level }) => [
      T(opening.code),
      T(level.name),
      T(OPENING_TYPE_LABELS[opening.type]),
      T(`${opening.width.toFixed(2).replace('.', ',')} m`),
      T(opening.sectional ? 'Sectionnelle : non équipée automatiquement' : opening.type === 'baie' ? 'Baie vitrée : 2 détecteurs indicatifs' : ''),
    ]),
    theme: 'striped',
    headStyles: { fillColor: NAVY, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.3 },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = lastY() + 8;

  // ---------------------------------------------------------------- Comparaison
  if (comparison) {
    sectionTitle('Comparaison des propositions');
    const head = [T('Configuration'), ...comparison.offers.map((o) => T(o.name))];
    const rows = comparison.configs.map((c) => [
      T(`${c.label} (${c.total} équipements)`),
      ...comparison.offers.map((o) => {
        const cell = comparison.cells.find((x) => x.config === c.key && x.packId === o.packId)!;
        return T(`${formatEuro(cell.result.totals.initial)}\n${formatMonthly(cell.result.totals.monthly)}${cell.result.hasUnpricedItems ? '\n+ éléments à confirmer' : ''}`);
      }),
    ]);
    autoTable(doc, {
      startY: y,
      head: [head],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: NAVY, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 1.6 },
      columnStyles: { 0: { cellWidth: 58 } },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = lastY() + 3;
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(T('Frais initiaux / mensualité. Remises sélectionnées appliquées. Les configurations volumétrique et périmétrique sont des propositions du moteur de règles (hypothèses à valider).'), MARGIN, y, { maxWidth: W - MARGIN * 2 });
    y += 9;
  }

  // ---------------------------------------------------------------- Réserves
  sectionTitle('Informations manquantes et réserves');
  const reserves = audit.alerts.filter((a) => a.status === 'manquant' || a.status === 'a_verifier');
  const reserveRows = reserves.map((a) => [T(ALERT_STATUS_LABELS[a.status]), T(a.title), T(a.nextAction)]);
  for (const w of result.warnings) reserveRows.push([T('Tarification'), T(w), '']);
  if (reserveRows.length)
    autoTable(doc, {
      startY: y,
      head: [[T('Statut'), T('Point'), T('Action recommandée')]],
      body: reserveRows,
      theme: 'striped',
      headStyles: { fillColor: [180, 83, 9], fontSize: 8 },
      styles: { fontSize: 7.6, cellPadding: 1.3 },
      columnStyles: { 0: { cellWidth: 30 } },
      margin: { left: MARGIN, right: MARGIN },
    });
  else doc.text(T('Aucune réserve en suspens.'), MARGIN, y);
  y = (reserveRows.length ? lastY() : y) + 8;

  sectionTitle('Conditions commerciales');
  doc.setFontSize(8.5);
  const conditions = doc.splitTextToSize(
    T(
      `${catalog.settings.conditions}\n\nCe document est produit par un prototype d'aide à la préparation de l'audit. Il ne constitue ni une certification de sécurité, ni un engagement contractuel. Les règles techniques utilisées sont des hypothèses de configuration à valider par le responsable métier ; les exigences applicables et les préconisations des fabricants doivent être vérifiées indépendamment. Copie des prix appliqués conservée avec le devis (version de catalogue ${record.priceSnapshot.catalogVersion}).`,
    ),
    W - MARGIN * 2,
  );
  if (y + conditions.length * 4 > H - 20) {
    doc.addPage();
    y = 20;
  }
  doc.text(conditions, MARGIN, y);

  // ---------------------------------------------------------------- Pieds de page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(T(`${record.reference} - Prototype de démonstration, non officiel et non contractuel`), MARGIN, H - 8);
    doc.text(`${i} / ${pages}`, W - MARGIN, H - 8, { align: 'right' });
  }
  doc.setProperties({ title: `${record.reference} - Proposition`, subject: 'Prototype de démonstration', creator: 'Prototype Audit Movers' });
  return doc;
}
