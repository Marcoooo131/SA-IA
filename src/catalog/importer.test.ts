import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { applyImport, autoMapColumns, buildImportPreview, catalogToRows, parseCategory, parseCsv, rowsToCsv } from './importer';
import { createDefaultCatalog } from './defaultCatalog';
import { parsePrice } from '@/lib/format';

const catalog = createDefaultCatalog();
const HEADER = ['Référence produit', 'Nom', 'Catégorie', 'Description', 'Prix matériel', 'Supplément mensuel', 'Type de facturation', 'Quantité incluse dans un pack', 'Statut', 'Commentaires'];

describe('import du catalogue', () => {
  it('associe automatiquement les colonnes, y compris avec des libellés approchants', () => {
    const m = autoMapColumns(['REF', 'Libellé', 'Famille', 'Prix', 'Abonnement', 'Statut']);
    expect(m.reference).toBe(0);
    expect(m.name).toBe(1);
    expect(m.category).toBe(2);
    expect(m.priceInitial).toBe(3);
    expect(m.monthly).toBe(4);
    expect(m.status).toBe(5);
    expect(m.description).toBeNull();
  });

  it('valide les prix (formats français, négatifs, invalides)', () => {
    expect(parsePrice('149,00 €')).toBe(149);
    expect(parsePrice('1 234,50')).toBe(1234.5);
    expect(parsePrice('1.234,50')).toBe(1234.5);
    expect(parsePrice('2 €/mois')).toBe(2);
    expect(parsePrice('')).toBeUndefined();
    expect(Number.isNaN(parsePrice('abc'))).toBe(true);
    const rows = [
      HEADER,
      ['A-1', 'Produit A', 'Détecteur de fumée', '', '-5', '2', 'Unitaire', '1', 'Actif', ''],
      ['A-2', 'Produit B', 'Détecteur de fumée', '', 'douze', '2', 'Unitaire', '1', 'Actif', ''],
      ['A-3', 'Produit C', 'Détecteur de fumée', '', '', '2', 'Unitaire', '1', 'Actif', ''],
      ['A-4', 'Produit D', 'Centrale', '', '', '', 'Forfait', '1', 'Actif', ''],
    ];
    const p = buildImportPreview(rows, autoMapColumns(HEADER), catalog.products);
    expect(p.rows[0].errors).toContain('Prix matériel négatif.');
    expect(p.rows[1].errors[0]).toMatch(/Prix matériel invalide/);
    expect(p.rows[2].errors).toContain('Prix matériel manquant.');
    expect(p.rows[3].action).toBe('creer');
    expect(p.rows[3].product!.priceInitial).toBeNull();
    expect(p.rows[3].warnings.join(' ')).toMatch(/à confirmer/);
  });

  it('détecte les doublons dans le fichier et les produits existants', () => {
    const rows = [
      HEADER,
      ['DEMO-FUM-01', 'Détecteur de fumée', 'Détecteur de fumée', 'Détecteur de fumée connecté.', '159', '2', 'Unitaire', '1', 'Actif', ''],
      ['NEW-1', 'Caméra', 'Autre', '', '199', '3', 'Unitaire', '1', 'Actif', ''],
      ['new-1', 'Caméra bis', 'Autre', '', '199', '3', 'Unitaire', '1', 'Actif', ''],
      ['DEMO-CHOC-01', "Détecteur de choc et d'ouverture", "Détecteur de choc et d'ouverture", 'Détecte les chocs et ouvertures sur une porte ou une fenêtre.', '79', '2', 'Unitaire', '1', 'Actif', ''],
    ];
    const p = buildImportPreview(rows, autoMapColumns(HEADER), catalog.products);
    expect(p.rows[0].action).toBe('mettre_a_jour');
    expect(p.rows[0].changes).toEqual([{ field: 'Prix matériel', before: 149, after: 159 }]);
    expect(p.rows[1].action).toBe('creer');
    expect(p.rows[2].action).toBe('erreur');
    expect(p.rows[2].errors[0]).toMatch(/Doublon dans le fichier/);
    expect(p.rows[3].action).toBe('identique');
    expect(p.summary).toMatchObject({ creer: 1, mettre_a_jour: 1, identique: 1, erreur: 1 });
  });

  it('signale les champs et colonnes obligatoires manquants', () => {
    const p = buildImportPreview([['Nom', 'Prix'], ['X', '10']], autoMapColumns(['Nom', 'Prix']), catalog.products);
    expect(p.missingRequiredColumns.map((c) => c.key)).toEqual(['reference', 'category']);
    expect(() => applyImport(catalog, p, { updateExisting: true })).toThrow();
    const p2 = buildImportPreview([HEADER, ['', '', '', '', '10', '', '', '', '', '']], autoMapColumns(HEADER), catalog.products);
    expect(p2.rows[0].errors).toEqual(expect.arrayContaining(['Référence manquante.', 'Nom manquant.', 'Catégorie manquante.']));
  });

  it("n'écrase jamais silencieusement le catalogue existant", () => {
    const rows = [
      HEADER,
      ['DEMO-FUM-01', 'Détecteur de fumée', 'Détecteur de fumée', 'Détecteur de fumée connecté.', '159', '2', 'Unitaire', '1', 'Actif', ''],
      ['NEW-1', 'Caméra', 'Autre', '', '199', '3', 'Unitaire', '1', 'Inactif', ''],
    ];
    const p = buildImportPreview(rows, autoMapColumns(HEADER), catalog.products);
    const keep = applyImport(catalog, p, { updateExisting: false });
    expect(keep.created).toBe(1);
    expect(keep.updated).toBe(0);
    expect(keep.catalog.products.find((x) => x.reference === 'DEMO-FUM-01')!.priceInitial).toBe(149);
    expect(keep.catalog.products).toHaveLength(catalog.products.length + 1);
    expect(keep.catalog.products.find((x) => x.reference === 'NEW-1')!.active).toBe(false);
    const upd = applyImport(catalog, p, { updateExisting: true });
    expect(upd.updated).toBe(1);
    const fum = upd.catalog.products.find((x) => x.reference === 'DEMO-FUM-01')!;
    expect(fum.priceInitial).toBe(159);
    expect(fum.id).toBe('prd_fumee'); // identifiant conservé : packs toujours valides
    // le catalogue d'origine n'est pas modifié
    expect(catalog.products.find((x) => x.reference === 'DEMO-FUM-01')!.priceInitial).toBe(149);
  });

  it('ramène la mensualité de la centrale à 0 € et exige une confirmation explicite', () => {
    const rows = [HEADER, ['DEMO-CENT-01', 'Centrale', 'Centrale', '', '459', '3', 'Unitaire', '1', 'Actif', '']];
    const p = buildImportPreview(rows, autoMapColumns(HEADER), catalog.products);
    expect(p.rows[0].centraleMonthlyConflict).toBe(3);
    expect(p.rows[0].product!.monthly).toBe(0);
    expect(p.rows[0].warnings.join(' ')).toMatch(/règle validée \(0 €\)/);
    expect(() => applyImport(catalog, p, { updateExisting: true })).toThrow(/Confirmez/);
    const res = applyImport(catalog, p, { updateExisting: true, confirmCentraleRule: true });
    const c = res.catalog.products.find((x) => x.reference === 'DEMO-CENT-01')!;
    expect(c.priceInitial).toBe(459);
    expect(c.monthly).toBe(0);
  });

  it('reconnaît les catégories en libellé ou en code', () => {
    expect(parseCategory("Détecteur de choc et d'ouverture")).toBe('detecteur_choc');
    expect(parseCategory('detecteur_fumee')).toBe('detecteur_fumee');
    expect(parseCategory('Pack périmétrique')).toBe('pack_perimetrique');
    expect(parseCategory('Boîtier Save')).toBe('boitier_save');
    expect(parseCategory('xyz')).toBeUndefined();
  });

  it('lit un CSV (séparateur ; et guillemets) et réexporte le catalogue', () => {
    const csv = rowsToCsv(catalogToRows(catalog.products));
    const rows = parseCsv(csv);
    expect(rows[0][0]).toBe('Référence produit');
    expect(rows).toHaveLength(catalog.products.length + 1);
    const p = buildImportPreview(rows, autoMapColumns(rows[0]), catalog.products);
    expect(p.summary.identique).toBe(catalog.products.length);
    expect(parseCsv('a;b\n"x;y";"z ""q"""')).toEqual([['a', 'b'], ['x;y', 'z "q"']]);
  });

  it('lit un vrai fichier Excel (.xlsx) produit par ExcelJS', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Catalogue');
    ws.addRow(HEADER);
    ws.addRow(['XLS-1', 'Détecteur test', 'Détecteur de fumée', 'desc', 139.5, 2, 'Unitaire', 1, 'Actif', '']);
    const buffer = await wb.xlsx.writeBuffer();
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const rows: unknown[][] = [];
    wb2.worksheets[0].eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
    const p = buildImportPreview(rows, autoMapColumns(rows[0]), catalog.products);
    expect(p.rows[0].action).toBe('creer');
    expect(p.rows[0].product!.priceInitial).toBe(139.5);
  });
});
