/**
 * Génère les fichiers de démonstration (fictifs) utilisés par le scénario et les tests e2e :
 *  - demo-assets/plan-exemple.png : plan scanné fictif (avec une cote de référence)
 *  - demo-assets/plan-exemple.pdf : le même plan au format PDF
 *  - demo-assets/catalogue-exemple.xlsx : catalogue à importer (mise à jour + nouveautés + erreurs)
 * Usage : node scripts/generate-demo-assets.mjs
 */
import { chromium } from '@playwright/test';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import { writeFileSync } from 'node:fs';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#fbfaf6"/>
  <g stroke="#222" stroke-width="10" fill="none" stroke-linecap="square">
    <rect x="100" y="100" width="1000" height="560"/>
    <line x1="500" y1="100" x2="500" y2="420"/>
    <line x1="500" y1="420" x2="1100" y2="420"/>
    <line x1="780" y1="420" x2="780" y2="660"/>
  </g>
  <g fill="#fbfaf6"><rect x="300" y="650" width="90" height="20"/><rect x="1090" y="200" width="20" height="150"/></g>
  <g font-family="Arial" font-size="30" fill="#333">
    <text x="230" y="300">Séjour</text><text x="720" y="270">Chambre</text>
    <text x="580" y="560">Cuisine</text><text x="880" y="560">SdB</text>
  </g>
  <g stroke="#c00" stroke-width="2"><line x1="100" y1="720" x2="1100" y2="720"/><line x1="100" y1="705" x2="100" y2="735"/><line x1="1100" y1="705" x2="1100" y2="735"/></g>
  <text x="560" y="760" font-family="Arial" font-size="28" fill="#c00">10,00 m</text>
  <text x="100" y="60" font-family="Arial" font-size="24" fill="#666">Plan fictif – démonstration (échelle : cote rouge = 10,00 m)</text>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
const png = await page.screenshot({ type: 'png' });
writeFileSync('demo-assets/plan-exemple.png', png);
await browser.close();

const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [1200, 800], compress: true });
pdf.addImage(`data:image/png;base64,${png.toString('base64')}`, 'PNG', 0, 0, 1200, 800, undefined, 'FAST');
writeFileSync('demo-assets/plan-exemple.pdf', Buffer.from(pdf.output('arraybuffer')));

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Catalogue');
ws.addRow(['Référence produit', 'Nom', 'Catégorie', 'Description', 'Prix matériel', 'Supplément mensuel', 'Type de facturation', 'Quantité incluse dans un pack', 'Statut', 'Commentaires']);
ws.addRow(['DEMO-FUM-01', 'Détecteur de fumée', 'Détecteur de fumée', 'Détecteur de fumée connecté.', 139, 2, 'Unitaire', 1, 'Actif', 'Prix fictif modifié pour la démonstration']);
ws.addRow(['DEMO-CAM-01', 'Caméra intérieure (exemple)', 'Autre', 'Produit fictif ajouté par import', 199, 3, 'Unitaire', 1, 'Actif', '']);
ws.addRow(['DEMO-CAM-01', 'Caméra intérieure (doublon)', 'Autre', '', 199, 3, 'Unitaire', 1, 'Actif', 'Doublon volontaire']);
ws.addRow(['DEMO-ERR-01', 'Produit avec prix invalide', 'Détecteur de fumée', '', 'douze euros', 2, 'Unitaire', 1, 'Actif', 'Erreur volontaire']);
ws.addRow(['DEMO-CHOC-01', "Détecteur de choc et d'ouverture", "Détecteur de choc et d'ouverture", 'Détecte les chocs et ouvertures sur une porte ou une fenêtre.', 79, 2, 'Unitaire', 1, 'Actif', '']);
ws.columns.forEach((c) => (c.width = 26));
writeFileSync('demo-assets/catalogue-exemple.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
console.log('Fichiers de démonstration générés dans demo-assets/');
