import type { BillingType, Catalog, Product, ProductCategory } from '@/domain/types';
import { parsePrice } from '@/lib/format';
import { uid } from '@/lib/id';
import { CATEGORY_LABELS } from '@/domain/labels';

/**
 * Import de catalogue (Excel / CSV) : fonctions pures, testées.
 * Étapes : lecture -> correspondance des colonnes -> aperçu validé -> application explicite.
 * Le catalogue existant n'est JAMAIS écrasé silencieusement : chaque ligne indique
 * son action (création, mise à jour, identique, erreur) et l'application est confirmée.
 */

export type ColumnKey =
  | 'reference'
  | 'name'
  | 'category'
  | 'description'
  | 'priceInitial'
  | 'monthly'
  | 'billing'
  | 'packQuantity'
  | 'status'
  | 'comments';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  required: boolean;
  aliases: string[];
  example: string;
}

export const IMPORT_COLUMNS: ColumnDef[] = [
  { key: 'reference', label: 'Référence produit', required: true, aliases: ['reference', 'ref', 'sku', 'code', 'reference produit', 'code article'], example: 'DEMO-CHOC-01' },
  { key: 'name', label: 'Nom', required: true, aliases: ['nom', 'name', 'libelle', 'designation', 'produit', 'nom du produit'], example: "Détecteur de choc et d'ouverture" },
  { key: 'category', label: 'Catégorie', required: true, aliases: ['categorie', 'category', 'famille', 'type de produit'], example: "Détecteur de choc et d'ouverture" },
  { key: 'description', label: 'Description', required: false, aliases: ['description', 'desc', 'detail'], example: 'Détecte chocs et ouvertures' },
  { key: 'priceInitial', label: 'Prix matériel', required: true, aliases: ['prix materiel', 'prix', 'price', 'prix unitaire', 'tarif', 'prix materiel (eur)', 'frais materiel'], example: '79' },
  { key: 'monthly', label: 'Supplément mensuel', required: false, aliases: ['supplement mensuel', 'mensuel', 'monthly', 'abonnement', 'prix mensuel', 'supplement'], example: '2' },
  { key: 'billing', label: 'Type de facturation', required: false, aliases: ['type de facturation', 'facturation', 'billing', 'mode de facturation'], example: 'Unitaire' },
  { key: 'packQuantity', label: 'Quantité incluse dans un pack', required: false, aliases: ['quantite incluse dans un pack', 'quantite incluse', 'quantite pack', 'qte pack', 'pack quantity', 'quantite'], example: '1' },
  { key: 'status', label: 'Statut', required: false, aliases: ['statut', 'status', 'actif', 'etat'], example: 'Actif' },
  { key: 'comments', label: 'Commentaires', required: false, aliases: ['commentaires', 'commentaire', 'comments', 'remarques', 'notes'], example: '' },
];

export type ColumnMapping = Record<ColumnKey, number | null>;

export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9()/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function autoMapColumns(headers: unknown[]): ColumnMapping {
  const normalized = headers.map(normalizeText);
  const mapping = {} as ColumnMapping;
  const used = new Set<number>();
  for (const col of IMPORT_COLUMNS) {
    const candidates = [normalizeText(col.label), ...col.aliases.map(normalizeText)];
    let idx = normalized.findIndex((h, i) => !used.has(i) && candidates.includes(h));
    if (idx < 0) idx = normalized.findIndex((h, i) => !used.has(i) && h && candidates.some((c) => h.startsWith(c)));
    mapping[col.key] = idx >= 0 ? idx : null;
    if (idx >= 0) used.add(idx);
  }
  return mapping;
}

const CATEGORY_SYNONYMS: [ProductCategory, string[]][] = [
  ['pack_perimetrique', ['pack perimetrique', 'pack_perimetrique', 'perimetrique']],
  ['detecteur_choc', ['detecteur de choc et d ouverture', 'detecteur_choc', 'choc', 'ouverture', 'detecteur d ouverture', 'contact']],
  ['detecteur_mouvement', ['detecteur de mouvement avec photographie', 'detecteur_mouvement', 'mouvement', 'detecteur de mouvement', 'photo']],
  ['detecteur_fumee', ['detecteur de fumee', 'detecteur_fumee', 'fumee']],
  ['sirene_interieure', ['sirene interieure', 'sirene_interieure']],
  ['sirene_exterieure', ['sirene exterieure', 'sirene_exterieure']],
  ['boitier_save', ['boitier save', 'boitier_save', 'save']],
  ['centrale', ['centrale', 'panel', 'hub']],
  ['clavier', ['clavier', 'keypad']],
  ['autre', ['autre', 'other', 'divers', 'autre produit']],
];

export function parseCategory(raw: unknown): ProductCategory | undefined {
  const v = normalizeText(raw).replace(/_/g, ' ');
  if (!v) return undefined;
  for (const [cat, syns] of CATEGORY_SYNONYMS) {
    if (syns.some((s) => normalizeText(s).replace(/_/g, ' ') === v)) return cat;
    if (normalizeText(CATEGORY_LABELS[cat]) === v) return cat;
  }
  for (const [cat, syns] of CATEGORY_SYNONYMS) if (syns.some((s) => v.includes(normalizeText(s).replace(/_/g, ' ')))) return cat;
  return undefined;
}

