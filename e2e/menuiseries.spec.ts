import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Critères d'acceptation « menuiseries par pièce » :
 * maison 2 niveaux depuis un modèle -> pièces générées -> nombre de chambres ->
 * saisie des menuiseries -> ajout d'une fenêtre au séjour -> totaux -> positionnement 2D ->
 * 3D -> détecteurs -> changement de type -> audit sans double comptage -> devis -> rechargement.
 */
const num = async (page: Page, testId: string) => Number((await page.getByTestId(testId).innerText()).trim());

async function sumDetectors(page: Page) {
  const cells = page.locator('[data-testid^="detectors-"]');
  let s = 0;
  for (const t of await cells.allInnerTexts()) s += Number(t.trim());
  return s;
}

test('menuiseries par pièce : du modèle à étage au devis, sans double comptage', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // 1. Maison à 2 niveaux à partir d'un modèle
  await page.getByTestId('start-questionnaire').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="clientName"]').fill('Client démo menuiseries');
  await dialog.getByRole('button', { name: /Créer et répondre au questionnaire/ }).click();
  await page.getByTestId('template-maison_etage').getByRole('button', { name: 'Choisir ce modèle', exact: true }).click();
  await page.getByRole('button', { name: 'Continuer vers le questionnaire' }).click();

  // 3. Nombre de chambres : 4 (le nombre de pièces principales suit)
  const q = page.getByTestId('questionnaire');
  await q.getByRole('radio', { name: '4', exact: true }).first().click();
  await expect(q.getByTestId('q-main-rooms')).toHaveValue('5');

  // 2. Génération de plusieurs pièces
  await page.getByRole('button', { name: 'Générer le plan' }).click();
  await page.getByRole('button', { name: 'Utiliser ce plan et le vérifier' }).click();
  await expect(page.getByRole('heading', { name: 'Vérification des pièces et des menuiseries' })).toBeVisible();
  const rdc = page.getByTestId('joinery-table-0');
  const etage = page.getByTestId('joinery-table-1');
  await expect(rdc.getByTestId('joinery-room-Séjour')).toBeVisible();
  for (const n of [1, 2, 3, 4]) await expect(etage.getByTestId(`joinery-room-Chambre ${n}`)).toBeVisible();

  // 4. Saisie des fenêtres, portes et baies par pièce (dont une quantité nulle et une saisie invalide)
  const ch1Baies = page.getByLabel('Baies vitrées – Chambre 1', { exact: true });
  await ch1Baies.fill('1');
  const ch2Fen = page.getByLabel('Fenêtres – Chambre 2', { exact: true });
  await ch2Fen.fill('0');
  await expect(page.getByTestId('detectors-Chambre 2')).toHaveText('0');
  await ch2Fen.fill('-1');
  await expect(ch2Fen).toHaveAttribute('aria-invalid', 'true');
  await ch2Fen.blur();
  await expect(ch2Fen).toHaveValue('0');
  await page.getByLabel('Portes intérieures – Chambre 2', { exact: true }).fill('1');

  // 5. Ajout d'une fenêtre au séjour + 6. totaux mis à jour
  const totalFen = await num(page, 'total-Fenêtres');
  const sejourFen = page.getByLabel('Fenêtres – Séjour', { exact: true });
  const fenBefore = Number(await sejourFen.inputValue());
  const detBefore = await num(page, 'detectors-Séjour');
  await sejourFen.fill(String(fenBefore + 1));
  await expect(page.getByTestId('total-Fenêtres')).toHaveText(String(totalFen + 1));
  await expect(page.getByTestId('detectors-Séjour')).toHaveText(String(detBefore + 1));
  const sejourRow = page.getByTestId('joinery-room-Séjour');
  await expect(sejourRow).toContainText('1 à positionner');

  // 9. Calcul des détecteurs (explication lisible)
  await sejourRow.getByRole('button', { name: 'Détail des menuiseries' }).click();
  await expect(page.getByTestId('calc-Séjour')).toContainText(new RegExp(`${fenBefore + 1} fenêtres? × 1 détecteur`));

  // 7. Positionnement de la fenêtre dans le plan 2D
  const pendingBefore = await num(page, 'joinery-pending');
  await page.getByRole('button', { name: 'Positionner', exact: true }).first().click();
  await expect(page.getByTestId('unplaced-Séjour')).toBeVisible();
  const room = (await page.getByTestId('room-Séjour').boundingBox())!;
  await page.mouse.click(room.x + room.width * 0.3, room.y + 1);
  await expect(page.getByTestId('unplaced-Séjour')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/menuiseries-plan.png' });

  // 8. Visible en 3D (aucune ouverture restant à positionner)
  await page.getByRole('tab', { name: 'Visualisation 3D', exact: true }).click();
  await expect(page.getByTestId('view3d').locator('canvas')).toBeVisible({ timeout: 20_000 });
  if (pendingBefore > 1) await expect(page.getByTestId('view3d-openings-pending')).toHaveText(String(pendingBefore - 1));
  else await expect(page.getByTestId('view3d-openings-pending')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/menuiseries-3d.png' });

  // 10. Changement du type d'une ouverture : fenêtre -> baie vitrée
  await page.getByRole('tab', { name: 'Pièces et menuiseries', exact: true }).click();
  await expect(page.getByTestId('total-Fenêtres')).toHaveText(String(totalFen + 1));
  const det2 = await num(page, 'detectors-Séjour');
  await page.getByTestId('joinery-room-Séjour').getByRole('button', { name: 'Détail des menuiseries' }).click();
  const firstWindow = page.locator('[data-testid^="opening-row-"]').filter({ has: page.locator('select option:checked', { hasText: 'Fenêtre' }) }).first();
  await firstWindow.getByRole('combobox').selectOption({ label: 'Baie vitrée' });
  await expect(page.getByTestId('detectors-Séjour')).toHaveText(String(det2 + 1));
  await expect(page.getByTestId('total-Fenêtres')).toHaveText(String(totalFen));
  const totalDetectors = await sumDetectors(page);

  // 11. Audit mis à jour, sans double comptage
  await page.getByRole('tab', { name: 'Audit et équipements', exact: true }).click();
  await expect(page.getByTestId('audit-joinery-detectors')).toHaveText(String(totalDetectors));
  await expect(page.getByTestId('count-perimetrique-detecteur_choc')).toHaveText(String(totalDetectors));
  await page.getByTestId('mode-perimetrique').getByRole('button', { name: 'Appliquer sur le plan' }).click();
  // les ouvertures encore « à positionner » (chambres) restent signalées, mais déjà comptées
  if (pendingBefore > 1) await expect(page.getByTestId('alert-menuiseries:a-positionner')).toBeVisible();
  else await expect(page.getByTestId('alert-menuiseries:a-positionner')).toHaveCount(0);

  // 12. Génération du devis
  await page.getByRole('tab', { name: 'Devis', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Générer le devis PDF' }).click();
  const pdf = await download;
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  const record = page.locator('[data-testid^="quote-record-DEV-"]');
  await expect(record).toHaveCount(1);
  const recordText = (await record.textContent())!;

  // Modification après le devis : suppression d'une ouverture, le devis émis reste inchangé
  await page.getByRole('tab', { name: 'Pièces et menuiseries', exact: true }).click();
  const ch1Det = await num(page, 'detectors-Chambre 1');
  await page.getByLabel('Baies vitrées – Chambre 1', { exact: true }).fill('0');
  await expect(page.getByTestId('detectors-Chambre 1')).toHaveText(String(ch1Det - 2));
  await page.getByRole('tab', { name: 'Audit et équipements', exact: true }).click();
  await expect(page.getByTestId('audit-joinery-detectors')).toHaveText(String(totalDetectors - 2));
  await page.getByRole('tab', { name: 'Devis', exact: true }).click();
  await expect(record).toHaveText(recordText);

  // 13. Enregistrement et rechargement
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /MOV-\d{4}-\d{4}/ }).first().click();
  await page.getByRole('tab', { name: 'Pièces et menuiseries', exact: true }).click();
  await expect(page.getByLabel('Fenêtres – Séjour', { exact: true })).toHaveValue(String(fenBefore));
  await expect(page.getByLabel('Baies vitrées – Chambre 1', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Portes intérieures – Chambre 2', { exact: true })).toHaveValue('1');
  await page.getByRole('tab', { name: 'Devis', exact: true }).click();
  await expect(page.locator('[data-testid^="quote-record-DEV-"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
