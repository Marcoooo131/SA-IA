import { expect, test } from '@playwright/test';

test.describe('application installable (PWA)', () => {
  test('manifeste, icônes et service worker', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'manifest.webmanifest');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#2b59c3');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', 'icons/apple-touch-icon.png');
    expect(await page.locator('link[rel="apple-touch-startup-image"]').count()).toBeGreaterThanOrEqual(8);
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');

    const res = await request.get('/manifest.webmanifest');
    expect(res.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await res.json();
    expect(manifest).toMatchObject({ name: 'English Coach', short_name: 'English Coach', display: 'standalone', start_url: './?source=pwa', scope: './' });
    const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const icon of manifest.icons) {
      const r = await request.get(`/${icon.src}`);
      expect(r.status(), icon.src).toBe(200);
    }

    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return { scope: reg.scope, script: reg.active?.scriptURL };
    });
    expect(sw.script).toMatch(/\/sw\.js$/);
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const cache = await caches.open(keys.find((k) => k.startsWith('english-coach-'))!);
      return (await cache.keys()).map((r) => new URL(r.url).pathname);
    });
    expect(cached).toEqual(expect.arrayContaining(['/index.html', '/manifest.webmanifest', '/icons/icon-192.png']));
    expect(cached.some((p) => p.startsWith('/assets/') && p.endsWith('.js'))).toBe(true);
    expect(cached.some((p) => p.startsWith('/api/'))).toBe(false);
  });

  test("le guide d'installation correspond à l'appareil", async ({ page }, testInfo) => {
    await page.goto('/#/install');
    await expect(page.getByRole('heading', { name: "Installer l'application" })).toBeVisible();
    const expected = testInfo.project.name.startsWith('iphone')
      ? 'iPhone et iPad'
      : testInfo.project.name.startsWith('android')
        ? 'Android'
        : 'Ordinateur';
    await expect(page.getByRole('heading', { name: new RegExp(expected) })).toContainText('ton appareil');
    await expect(page.getByText(/Sur l'écran d'accueil/)).toBeVisible();
  });
});
