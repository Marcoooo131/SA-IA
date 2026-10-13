import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Critères de validation du questionnaire (évolutions complémentaires) :
 * modèle « Maison à étage » -> questionnaire -> plan 2D -> 3D -> corrections ->
 * audit -> équipements -> devis (centrale à 0 €/mois) -> import Excel -> rechargement.
 */
test('questionnaire : de la maison à étage au devis, centrale à 0 €/mois, rechargement', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // Création du dossier par le parcours recommandé
  await page.getByTestId('start-questionnaire').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="clientName"]').fill('Client démo questionnaire');
  await dialog.locator('input[name="address"]').fill('8 chemin Fictif, 00000 Démo');
  await dialog.getByRole('button', { name: /Créer et répondre au questionnaire/ }).click();
  await expect(page.getByRole('heading', { name: 'Créer mon plan en quelques questions' })).toBeVisible();

  // 1. Modèle « Maison à étage » (vignettes 2D + 3D)
  const card = page.getByTestId('template-maison_etage');
  await expect(card.locator('svg[aria-label="Miniature 3D du modèle"]')).toBeVisible();
  await card.getByRole('button', { name: 'Choisir', exact: true }).click();
  await page.getByRole('button', { name: 'Continuer vers le questionnaire' }).click();

  // 2. Questionnaire : surface, 3 chambres, cuisine ouverte, garage
  const q = page.getByTestId('questionnaire');
  await q.getByRole('radio', { name: 'Surface exacte à renseigner' }).click();
  await q.getByLabel('Surface exacte').fill('140');
  await q.getByRole('radio', { name: '3', exact: true }).first().click();
  await q.getByRole('radio', { name: 'Cuisine ouverte sur le séjour' }).click();
  await q.getByRole('radio', { name: 'Garage attenant' }).click();
  await q.getByLabel('Nombre de fenêtres').fill('8');

  // 3. Génération du plan 2D + 4. maquette 3D
  await page.getByRole('button', { name: 'Générer le plan' }).click();
  await expect(page.getByTestId('generation-3d').locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'test-results/questionnaire-generation.png' });
  await page.getByRole('button', { name: 'Utiliser ce plan et le vérifier' }).click();
  await expect(page.getByRole('heading', { name: 'Vérification des pièces et des menuiseries' })).toBeVisible();
  await page.getByRole('tab', { name: 'Plan 2D' }).click();

  // 5. Vérification et correction
  await expect(page.getByTestId('generation-banner')).toContainText('Votre plan a été généré à partir de vos réponses');
  await expect(page.getByTestId('provenance-legend')).toBeVisible();
  for (const name of ['Chambre 1', 'Chambre 2', 'Chambre 3']) {
    await page.getByTestId('level-Étage (R+1)').click();
    await expect(page.getByTestId(`room-${name}`)).toBeVisible();
  }
  await page.getByTestId('level-Rez-de-chaussée').click();
  await expect(page.getByTestId('room-Garage')).toBeVisible();
  await expect(page.getByTestId('room-Cuisine ouverte')).toBeVisible();
  await expect(page.getByTestId('room-Escalier')).toBeVisible();

  // modification manuelle d'une dimension
  await page.getByTestId('room-Séjour').click({ force: true });
  const width = page.locator('input[name="room-w"]');
  const before = Number((await width.inputValue()).replace(',', '.'));
  await width.fill(String(before + 1).replace('.', ','));
  await width.blur();
  await expect(page.locator('[data-provenance="conseiller"]').first()).toBeVisible();

  // ajout d'une fenêtre sur le mur nord du séjour
  const openingsBefore = await page.locator('[data-testid^="opening-"]').count();
  await page.getByRole('button', { name: 'Fenêtre' }).click();
  const room = (await page.getByTestId('room-Séjour').boundingBox())!;
  await page.mouse.click(room.x + room.width * 0.75, room.y + 1);
  await expect(page.locator('[data-testid^="opening-"]')).toHaveCount(openingsBefore + 1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Valider le plan' }).click();
  await expect(page.getByTestId('generation-banner')).toHaveCount(0);

  // 7. Rendu 3D actualisé
  await page.getByRole('tab', { name: 'Vue 3D' }).click();
  await expect(page.getByTestId('view3d').locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/questionnaire-3d.png' });

  // 8. Audit + 9. équipements
  await page.getByRole('tab', { name: 'Audit' }).click();
  await page.getByTestId('mode-volumetrique').getByRole('button', { name: 'Appliquer sur le plan' }).click();
  await page.getByRole('tab', { name: 'Équipements' }).click();
  await expect(page.locator('[data-testid^="equipment-row-"]').first()).toBeVisible();

  // 10. Devis + 11. centrale à 0 €/mois (sans forfait, la centrale est facturée à l'unité)
  await page.getByRole('tab', { name: 'Devis' }).click();
  await page.getByLabel('Offre du devis').selectOption({ label: 'Sans forfait (à la carte)' });
  const centrale = page.getByTestId('quote-line-DEMO-CENT-01');
  await expect(centrale.getByLabel('Mensualité DEMO-CENT-01')).toBeDisabled();
  await expect(centrale.getByLabel('Mensualité DEMO-CENT-01')).toHaveValue('0');
  await expect(centrale).toContainText('499 €');
  await expect(centrale).toContainText('0 €/mois');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Générer le devis PDF' }).click();
  const pdf = await download;
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  await pdf.saveAs('test-results/questionnaire-devis.pdf');

  // 12. Import Excel + modification manuelle d'un tarif
  await page.getByRole('button', { name: 'Catalogue & règles' }).click();
  await page.getByRole('button', { name: 'Import / export Excel' }).click();
  await page.getByTestId('catalog-import-input').setInputFiles('demo-assets/catalogue-exemple.xlsx');
  await expect(page.getByTestId('import-summary')).toBeVisible();
  await page.getByRole('button', { name: /Valider l'import/ }).click();
  await page.getByRole('button', { name: 'Produits' }).click();
  await expect(page.getByTestId('centrale-monthly-locked')).toContainText('0 €');
  const price = page.getByLabel('Prix matériel DEMO-SIR-INT');
  await price.fill('159');
  await price.blur();

  // 13. Enregistrement et rechargement
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.reload();
  await page.getByRole('button', { name: /MOV-\d{4}-\d{4}/ }).first().click();
  await page.getByRole('tab', { name: 'Plan 2D' }).click();
  await expect(page.getByTestId('room-Séjour')).toBeVisible();
  await expect(page.getByTestId('generation-banner')).toHaveCount(0);
  await page.getByTestId('level-Étage (R+1)').click();
  await expect(page.getByTestId('room-Chambre 3')).toBeVisible();
  await page.getByRole('tab', { name: 'Devis' }).click();
  await expect(page.locator('[data-testid^="quote-record-DEV-"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Catalogue & règles' }).click();
  await expect(page.getByLabel('Prix matériel DEMO-SIR-INT')).toHaveValue('159');
  expect(errors).toEqual([]);
});

test('import Excel : une mensualité non nulle pour la centrale exige une confirmation et reste à 0 €', async ({ page }) => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Catalogue');
  ws.addRow(['Référence produit', 'Nom', 'Catégorie', 'Description', 'Prix matériel', 'Supplément mensuel', 'Type de facturation', 'Quantité incluse dans un pack', 'Statut', 'Commentaires']);
  ws.addRow(['DEMO-CENT-01', 'Centrale', 'Centrale', '', 459, 3, 'Unitaire', 1, 'Actif', '']);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await page.goto('/');
  await page.getByRole('button', { name: 'Catalogue & règles' }).click();
  await page.getByRole('button', { name: 'Import / export Excel' }).click();
  await page.getByTestId('catalog-import-input').setInputFiles({ name: 'centrale.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  await expect(page.getByTestId('centrale-alert')).toContainText('0 €/mois');
  await page.getByRole('switch').click();
  const validate = page.getByRole('button', { name: /Valider l'import/ });
  await expect(validate).toBeDisabled();
  await page.getByLabel('Je confirme : la mensualité de la centrale reste à 0 €.').check();
  await validate.click();
  await page.getByRole('button', { name: 'Produits' }).click();
  await expect(page.getByLabel('Prix matériel DEMO-CENT-01')).toHaveValue('459');
  await expect(page.getByTestId('centrale-monthly-locked')).toContainText('0 €');
});
