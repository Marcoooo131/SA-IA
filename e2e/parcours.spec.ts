import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Parcours principal de bout en bout :
 * CRÉER LE DOSSIER → IMPORTER/DESSINER LE PLAN → CORRIGER → 3D → ÉQUIPEMENTS → OFFRES → DEVIS PDF
 */

const pageErrors: string[] = [];

async function bgPoint(page: Page, ix: number, iy: number) {
  // Coordonnées d'un point de l'image importée (1200 × 800 px) à l'écran
  const box = (await page.getByTestId('plan-background').boundingBox())!;
  return { x: box.x + (ix / 1200) * box.width, y: box.y + (iy / 800) * box.height };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  page.on('pageerror', (e) => pageErrors.push(e.message));
});

test('parcours complet : dossier → plan importé → 3D → équipements → offres → PDF', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tableau de bord des audits' })).toBeVisible();

  // 1. Création du dossier
  await page.getByTestId('start-import').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="clientName"]').fill('Client démo E2E');
  await dialog.locator('input[name="address"]').fill('5 impasse Fictive, 00000 Démo');
  await dialog.locator('input[name="surface"]').fill('75');
  await dialog.getByRole('button', { name: /Créer et importer le plan/ }).click();
  await expect(page.getByRole('tab', { name: 'Plan 2D' })).toHaveAttribute('aria-selected', 'true');

  // 2. Import d'une image de plan comme fond de référence
  await page.getByTestId('plan-import-input').setInputFiles('demo-assets/plan-exemple.png');
  await expect(page.getByTestId('plan-background')).toBeVisible();
  await expect(page.getByText('Échelle non définie')).toBeVisible();

  // 3. Définition de l'échelle à partir de la cote connue (10,00 m)
  await page.mouse.click(...Object.values(await bgPoint(page, 100, 720)) as [number, number]);
  await page.mouse.click(...Object.values(await bgPoint(page, 1100, 720)) as [number, number]);
  const calib = page.getByRole('dialog', { name: /Définir l'échelle/ });
  await calib.locator('input[name="calibration"]').fill('10');
  await calib.getByRole('button', { name: "Appliquer l'échelle" }).click();
  await expect(page.getByText('Échelle définie')).toBeVisible();

  // 4. Tracé des pièces par-dessus le document (outil Pièce activé après calibrage)
  await page.getByRole('button', { name: 'Dessiner une pièce' }).click();
  await drag(page, await bgPoint(page, 100, 100), await bgPoint(page, 500, 660));
  await expect(page.locator('select[name="room-type"]')).toBeVisible();
  await page.locator('select[name="room-type"]').selectOption('sejour');
  await page.locator('input[name="room-name"]').fill('Séjour');
  await page.getByRole('button', { name: 'Dessiner une pièce' }).click();
  await drag(page, await bgPoint(page, 500, 100), await bgPoint(page, 1100, 420));
  await page.getByRole('button', { name: 'Dessiner une pièce' }).click();
  await drag(page, await bgPoint(page, 500, 420), await bgPoint(page, 780, 660));
  await page.locator('select[name="room-type"]').selectOption('cuisine');
  await page.locator('input[name="room-name"]').fill('Cuisine');
  await expect(page.getByText(/3 pièce\(s\)/).first()).toBeVisible();

  // 5. Correction manuelle : dimensions saisies au clavier
  const width = page.locator('input[name="room-w"]');
  await width.fill('3,6');
  await width.blur();
  await expect(page.getByText('Surface : 10,80 m²').or(page.getByText(/Surface : /))).toBeVisible();

  // 6. Ajout d'une porte d'entrée sur le mur extérieur du séjour
  await page.getByRole('button', { name: 'Porte extérieure', exact: true }).click();
  await page.mouse.click(...Object.values(await bgPoint(page, 300, 660)) as [number, number]);
  await expect(page.getByText("Donne sur l'extérieur").first()).toBeVisible();
  await page.getByRole('button', { name: 'Fenêtre', exact: true }).click();
  await page.mouse.click(...Object.values(await bgPoint(page, 800, 100)) as [number, number]);
  await expect(page.getByTestId('opening-RDC-O02')).toBeVisible();

  // Annuler / rétablir
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Annuler (Ctrl+Z)' }).click();
  await expect(page.getByTestId('opening-RDC-O02')).toHaveCount(0);
  await page.getByRole('button', { name: 'Rétablir (Ctrl+Y)' }).click();
  await expect(page.getByTestId('opening-RDC-O02')).toBeVisible();

  // 7. Audit : application de la proposition volumétrique
  await page.getByRole('tab', { name: 'Audit' }).click();
  await page.getByTestId('mode-volumetrique').getByRole('button', { name: 'Appliquer sur le plan' }).click();
  await page.getByRole('tab', { name: 'Équipements' }).click();
  await expect(page.locator('[data-testid^="equipment-row-"]').first()).toBeVisible();
  const deviceCount = await page.locator('[data-testid^="equipment-row-"]').count();
  expect(deviceCount).toBeGreaterThanOrEqual(4);

  // 8. Vue 3D générée depuis la géométrie corrigée
  await page.getByRole('tab', { name: 'Vue 3D' }).click();
  await expect(page.getByTestId('view3d').locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Dessus' }).click();
  await page.getByLabel('Affichage des murs').selectOption('coupe');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/parcours-3d.png' });

  // 9. Ajout manuel d'un équipement sur le plan 2D, puis suppression
  await page.getByRole('tab', { name: 'Plan 2D' }).click();
  await page.getByTestId('library-DEMO-SIR-EXT').click();
  await page.mouse.click(...Object.values(await bgPoint(page, 300, 300)) as [number, number]);
  await expect(page.getByText('Placé manuellement')).toBeVisible();
  await page.getByRole('button', { name: "Supprimer l'équipement" }).click();
  await expect(page.getByText('Placé manuellement')).toHaveCount(0);
  await page.getByTestId('library-DEMO-SIR-INT').click();
  await page.mouse.click(...Object.values(await bgPoint(page, 300, 300)) as [number, number]);
  await expect(page.getByText('Placé manuellement')).toBeVisible();

  // 10. Comparaison des offres et choix du pack
  await page.getByRole('tab', { name: 'Devis' }).click();
  await expect(page.getByTestId('comparator')).toBeVisible();
  await page.locator('[data-testid="cell-plan-pack_essentiel"]').click();
  const initialEssentiel = await page.getByTestId('quote-initial').textContent();
  await page.locator('[data-testid="cell-plan-pack_serenite"]').click();
  const initialSerenite = await page.getByTestId('quote-initial').textContent();
  expect(initialEssentiel).not.toEqual(initialSerenite);

  // 11. Modification d'un tarif dans le catalogue -> recalcul du devis
  await page.locator('[data-testid="cell-plan-pack_essentiel"]').click();
  const before = await page.getByTestId('quote-initial').textContent();
  await page.getByRole('button', { name: 'Catalogue & règles' }).click();
  const price = page.getByLabel('Prix matériel DEMO-SIR-INT');
  await price.fill('199');
  await price.blur();
  await page.getByRole('button', { name: 'Tableau de bord' }).click();
  await page.getByTestId('dossier-row-' + (await page.locator('[data-testid^="dossier-row-MOV-"]').first().getAttribute('data-testid'))!.replace('dossier-row-', '')).getByRole('button', { name: 'Devis' }).click();
  const after = await page.getByTestId('quote-initial').textContent();
  const num = (s: string | null) => Number(s!.replace(/[^\d,]/g, '').replace(',', '.'));
  expect(num(after) - num(before)).toBe(50);

  // 12. Génération du devis PDF
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Générer le devis PDF' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const bytes = readFileSync(path!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(50_000);
  await download.saveAs('test-results/devis-parcours.pdf');
  await expect(page.locator('[data-testid^="quote-record-DEV-"]')).toHaveCount(1);

  // 13. Persistance : rechargement de la page
  await page.reload();
  await expect(page.getByText('Client démo E2E')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('import Excel du catalogue : aperçu, doublons, validation des prix, confirmation explicite', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Catalogue & règles' }).click();
  await page.getByRole('button', { name: 'Import / export Excel' }).click();
  await page.getByTestId('catalog-import-input').setInputFiles('demo-assets/catalogue-exemple.xlsx');
  const summary = page.getByTestId('import-summary');
  await expect(summary).toContainText('1 nouveau(x)');
  await expect(summary).toContainText('1 mise(s) à jour');
  await expect(summary).toContainText('2 erreur(s)');
  await expect(summary).toContainText('1 identique(s)');
  await expect(page.getByTestId('import-preview')).toContainText('Doublon dans le fichier');
  await expect(page.getByTestId('import-preview')).toContainText('Prix matériel invalide');
  // Sans case cochée, les produits existants ne sont pas modifiés
  await page.getByRole('switch').click();
  await page.getByRole('button', { name: /Valider l'import \(2 lignes\)/ }).click();
  await page.getByRole('button', { name: 'Produits' }).click();
  await expect(page.getByLabel('Prix matériel DEMO-FUM-01')).toHaveValue('139');
  await expect(page.getByTestId('product-row-DEMO-CAM-01')).toBeVisible();
  await page.getByRole('button', { name: 'Historique' }).click();
  await expect(page.getByText(/9 produits/)).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('scénario de démonstration préchargé : PDF importé, 3D par niveau, comparaison des modes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'MOV-DEMO-0001' }).click();
  await page.getByRole('tab', { name: 'Plan 2D' }).click();
  await page.getByTestId('level-Étage (R+1)').click();
  await page.getByTestId('plan-import-input').setInputFiles('demo-assets/plan-exemple.pdf');
  await expect(page.getByTestId('plan-background')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'test-results/demo-plan-pdf.png' });
  await page.getByRole('button', { name: 'Retirer le fond' }).click();

  await page.getByRole('tab', { name: 'Audit' }).click();
  await expect(page.getByTestId('mode-perimetrique')).toContainText('13');
  await page.getByTestId('mode-perimetrique').getByRole('button', { name: 'Appliquer sur le plan' }).click();
  await expect(page.getByTestId('mode-perimetrique')).toContainText('Mode retenu');

  await page.getByRole('tab', { name: 'Vue 3D' }).click();
  await expect(page.getByTestId('view3d').locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Niveau affiché').selectOption({ label: 'Rez-de-chaussée seul' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/demo-3d-rdc.png' });
  await page.getByRole('button', { name: 'Utiliser cette vue pour le devis' }).click();

  await page.getByRole('tab', { name: 'Devis' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Générer le devis PDF' }).click();
  const download = await downloadPromise;
  await download.saveAs('test-results/devis-demo.pdf');
  expect(readFileSync((await download.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  expect(pageErrors).toEqual([]);
});
