import { expect, type Page } from '@playwright/test';
import { buildLessonExercises, type Exercise } from '../src/core/exercises';

/** Lit la position « 3/11 » affichée en haut de l'écran d'exercice. */
export async function currentIndex(page: Page): Promise<number> {
  await expect(page.locator('.counter')).toHaveText(/^\d+\/\d+$/);
  const text = (await page.locator('.counter').textContent()) ?? '';
  return Number(text.split('/')[0]) - 1;
}

export async function currentExercise(page: Page, day: number): Promise<Exercise> {
  return buildLessonExercises(day)[await currentIndex(page)];
}

/** Répond à l'exercice affiché (juste, ou volontairement faux) puis valide. */
export async function answer(page: Page, ex: Exercise, opts: { wrong?: boolean; viaEnter?: boolean } = {}) {
  switch (ex.type) {
    case 'intro': {
      const before = await page.locator('.counter').textContent();
      await page.getByRole('button', { name: /Commencer les exercices/ }).click();
      await expect(page.locator('.counter')).not.toHaveText(before ?? '');
      return;
    }
    case 'choice': {
      const target = opts.wrong ? ex.options.find((o) => o !== ex.accepted[0])! : ex.accepted[0];
      await page.locator('.choice', { hasText: new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).click();
      return;
    }
    case 'word':
    case 'translate': {
      const box = page.getByLabel('Ta réponse en anglais');
      await box.fill(opts.wrong ? 'zzz wrong' : ex.accepted[0]);
      if (opts.viaEnter) await box.press('Enter');
      else await page.getByRole('button', { name: 'Vérifier ma réponse' }).click();
      return;
    }
    case 'fill': {
      const box = page.getByLabel('Mot manquant');
      await box.fill(opts.wrong ? 'zzz' : ex.accepted[0]);
      await box.press('Enter');
      return;
    }
    case 'order': {
      const words = ex.accepted[0].replace(/[.!?]+$/, '').split(/\s+/);
      const order = opts.wrong ? [...words].reverse() : words;
      const used = new Set<number>();
      for (const w of order) {
        const idx = ex.tiles.findIndex((t, i) => t === w && !used.has(i));
        used.add(idx);
        await page.locator('[aria-label="Mots disponibles"] .tile').nth(idx).click();
      }
      await page.getByRole('button', { name: 'Vérifier ma réponse' }).click();
    }
  }
}

/** Valide « Continuer » et attend l'exercice suivant (ou l'écran de bilan). */
export async function continueAfterFeedback(page: Page) {
  const before = await page.locator('.counter').textContent();
  await page.getByRole('button', { name: /^Continuer/ }).click();
  await expect(page.locator('.counter')).not.toHaveText(before ?? '');
}

/** Pas de défilement horizontal : la page ne dépasse jamais la largeur de l'écran. */
export async function expectNoHorizontalScroll(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scroll, 'défilement horizontal').toBeLessThanOrEqual(width);
}

export async function expectInViewport(page: Page, locator: ReturnType<Page['locator']>, label: string) {
  const box = await locator.boundingBox();
  const vh = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight);
  expect(box, label).not.toBeNull();
  expect(box!.y, `${label} (haut)`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${label} (bas)`).toBeLessThanOrEqual(vh + 1);
}