export function parseBilling(raw: unknown): BillingType | undefined | null {
  const v = normalizeText(raw);
  if (!v) return undefined;
  if (v.startsWith('unit') || v.includes('materiel') || v.includes('achat')) return 'unitaire';
  if (v.startsWith('lot') || v.includes('bundle')) return 'lot';
  if (v.includes('forfait') || v.includes('inclus') || v.includes('pack')) return 'forfait';
  if (v.includes('devis') || v.includes('quote')) return 'sur_devis';
  return null;
}

export function parseStatus(raw: unknown): boolean | undefined | null {
  const v = normalizeText(raw);
  if (!v) return undefined;
  if (['actif', 'active', 'oui', 'yes', '1', 'true', 'vrai', 'on'].includes(v)) return true;
  if (['inactif', 'inactive', 'non', 'no', '0', 'false', 'faux', 'off', 'desactive'].includes(v)) return false;
  return null;
}

export type RowAction = 'creer' | 'mettre_a_jour' | 'identique' | 'erreur';

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface PreviewRow {
  rowNumber: number;
  /** Valeurs lues (affichées même si la ligne est en erreur). */
  reference: string;
  name: string;
  product: Product | null;
  errors: string[];
  warnings: string[];
  action: RowAction;
  existingId?: string;
  changes: FieldChange[];
}

export interface ImportPreview {
  rows: PreviewRow[];
  summary: Record<RowAction, number> & { total: number; warnings: number };
  missingRequiredColumns: ColumnDef[];
}

const COMPARED_FIELDS: (keyof Product)[] = ['name', 'category', 'description', 'priceInitial', 'monthly', 'billing', 'packQuantity', 'active', 'comments'];
const FIELD_LABELS: Partial<Record<keyof Product, string>> = {
  name: 'Nom',
  category: 'Catégorie',
  description: 'Description',
  priceInitial: 'Prix matériel',
  monthly: 'Supplément mensuel',
  billing: 'Facturation',
  packQuantity: 'Quantité pack',
  active: 'Statut',
  comments: 'Commentaires',
};

const cell = (row: unknown[], idx: number | null) => (idx === null || idx === undefined ? undefined : row[idx]);
const isBlankRow = (row: unknown[]) => row.every((c) => c === null || c === undefined || String(c).trim() === '');

