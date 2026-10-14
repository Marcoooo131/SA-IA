import { expect, test } from '@playwright/test';
import { answer, continueAfterFeedback, currentExercise } from './helpers';

test.describe('conversation écrite et synchronisation', () => {
  test('le professeur répond, corrige et propose du vocabulaire', async ({ page }) => {
    await page.goto('/#/chat');
    await page.getByRole('button', { name: 'Discussion libre' }).click();
    await expect(page.locator('.msg.tutor').first()).toContainText('How are you today?');
    const input = page.getByLabel('Ton message en anglais');
    await input.fill('I am agree with you');
    await input.press('Enter');
    await expect(page.locator('.msg.user')).toHaveText('I am agree with you');
    const corrections = page.locator('.corrections');
    await expect(corrections).toContainText('I agree');
    await expect(corrections).toContainText('« agree » est un verbe');
    await page.getByRole('button', { name: /weekend = week-end/ }).click();
    await expect(page.getByRole('button', { name: /weekend = week-end/ })).toBeDisabled();
    // Le mot rejoint les révisions.
    await page.getByRole('button', { name: 'Retour aux conversations' }).click();
    await expect(page.getByText('Mes conversations')).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: /^Réviser/ }).click();
    await expect(page.getByText("1 élément à revoir aujourd'hui.")).toBeVisible();
  });

  test('la progression se retrouve sur un second appareil', async ({ page, browser }, testInfo) => {
    await page.goto('/#/lesson/1');
    await answer(page, await currentExercise(page, 1));
    await answer(page, await currentExercise(page, 1));
    await continueAfterFeedback(page);
    await page.goto('/#/profile');
    await page.getByRole('button', { name: 'Synchroniser' }).click();
    await expect(page.getByText(/Dernière sauvegarde en ligne/)).toBeVisible();
    const code = (await page.getByLabel('Code de synchronisation').textContent())!.trim();
    expect(code).toMatch(/^([A-Z2-9]{4}-){4}[A-Z2-9]{4}$/);

    const other = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL });
    const page2 = await other.newPage();
    await page2.goto('/#/profile');
    await page2.getByRole('button', { name: /J'ai déjà un code/ }).click();
    await page2.getByLabel('Code affiché sur ton autre appareil').fill(code.toLowerCase());
    await page2.getByRole('button', { name: 'Relier cet appareil' }).click();
    await expect(page2.getByText('Appareil relié : ta progression a été fusionnée.')).toBeVisible();
    await page2.getByRole('navigation').getByRole('link', { name: 'Accueil', exact: true }).click();
    await expect(page2.getByText("Reprends à l'exercice 3 sur 11.")).toBeVisible();
    await other.close();
  });
});
