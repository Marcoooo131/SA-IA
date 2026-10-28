import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

const shots = process.env.SCREENSHOTS_DIR;

async function login(page: import('@playwright/test').Page) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await page.getByLabel('Adresse e-mail').fill('claire@exemple.fr');
  await page.getByLabel('Mot de passe').fill('motdepasse');
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test('connexion refusée avec un mauvais mot de passe', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./');
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-connexion.png` });
  await page.getByLabel('Adresse e-mail').fill('claire@exemple.fr');
  await page.getByLabel('Mot de passe').fill('faux');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou mot de passe incorrect');
});

test('tableau de bord, agenda, création et fiche d’un rendez-vous', async ({ page, isMobile }) => {
  const db = await installMockSupabase(page);
  await login(page);

  // Tableau de bord
  await expect(page.getByRole('heading', { name: /Bonjour|Bonsoir/ })).toBeVisible();
  await expect(page.getByText('Visite technique Dupont').first()).toBeVisible();
  await expect(page.getByText('Installation Martin')).toBeVisible(); // reporté
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-tableau-de-bord.png`, fullPage: true });

  // Le rendez-vous privé d'un collègue n'apparaît que comme « Occupé »
  await expect(page.getByText('Entretien confidentiel')).toHaveCount(0);

  // Agenda
  await page.goto('./#/agenda');
  await page.getByRole('tab', { name: 'Semaine' }).click();
  await expect(page.locator('.fc-timegrid')).toBeVisible();
  await expect(page.locator('.appt-chip', { hasText: 'Visite technique Dupont' })).toBeVisible();
  await expect(page.locator('.appt-chip.is-masked', { hasText: 'Occupé' })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-agenda-semaine.png` });
  await page.getByRole('tab', { name: 'Mois' }).click();
  await expect(page.locator('.fc-daygrid')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-agenda-mois.png` });
  await page.getByRole('tab', { name: 'Liste' }).click();
  await expect(page.locator('.fc-list')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-agenda-liste.png` });
  await page.getByRole('tab', { name: 'Jour' }).click();
  await expect(page.locator('.fc-timeGridDay-view')).toBeVisible();
  await page.getByRole('button', { name: 'Période suivante' }).click();
  await expect(page.locator('.appt-chip', { hasText: 'Visite technique Dupont' })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-agenda-jour.png` });

  // Filtre local
  await page.getByLabel('Filtrer les rendez-vous affichés').fill('dupont');
  await page.getByRole('tab', { name: 'Semaine' }).click();
  await expect(page.locator('.appt-chip', { hasText: 'Réunion d’équipe' })).toHaveCount(0);
  await page.getByLabel('Filtrer les rendez-vous affichés').fill('');

  // Création : validation puis enregistrement avec avertissement de chevauchement
  if (isMobile) await page.getByRole('button', { name: 'Nouveau rendez-vous' }).click();
  else await page.getByTestId('new-appointment').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Nouveau rendez-vous')).toBeVisible();
  await dialog.getByTestId('save-appointment').click();
  await expect(dialog.getByText('Le titre est obligatoire')).toBeVisible();

  await dialog.locator('input[name=title]').fill('Rendez-vous de test');
  const today = new Date(Date.now() + 86_400_000); // demain, jour de « Visite technique Dupont »
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await dialog.locator('input[name=date]').fill(ymd);
  await dialog.locator('input[name=startTime]').fill('11:00');
  await dialog.locator('input[name=endTime]').fill('11:30');
  await dialog.locator('input[name=clientName]').fill('Mme Test');
  await dialog.getByRole('radio', { name: 'Confirmé' }).click();
  await expect(dialog.getByText(/Chevauchement : Claire Admin a déjà un rendez-vous/)).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-formulaire.png` });
  await dialog.getByTestId('save-appointment').click();
  await expect(page.getByText('Rendez-vous créé')).toBeVisible();
  expect(db.appointments!.some((a) => a.title === 'Rendez-vous de test' && a.status === 'confirme' && a.client_name === 'Mme Test')).toBe(true);

  // La fiche détaillée du nouveau rendez-vous s'ouvre
  const detail = page.getByRole('dialog');
  await expect(detail.getByRole('heading', { name: 'Rendez-vous de test' })).toBeVisible();
  await detail.getByRole('tab', { name: /Commentaires/ }).click();
  await detail.getByPlaceholder('Écrire un commentaire…').fill('Penser au badge');
  await detail.getByRole('button', { name: 'Envoyer' }).click();
  await expect(detail.getByText('Penser au badge')).toBeVisible();
  await detail.getByRole('tab', { name: /Historique/ }).click();
  await expect(detail.getByRole('tab', { name: /Historique/ })).toHaveAttribute('aria-selected', 'true');
  await expect(detail.getByRole('tab', { name: /Commentaires/ })).toHaveAttribute('aria-selected', 'false');
  await expect(detail.getByText('a créé le rendez-vous')).toBeVisible();
  await page.waitForTimeout(300);
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-fiche.png` });
});

