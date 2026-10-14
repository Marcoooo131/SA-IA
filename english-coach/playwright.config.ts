import { defineConfig } from '@playwright/test';

/**
 * Tests de bout en bout sur l'application construite, servie par le vrai serveur
 * (SQLite temporaire, professeur IA factice) et sur plusieurs tailles d'écran.
 */
const PORT = 4310;

const phone = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'android-360', use: { ...phone, viewport: { width: 360, height: 640 }, userAgent: ANDROID_UA } },
    { name: 'iphone-390', use: { ...phone, viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA } },
    { name: 'android-430', use: { ...phone, viewport: { width: 430, height: 932 }, userAgent: ANDROID_UA } },
    { name: 'tablette-768', use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'ordinateur-1280', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `rm -rf data/e2e && npm run build && node server/index.ts`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), HOST: '127.0.0.1', EC_DB_PATH: 'data/e2e/english-coach.db', EC_TUTOR: 'fake', EC_REGISTER_PER_HOUR: '10000' },
  },
});
