import { expect, test } from '@playwright/test';
import { answer, continueAfterFeedback, currentExercise, currentIndex, expectInViewport, expectNoHorizontalScroll } from './helpers';

test.describe('leçon, correction, sauvegarde et reprise', () => {
  test('une journée complète avec une erreur corrigée', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Continuer mon cours' }).click();
    await expect(page).toHaveURL(/#\/lesson\/1$/);
    await expect(page.getByRole('heading', { name: 'Le verbe « to be » (être)' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await answer(page, await currentExercise(page, 1));

    let wrongDone = false;
    let resumed = false;
    for (let guard = 0; guard < 20; guard++) {
      const ex = await currentExercise(page, 1);
      await expectNoHorizontalScroll(page);
      if (ex.type === 'translate' && !wrongDone) {
        // Réponse fausse : la correction, l'explication et « Continuer » apparaissent.
        await answer(page, ex, { wrong: true });
        const feedback = page.getByRole('status').filter({ hasText: 'Pas tout à fait' });
        await expect(feedback).toBeVisible();
        await expect(feedback).toContainText(ex.accepted[0]);
        await expect(feedback).toContainText('Point de grammaire');
        await expectInViewport(page, page.getByRole('button', { name: /^Continuer/ }), 'Continuer');
        wrongDone = true;
      } else if (ex.type === 'word' && !resumed) {
        // Fermeture brutale au milieu d'une saisie : on retrouve l'exercice et le brouillon.
        const index = await currentIndex(page);
        await page.getByLabel('Ta réponse en anglais').fill('brouillon');
        await page.waitForTimeout(700);
        await page.reload();
        await expect(page.locator('.counter')).toHaveText(`${index + 1}/11`);
        await expect(page.getByLabel('Ta réponse en anglais')).toHaveValue('brouillon');
        resumed = true;
        await answer(page, ex, { viaEnter: true });
        await expect(page.getByText(/Bonne réponse|Presque parfait/)).toBeVisible();
      } else {
        await answer(page, ex);
        await expect(page.getByText(/Bonne réponse|Presque parfait/)).toBeVisible();
      }
      await continueAfterFeedback(page);
      if (!(await page.locator('.counter').textContent())) break;
    }
    await expect(page.getByText('Jour 1 terminé !')).toBeVisible();
    await expect(page.getByText('9 bonnes réponses sur 10')).toBeVisible();

    await page.getByRole('button', { name: "Retour à l'accueil" }).click();
    await expect(page.getByText('Jour 2 / 90')).toBeVisible();
    await expect(page.getByText('1 erreur à corriger')).toBeVisible();

    // Les erreurs à corriger
    await page.getByRole('navigation').getByRole('link', { name: /^Réviser/ }).click();
    await page.getByRole('button', { name: /Corriger mes erreurs \(1\)/ }).click();
    const box = page.getByLabel('Ta réponse en anglais');
    await expect(box).toBeVisible();
    const prompt = (await page.locator('.ex-prompt').textContent())!;
    const { PROGRAM } = await import('../src/curriculum');
    const sentence = PROGRAM[0].sentences.find((s) => s.fr === prompt)!;
    await box.fill(sentence.en[0]);
    await box.press('Enter');
    await expect(page.getByText('Bonne réponse !')).toBeVisible();
    await continueAfterFeedback(page);
    await expect(page.getByText('Erreurs reprises')).toBeVisible();

    // Après un « redémarrage » (nouvel onglet), tout est conservé.
    await page.goto('/#/learn');
    await expect(page.getByRole('button', { name: /Jour 1 : Se présenter\. Terminé · 9\/10/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Jour 2 :/ })).toBeEnabled();
  });

  test("rouvrir l'application ramène à la leçon interrompue", async ({ page }) => {
    await page.goto('/#/lesson/1');
    await answer(page, await currentExercise(page, 1));
    await answer(page, await currentExercise(page, 1));
    await continueAfterFeedback(page);
    await expect(page.locator('.counter')).toHaveText('3/11');
    await page.goto('/');
    await page.reload();
    await expect(page).toHaveURL(/#\/lesson\/1$/);
    await expect(page.locator('.counter')).toHaveText('3/11');
    // Et depuis l'accueil, le bouton principal indique la reprise.
    await page.getByRole('button', { name: /Fermer/ }).click();
    await expect(page.getByText("Reprends à l'exercice 3 sur 11.")).toBeVisible();
  });

  test('le clavier ne masque ni le champ ni le bouton de validation', async ({ page }) => {
    await page.goto('/#/lesson/1');
    for (let i = 0; i < 12; i++) {
      const ex = await currentExercise(page, 1);
      if (ex.type === 'word' || ex.type === 'translate') break;
      await answer(page, ex);
      if (ex.type !== 'intro') await continueAfterFeedback(page);
    }
    const box = page.getByLabel('Ta réponse en anglais');
    await box.click();
    await box.fill('I');
    // Simulation du clavier : la zone visible se réduit de moitié.
    const vp = page.viewportSize()!;
    await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.5) });
    await page.waitForTimeout(400);
    await expectInViewport(page, box, 'champ de réponse');
    await expectInViewport(page, page.getByRole('button', { name: 'Vérifier ma réponse' }), 'bouton Vérifier');
    await expectNoHorizontalScroll(page);
    await page.setViewportSize(vp);
  });
});
