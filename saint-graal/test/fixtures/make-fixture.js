// Génère un classeur de TEST qui reproduit la structure d'un export « Advanced Find » du CRM
// (onglet de données + Feuil1 + Feuil2 + hiddenSheet très masqué). Données 100 % fictives.
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENTETES = ['Contract Number', 'Installation', 'Next Invoice Date', 'Activated Date', 'Last Income Date',
  'Case Reason', 'Customer Portfolio', 'Product Line', 'Last LID population date', 'Modified By', 'Commentaire',
  'Termination Date (TEST)'];

const d = (y, m, j) => new Date(Date.UTC(y, m - 1, j));
export const LIGNES = [
  ['C-SFR-00214829', 'INS-000101', d(2026, 11, 10), d(2023, 2, 1), null, 'Customer Deceased', 'Résidentiel', 'Alarme', null, 'Chloé TEST', '', d(2026, 11, 4)],
  ['C-SFR-00000417', 'INS-000102', d(2026, 11, 25), d(2022, 5, 3), null, 'Moves to new address', 'Résidentiel', 'Alarme', null, 'Kader TEST', '', d(2026, 11, 2)],
  ['C-SFR-00330001', 'INS-000103', d(2026, 11, 4), d(2021, 9, 9), null, 'SSE / B2B - End of business', 'Pro', 'Alarme', null, 'Estef TEST', 'à voir', d(2026, 11, 10)],
  ['C-SFR-00330002', 'INS-000104', d(2026, 11, 15), d(2021, 9, 9), null, 'Motif inexistant', 'Pro', 'Alarme', null, 'Marc Antoine TEST', '', d(2026, 11, 1)],
  ['C-SFR-00330003', 'INS-000105', d(2026, 11, 15), d(2021, 9, 9), null, 'Customer Deceased', 'Pro', 'Alarme', null, 'Autre Personne', '', d(2026, 11, 1)],
  ['C-SFR-00999999', 'INS-000106', d(2026, 11, 15), d(2021, 9, 9), null, 'Customer Deceased', 'Pro', 'Alarme', null, 'Kader TEST', '', d(2026, 11, 1)],
  ['C-SFR-00330004', 'INS-000107', d(2026, 11, 20), d(2021, 9, 9), null, 'Customer Deceased', 'Pro', 'Alarme', d(2026, 10, 1), 'Chloé TEST', '', d(2026, 11, 1)],
];

export async function creerFixture(dest) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Contract Advanced Find View');
  ws.addRow(ENTETES).font = { bold: true };
  for (const l of LIGNES) {
    const r = ws.addRow(l);
    r.getCell(1).numFmt = '@';
    [3, 4, 5, 9, 12].forEach((c) => { r.getCell(c).numFmt = 'dd/mm/yyyy'; });
  }
  wb.addWorksheet('Feuil1').addRow(['Note interne', 42]);
  wb.addWorksheet('Feuil2').addRow(['Autre', 'donnée']);
  const h = wb.addWorksheet('hiddenSheet', { state: 'veryHidden' });
  h.addRow(['contract:TEST-METADATA']);
  await wb.xlsx.writeFile(dest);
  return dest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dest = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), 'classeur-test.xlsx');
  creerFixture(dest).then((p) => console.log('Classeur de test créé :', p));
}
