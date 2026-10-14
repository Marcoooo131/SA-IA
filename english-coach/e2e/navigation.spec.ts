import { expect, test } from '@playwright/test';
import { expectInViewport, expectNoHorizontalScroll } from './helpers';

test.describe('écrans principaux et navigation', () => {
  test("l'accueil affiche l'essentiel sans défiler", async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Jour 1 / 90')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Progression du programme de 90 jours' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Se présenter' })).toBeVisible();
    await expect(page.getByText("aujourd'hui · objectif 15 min")).toBeVisible();
    await expect(page.getByText('révision en attente')).toBeVisible();
    await expect(page.getByText('jour de suite')).toBeVisible();
    const cta = page.getByRole('button', { name: 'Continuer mon cours' });
    await expectInViewport(page, cta, 'bouton principal');
    // Le bouton n'est pas caché derrière la barre de navigation.
    const tabTop = (await page.locator('.tabbar').boundingBox())!.y;
    const ctaBox = (await cta.boundingBox())!;
    expect(ctaBox.y + ctaBox.height).toBeLessThan(tabTop);
    await expectNoHorizontalScroll(page);
  });

  test('la barre du bas mène aux cinq rubriques', async ({ page }) => {
    await page.goto('/');
    const truncated = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.tab .label')].filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent),
    );
    expect(truncated, 'libellés tronqués').toEqual([]);
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    for (const [label, title] of [
      ['Apprendre', 'Apprendre'],
      ['Réviser', 'Réviser'],
      ['Conversation', 'Conversation écrite'],
      ['Profil', 'Profil'],
      ['Accueil', 'English Coach'],
    ]) {
      const link = nav.getByRole('link', { name: label, exact: true });
      await expect(link).toBeVisible();
      await link.click();
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expectNoHorizontalScroll(page);
    }
  });

  test('le programme liste 13 semaines et verrouille les jours suivants', async ({ page }) => {
    await page.goto('/#/learn');
    await expect(page.locator('details.week')).toHaveCount(13);
    await expect(page.getByRole('button', { name: /Jour 1 : Se présenter/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Jour 2 :/ })).toBeDisabled();
    await page.locator('details.week').nth(12).locator('summary').click();
    await expect(page.getByRole('button', { name: /Jour 90 : Évaluation finale/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('commandes assez grandes pour le doigt et textes lisibles', async ({ page }) => {
    for (const route of ['/', '/#/review', '/#/profile', '/#/chat']) {
      await page.goto(route);
      await expect(page.locator('.page-title')).toBeVisible();
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.btn, .tab, .icon-btn, .chip, .choice, .segmented button, .day')]
          .filter((el) => el.offsetParent !== null)
          .map((el) => ({ text: el.textContent?.trim(), h: el.getBoundingClientRect().height }))
          .filter((x) => x.h < 43.5),
      );
      expect(small, `cibles trop petites sur ${route}`).toEqual([]);
      const tiny = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((el) => el.offsetParent !== null && el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()))
          .map((el) => parseFloat(getComputedStyle(el).fontSize))
          .filter((size) => size < 11),
      );
      expect(tiny, `textes trop petits sur ${route}`).toEqual([]);
      await expectNoHorizontalScroll(page);
    }
  });
});
