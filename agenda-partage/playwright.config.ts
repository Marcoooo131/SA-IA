import { defineConfig, devices } from '@playwright/test';

// Tests d'interface : l'application est compilée avec une URL Supabase fictive, interceptée par
// e2e/mockSupabase.ts. Voir scripts/test-e2e.sh.
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4179/',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    // Navigateur préinstallé éventuel (PLAYWRIGHT_CHROMIUM=/chemin/vers/chrome), sinon celui de Playwright
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  },
  projects: [
    { name: 'ordinateur', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite preview --port 4179 --strictPort --host 127.0.0.1 --outDir dist-e2e',
    url: 'http://127.0.0.1:4179/',
    reuseExistingServer: false,
  },
});
