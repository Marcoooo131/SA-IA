import { expect, test } from '@playwright/test';
import { answer, continueAfterFeedback, currentExercise } from './helpers';

test.describe('hors connexion et erreurs réseau', () => {
  test("l'application installée fonctionne sans réseau, l'IA l'indique clairement", async ({ page, context }) => {
    await page.goto('/');
    // Le service worker met l'application en cache puis contrôle la page.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Continuer mon cours' })).toBeVisible();
    await expect(page.getByText(/Hors connexion : leçons et révisions restent disponibles/)).toBeVisible();

    // Conversation : impossible hors ligne, et c'est dit.
    await page.getByRole('navigation').getByRole('link', { name: 'Conversation', exact: true }).click();
    await expect(page.getByText(/La conversation nécessite Internet/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Discussion libre' })).toBeDisabled();

    // Leçon : disponible hors ligne, correction locale annoncée.
    await page.goto('/#/lesson/1');
    for (let i = 0; i < 12; i++) {
      const ex = await currentExercise(page, 1);
      if (ex.type === 'translate') {
        await answer(page, ex, { wrong: true });
        await expect(page.getByText(/Hors connexion : ta réponse a été comparée aux réponses attendues/)).toBeVisible();
        break;
      }
      await answer(page, ex);
      if (ex.type !== 'intro') await continueAfterFeedback(page);
    }
    await context.setOffline(false);
  });

  test('erreur réseau pendant la conversation : message et nouvel essai', async ({ page }) => {
    await page.route('**/api/tutor/**', (route) => route.abort('connectionreset'));
    await page.goto('/#/chat');
    await page.getByRole('button', { name: 'Discussion libre' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(/injoignable/);
    await page.unroute('**/api/tutor/**');
    await alert.getByRole('button', { name: /Réessayer/ }).click();
    await expect(page.locator('.msg.tutor')).toContainText('Hello! I am your English coach.');
  });

  test('vérification IA indisponible : la correction locale prend le relais', async ({ page }) => {
    await page.route('**/api/tutor/check', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'ai_unavailable', message: "Le professeur IA n'est pas configuré sur ce serveur." }) }));
    await page.goto('/#/lesson/1');
    for (let i = 0; i < 12; i++) {
      const ex = await currentExercise(page, 1);
      if (ex.type === 'translate') {
        await answer(page, ex, { wrong: true });
        await expect(page.getByText(/n'est pas configuré sur ce serveur\. Ta réponse a été comparée aux réponses attendues/)).toBeVisible();
        break;
      }
      await answer(page, ex);
      if (ex.type !== 'intro') await continueAfterFeedback(page);
    }
  });
});
