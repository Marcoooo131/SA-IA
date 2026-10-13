import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Critères d'acceptation « mobilier et menuiseries génériques 2D/3D » :
 * maison générée -> mobilier par pièce -> salle de bain avec douche et baignoire ->
 * meubles dans les murs -> déplacement d'un canapé (2D puis 3D) -> modification d'une fenêtre ->
 * ajout d'une baie vitrée -> cohérence avec l'audit -> masquage du mobilier ->
 * enregistrement / rechargement -> PDF.
 */
const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

async function inside(inner: Locator, outer: Locator) {
  const a = (await inner.boundingBox())!;
  const b = (await outer.boundingBox())!;
  expect(a.x).toBeGreaterThanOrEqual(b.x - 1);
  expect(a.y).toBeGreaterThanOrEqual(b.y - 1);
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + b.width + 1);
  expect(a.y + a.height).toBeLessThanOrEqual(b.y + b.height + 1);
}

const model = (page: Page, id: string) => page.locator(`[data-testid="furniture-layer"] [data-model="${id}"]`);

test('mobilier et menuiseries génériques : 2D/3D synchronisées, audit inchangé, rechargement', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // 1. Maison avec salon, cuisine, chambres, salle de bain, entrée et garage
  await page.getByTestId('start-questionnaire').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="clientName"]').fill('Client démo mobilier');
  await dialog.getByRole('button', { name: /Créer et répondre au questionnaire/ }).click();
  await page.getByTestId('template-maison_etage').getByRole('button', { name: 'Choisir ce modèle', exact: true }).click();
  await page.getByRole('button', { name: 'Continuer vers le questionnaire' }).click();
  const q = page.getByTestId('questionnaire');
  await q.getByRole('radio', { name: 'Surface exacte à renseigner' }).click();
  await q.getByLabel('Surface exacte').fill('140');
  await q.getByRole('radio', { name: 'Garage attenant' }).click();
  await page.getByRole('button', { name: 'Générer le plan' }).click();
  await page.getByRole('button', { name: 'Utiliser ce plan et le vérifier' }).click();
  await page.getByRole('tab', { name: 'Plan 2D meublé', exact: true }).click();

  // 2. Chaque pièce reçoit un mobilier adapté
  for (const id of ['canape', 'table_basse', 'meuble_tv', 'evier', 'plaque_cuisson', 'meuble_chaussures', 'voiture', 'wc']) await expect(model(page, id).first()).toBeVisible();
  await page.getByTestId('level-Étage (R+1)').click();
  for (const id of ['lit', 'armoire', 'chevet']) await expect(model(page, id).first()).toBeVisible();
  // 3. Grande salle de bain : douche ET baignoire
  await expect(model(page, 'baignoire')).toHaveCount(1);
  await expect(model(page, 'douche')).toHaveCount(1);
  await inside(model(page, 'baignoire'), page.getByTestId('room-Salle de bain'));
  await page.screenshot({ path: 'test-results/mobilier-etage.png' });

  // 4. Petites pièces : le WC ne reçoit que des objets adaptés, 5. aucun meuble ne dépasse des murs
  await page.getByTestId('level-Rez-de-chaussée').click();
  await inside(model(page, 'wc'), page.getByTestId('room-WC'));
  await expect(model(page, 'baignoire')).toHaveCount(0);
  const sofa = model(page, 'canape');
  await inside(sofa, page.getByTestId('room-Séjour'));
  await inside(model(page, 'voiture'), page.getByTestId('room-Garage'));

  // 6. Déplacer le canapé en 2D, puis vérifier la même position en 3D
  await sofa.click();
  const props = page.getByTestId('furniture-properties');
  await expect(props).toContainText('Canapé');
  const xInput = page.locator('input[name="furniture-x"]');
  const x0 = num(await xInput.inputValue());
  const box = (await sofa.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 25, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => num(await xInput.inputValue())).toBeLessThan(x0 - 0.3);
  const x1 = await xInput.inputValue();
  await expect(props).toContainText('Modifié');
  await page.getByTestId('mode-3d_meuble').click();
  await expect(page.getByTestId('view3d').locator('canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('input[name="furniture-x"]')).toHaveValue(x1);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/mobilier-3d.png' });

  // 7. Modifier une fenêtre : 2D et 3D synchronisées (même ouverture, même identifiant)
  await page.getByTestId('mode-plan_meuble').click();
  const placedBefore = await (async () => {
    await page.getByTestId('mode-3d_securite').click();
    const n = Number(await page.getByTestId('view3d-openings-placed').innerText());
    await page.getByTestId('mode-plan_meuble').click();
    return n;
  })();
  const window = page.locator('[data-testid^="opening-RDC"]').filter({ has: page.locator('[data-joinery^="fenetre"]') }).first();
  const code = (await window.getAttribute('data-testid'))!.replace('opening-', '');
  await window.click({ force: true });
  await page.locator('select[name="opening-model"]').selectOption('porte_fenetre');
  await expect(page.getByTestId(`opening-${code}`).locator('[data-joinery]')).toHaveAttribute('data-joinery', 'porte_fenetre');
  await page.getByTestId('mode-3d_securite').click();
  await expect(page.getByTestId('view3d-openings-placed')).toHaveText(String(placedBefore));
  await page.getByRole('tab', { name: 'Pièces et menuiseries', exact: true }).click();
  const fenTotal = Number(await page.getByTestId('total-Fenêtres').innerText());
  const sejourBaies = Number(await page.getByLabel('Baies vitrées – Séjour', { exact: true }).inputValue());

  // 8. Ajouter une baie vitrée depuis la bibliothèque : rattachée au séjour
  await page.getByRole('tab', { name: 'Plan 2D meublé', exact: true }).click();
  await page.getByTestId('joinery-model-baie').click();
  const living = (await page.getByTestId('room-Séjour').boundingBox())!;
  // mur nord du séjour (façade)
  await page.mouse.click(living.x + living.width * 0.25, living.y + 1);
  await expect(page.locator('select[name="opening-model"]')).toHaveValue('baie');
  await expect(page.getByText('Donne sur l\'extérieur').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Pièces et menuiseries', exact: true }).click();
  await expect(page.getByLabel('Baies vitrées – Séjour', { exact: true })).toHaveValue(String(sejourBaies + 1));
  await expect(page.getByTestId('total-Fenêtres')).toHaveText(String(fenTotal));

  // 9. Quantités de menuiseries cohérentes avec l'audit
  let detectors = 0;
  for (const t of await page.locator('[data-testid^="detectors-"]').allInnerTexts()) detectors += Number(t.trim());
  await page.getByRole('tab', { name: 'Audit et équipements', exact: true }).click();
  await expect(page.getByTestId('audit-joinery-detectors')).toHaveText(String(detectors));
  await expect(page.getByTestId('count-perimetrique-detecteur_choc')).toHaveText(String(detectors));
  await page.getByTestId('mode-volumetrique').getByRole('button', { name: 'Appliquer sur le plan' }).click();

  // 10. Masquer le mobilier sans masquer les équipements de sécurité
  await page.getByRole('tab', { name: 'Plan 2D meublé', exact: true }).click();
  await page.getByTestId('mode-plan_archi').click();
  await expect(page.getByTestId('furniture-layer')).toHaveCount(0);
  expect(await page.locator('[data-testid^="device-"]').count()).toBeGreaterThan(0);
  await page.getByTestId('mode-3d_sans_mobilier').click();
  await expect(page.getByTestId('view3d').locator('canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Légende des équipements')).toBeVisible();
  await expect(page.getByText('Aucun équipement placé')).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/mobilier-3d-sans-mobilier.png' });

  // 12. PDF avec un plan lisible (mobilier atténué, équipements mis en avant)
  await page.getByRole('tab', { name: 'Devis', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Générer le devis PDF' }).click();
  const pdf = await download;
  expect(readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe('%PDF-');
  await pdf.saveAs('test-results/mobilier-devis.pdf');

  // 11. Enregistrer puis recharger sans perte des modifications
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /MOV-\d{4}-\d{4}/ }).first().click();
  await page.getByRole('tab', { name: 'Plan 2D meublé', exact: true }).click();
  await model(page, 'canape').click();
  await expect(page.locator('input[name="furniture-x"]')).toHaveValue(x1);
  await expect(page.getByTestId(`opening-${code}`).locator('[data-joinery]')).toHaveAttribute('data-joinery', 'porte_fenetre');
  expect(errors).toEqual([]);
});