export function buildImportPreview(rows: unknown[][], mapping: ColumnMapping, existing: Product[], headerRowIndex = 0): ImportPreview {
  const missingRequiredColumns = IMPORT_COLUMNS.filter((c) => c.required && mapping[c.key] === null);
  const byRef = new Map(existing.map((p) => [p.reference.trim().toUpperCase(), p]));
  const seen = new Map<string, number>();
  const out: PreviewRow[] = [];

  rows.forEach((row, i) => {
    if (i <= headerRowIndex || !row || isBlankRow(row)) return;
    const rowNumber = i + 1;
    const errors: string[] = [];
    const warnings: string[] = [];

    const reference = String(cell(row, mapping.reference) ?? '').trim();
    const name = String(cell(row, mapping.name) ?? '').trim();
    if (!reference) errors.push('Référence manquante.');
    if (!name) errors.push('Nom manquant.');

    const rawCat = cell(row, mapping.category);
    let category = parseCategory(rawCat);
    if (!String(rawCat ?? '').trim()) errors.push('Catégorie manquante.');
    else if (!category) {
      category = 'autre';
      warnings.push(`Catégorie « ${String(rawCat)} » inconnue : classée en « Autre produit ».`);
    }

    let billing = parseBilling(cell(row, mapping.billing));
    if (billing === null) {
      errors.push(`Type de facturation « ${String(cell(row, mapping.billing))} » non reconnu.`);
      billing = undefined;
    }
    if (billing === undefined) {
      billing = category === 'pack_perimetrique' ? 'lot' : 'unitaire';
      if (mapping.billing !== null) warnings.push('Type de facturation non renseigné : « unitaire » retenu.');
    }

    const priceOptional = billing === 'forfait' || billing === 'sur_devis';
    const price = parsePrice(cell(row, mapping.priceInitial));
    let priceInitial: number | null = null;
    if (price === undefined) {
      if (priceOptional) warnings.push('Prix matériel non renseigné : « à confirmer ».');
      else errors.push('Prix matériel manquant.');
    } else if (Number.isNaN(price)) errors.push(`Prix matériel invalide (« ${String(cell(row, mapping.priceInitial))} »).`);
    else if (price < 0) errors.push('Prix matériel négatif.');
    else {
      priceInitial = Math.round(price * 100) / 100;
      if (price > 20000) warnings.push('Prix matériel inhabituellement élevé : à vérifier.');
    }

    const m = parsePrice(cell(row, mapping.monthly));
    let monthly: number | null = null;
    if (m === undefined) warnings.push('Supplément mensuel non renseigné : « à confirmer ».');
    else if (Number.isNaN(m)) errors.push(`Supplément mensuel invalide (« ${String(cell(row, mapping.monthly))} »).`);
    else if (m < 0) errors.push('Supplément mensuel négatif.');
    else {
      monthly = Math.round(m * 100) / 100;
      if (m > 500) warnings.push('Supplément mensuel inhabituellement élevé : à vérifier.');
    }

    let packQuantity = 1;
    const rawQty = cell(row, mapping.packQuantity);
    if (rawQty !== undefined && rawQty !== null && String(rawQty).trim() !== '') {
      const q = Number(String(rawQty).replace(',', '.'));
      if (!Number.isInteger(q) || q < 1) errors.push(`Quantité incluse invalide (« ${String(rawQty)} »).`);
      else packQuantity = q;
    } else if (category === 'pack_perimetrique') {
      warnings.push('Quantité incluse non renseignée pour un lot.');
    }

    let active = true;
    const st = parseStatus(cell(row, mapping.status));
    if (st === null) errors.push(`Statut « ${String(cell(row, mapping.status))} » non reconnu (Actif / Inactif).`);
    else if (st !== undefined) active = st;

    const refKey = reference.toUpperCase();
    if (reference) {
      if (seen.has(refKey)) errors.push(`Doublon dans le fichier : même référence qu'à la ligne ${seen.get(refKey)}.`);
      else seen.set(refKey, rowNumber);
    }

    const existingProduct = reference ? byRef.get(refKey) : undefined;
    const product: Product | null =
      errors.length === 0 && category && billing
        ? {
            id: existingProduct?.id ?? uid('prd'),
            reference,
            name,
            category,
            description: String(cell(row, mapping.description) ?? '').trim(),
            priceInitial,
            monthly,
            billing,
            packQuantity,
            bundleOf: category === 'pack_perimetrique' ? 'detecteur_choc' : existingProduct?.bundleOf,
            icon: existingProduct?.icon ?? category,
            compatibility: existingProduct?.compatibility ?? '',
            active,
            comments: String(cell(row, mapping.comments) ?? '').trim(),
            specs: existingProduct?.specs,
          }
        : null;

    let action: RowAction = errors.length ? 'erreur' : 'creer';
    const changes: FieldChange[] = [];
    if (!errors.length && existingProduct && product) {
      for (const f of COMPARED_FIELDS) {
        if (f === 'description' && !product.description && mapping.description === null) continue;
        if (f === 'comments' && mapping.comments === null) continue;
        if (existingProduct[f] !== product[f]) changes.push({ field: FIELD_LABELS[f] ?? f, before: existingProduct[f], after: product[f] });
      }
      action = changes.length ? 'mettre_a_jour' : 'identique';
    }
    out.push({ rowNumber, reference, name, product, errors, warnings, action, existingId: existingProduct?.id, changes });
  });

  const summary = { creer: 0, mettre_a_jour: 0, identique: 0, erreur: 0, total: out.length, warnings: 0 };
  for (const r of out) {
    summary[r.action]++;
    if (r.warnings.length) summary.warnings++;
  }
  return { rows: out, summary, missingRequiredColumns };
}

export interface ApplyOptions {
  /** Mettre à jour les produits existants (sinon ils sont conservés tels quels). */
  updateExisting: boolean;
}

/**
 * Applique un aperçu validé. Les lignes en erreur sont ignorées.
 * Les produits du catalogue absents du fichier sont CONSERVÉS.
 */
export function applyImport(catalog: Catalog, preview: ImportPreview, options: ApplyOptions): { catalog: Catalog; created: number; updated: number } {
  if (preview.missingRequiredColumns.length) throw new Error('Colonnes obligatoires non associées.');
  const products = catalog.products.map((p) => ({ ...p }));
  let created = 0;
  let updated = 0;
  for (const row of preview.rows) {
    if (!row.product) continue;
    if (row.action === 'creer') {
      products.push(row.product);
      created++;
    } else if (row.action === 'mettre_a_jour' && options.updateExisting) {
      const idx = products.findIndex((p) => p.id === row.existingId);
      if (idx >= 0) {
        products[idx] = { ...products[idx], ...row.product, id: products[idx].id };
        updated++;
      }
    }
  }
  return { catalog: { ...catalog, products }, created, updated };
}

/** Lignes du modèle / de l'export (en-têtes + produits). */
export function catalogToRows(products: Product[]): (string | number)[][] {
  const header = IMPORT_COLUMNS.map((c) => c.label);
  const billingLabel = { unitaire: 'Unitaire', lot: 'Lot', forfait: 'Forfait', sur_devis: 'Sur devis' } as const;
  const rows = products.map((p) => [
    p.reference,
    p.name,
    CATEGORY_LABELS[p.category],
    p.description,
    p.priceInitial ?? '',
    p.monthly ?? '',
    billingLabel[p.billing],
    p.packQuantity,
    p.active ? 'Actif' : 'Inactif',
    p.comments,
  ]);
  return [header, ...rows];
}

/** Lecteur CSV simple (séparateur ; ou , détecté, guillemets gérés). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function rowsToCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}