test('recherche globale et notifications', async ({ page, isMobile }) => {
  await installMockSupabase(page);
  await login(page);
  await expect(page.getByRole('heading', { name: /Bonjour|Bonsoir/ })).toBeVisible();
  await page.getByRole('button', { name: /Notifications \(1 non lues\)/ }).click();
  await expect(page.getByText('Bob Martin vous a confié un rendez-vous')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 300);

  if (isMobile) await page.getByRole('button', { name: 'Rechercher' }).click();
  await page.getByLabel("Rechercher dans l'agenda").filter({ visible: true }).fill('confidentiel');
  await expect(page.getByText('Aucun rendez-vous trouvé.')).toBeVisible();
  await page.getByLabel("Rechercher dans l'agenda").filter({ visible: true }).fill('martin');
  await page.getByRole('button', { name: /^Installation Martin/ }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Installation Martin' })).toBeVisible();
});

test('un collaborateur ne voit pas l’administration', async ({ page }) => {
  await installMockSupabase(page, { viewerIsAdmin: false });
  await login(page);
  await expect(page.getByRole('heading', { name: /Bonjour|Bonsoir/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
  await page.goto('./#/admin');
  await expect(page.getByText('Accès réservé aux administrateurs')).toBeVisible();
});

test('administration : utilisateurs, catégories, paramètres', async ({ page }) => {
  await installMockSupabase(page, { viewerIsAdmin: true });
  await login(page);
  await expect(page.getByRole('heading', { name: /Bonjour|Bonsoir/ })).toBeVisible();
  await page.goto('./#/admin');
  await expect(page.getByText('Équipe (2)')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-admin.png`, fullPage: true });
  await page.getByRole('tab', { name: 'Catégories' }).click();
  await expect(page.locator('input[aria-label="Nom"]').first()).toHaveValue('Rendez-vous client');
  await page.getByRole('tab', { name: 'Paramètres' }).click();
  await expect(page.getByText("Fuseau horaire de l'équipe")).toBeVisible();
});

test('rappel sur l’ordinateur avant un rendez-vous, lien Outlook et connexion Dispatch', async ({ page }) => {
  await page.addInitScript(() => {
    const sent: string[] = [];
    (window as unknown as { __notifs: string[] }).__notifs = sent;
    class FakeNotification {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      onclick: (() => void) | null = null;
      constructor(title: string, opts?: { body?: string }) {
        sent.push(`${title} | ${opts?.body ?? ''}`);
      }
      close() {}
    }
    (window as unknown as { Notification: unknown }).Notification = FakeNotification;
  });
  await installMockSupabase(page, { viewerIsAdmin: true });
  await login(page);
  await expect(page.getByRole('heading', { name: /Bonjour|Bonsoir/ })).toBeVisible();
  await expect
    .poll(async () => (await page.evaluate(() => (window as unknown as { __notifs: string[] }).__notifs)).join('\n'), { timeout: 10_000 })
    .toMatch(/Dans (9|10) min : Rappel client Leroy \| \d\d:\d\d · M\. Leroy/);

  await page.goto('./#/profil');
  await expect(page.getByLabel("Lien d'abonnement")).toHaveValue(`http://mock-supabase.test/functions/v1/calendar-feed?t=${'a'.repeat(64)}`);
  await expect(page.getByText('Notifications autorisées sur ce navigateur.')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-profil.png`, fullPage: true });

  await page.goto('./#/admin');
  await page.getByRole('tab', { name: 'Paramètres' }).click();
  await page.getByRole('button', { name: 'Générer le jeton' }).click();
  await expect(page.getByText('Jeton (affiché une seule fois) :')).toBeVisible();
  await expect(page.locator(`input[value="${'b'.repeat(64)}"]`)).toBeVisible();
});
