import type { Catalog } from '@/domain/types';
import { IMPORT_COLUMNS, catalogToRows, parseCsv, rowsToCsv } from './importer';
import { BILLING_LABELS, CATEGORY_LABELS } from '@/domain/labels';

/** Lecture / écriture de fichiers Excel et CSV (ExcelJS chargé à la demande). */

export interface SheetData {
  name: string;
  rows: unknown[][];
}

function normalizeCell(value: unknown): unknown {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if ('result' in v) return normalizeCell(v.result);
    if ('richText' in v && Array.isArray(v.richText)) return (v.richText as { text: string }[]).map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('error' in v) return '';
  }
  return value;
}

export async function readSpreadsheet(file: File): Promise<SheetData[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') {
    return [{ name: 'CSV', rows: parseCsv(await file.text()) }];
  }
  if (!name.endsWith('.xlsx')) {
    throw new Error('Format non pris en charge : utilisez un fichier .xlsx ou .csv (les anciens fichiers .xls doivent être réenregistrés en .xlsx).');
  }
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch (e) {
    throw new Error(`Fichier Excel illisible : ${(e as Error).message}`);
  }
  const sheets: SheetData[] = [];
  wb.eachSheet((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values = (row.values as unknown[]).slice(1).map(normalizeCell);
      rows[rowNumber - 1] = values;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name: ws.name, rows });
  });
  if (!sheets.length) throw new Error('Le classeur ne contient aucune feuille.');
  return sheets;
}

async function workbookBlob(build: (wb: import('exceljs').Workbook) => void): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Prototype Audit Movers';
  build(wb);
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function styleHeader(ws: import('exceljs').Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3D5E' } };
  ws.columns.forEach((c) => (c.width = 24));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

export async function buildTemplateBlob(): Promise<Blob> {
  return workbookBlob((wb) => {
    const ws = wb.addWorksheet('Catalogue');
    ws.addRow(IMPORT_COLUMNS.map((c) => c.label));
    ws.addRow(['EXEMPLE-001', 'Produit exemple', "Détecteur de choc et d'ouverture", 'Description libre', 79, 2, 'Unitaire', 1, 'Actif', 'Ligne d’exemple à remplacer']);
    ws.addRow(['EXEMPLE-LOT-5', 'Lot exemple (5 unités)', 'Pack périmétrique', '', 249, 5, 'Lot', 5, 'Actif', '']);
    styleHeader(ws);
    const help = wb.addWorksheet('Aide');
    help.addRow(['Colonne', 'Obligatoire', 'Valeurs acceptées']);
    for (const c of IMPORT_COLUMNS) {
      let values = '';
      if (c.key === 'category') values = Object.values(CATEGORY_LABELS).join(' | ');
      else if (c.key === 'billing') values = Object.values(BILLING_LABELS).join(' | ') + ' (unitaire = prix matériel + supplément mensuel)';
      else if (c.key === 'status') values = 'Actif | Inactif';
      else if (c.key === 'priceInitial' || c.key === 'monthly') values = 'Nombre en euros (ex. 149 ou 149,00). Vide = à confirmer (sauf prix matériel des produits unitaires).';
      else if (c.key === 'packQuantity') values = 'Entier ≥ 1 (ex. 5 pour un lot de 5 détecteurs)';
      help.addRow([c.label, c.required ? 'Oui' : 'Non', values]);
    }
    help.addRow([]);
    help.addRow(['Les données importées sont présentées en aperçu et ne remplacent jamais le catalogue sans confirmation.']);
    styleHeader(help);
    help.getColumn(3).width = 90;
  });
}

export async function exportCatalogBlob(catalog: Catalog): Promise<Blob> {
  return workbookBlob((wb) => {
    const ws = wb.addWorksheet('Catalogue');
    for (const r of catalogToRows(catalog.products)) ws.addRow(r);
    styleHeader(ws);
    const packs = wb.addWorksheet('Packs');
    packs.addRow(['Pack', 'Frais matériel (forfait)', 'Mensualité (forfait)', 'Composition', 'Statut']);
    for (const p of catalog.packs)
      packs.addRow([
        p.name,
        p.initial,
        p.monthly,
        p.items.map((i) => `${i.quantity} × ${catalog.products.find((x) => x.id === i.productId)?.name ?? i.productId}`).join(', '),
        p.active ? 'Actif' : 'Inactif',
      ]);
    styleHeader(packs);
    packs.getColumn(4).width = 100;
  });
}

export function exportCatalogCsv(catalog: Catalog): Blob {
  return new Blob([rowsToCsv(catalogToRows(catalog.products))], { type: 'text/csv;charset=utf-8' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
