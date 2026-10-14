import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from './app.ts';
import { openStore } from './db.ts';
import { createClaudeTutor } from './tutor.ts';
import { fakeTutor } from './fake-tutor.ts';

/**
 * Serveur English Coach : sert l'application (PWA), la sauvegarde synchronisée (SQLite)
 * et le professeur IA (API Claude). Configuration par variables d'environnement, voir README.
 */
const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;

const port = Number(env.PORT ?? 8787);
const store = openStore(env.EC_DB_PATH ?? join(here, '..', 'data', 'english-coach.db'));
const aiConfigured = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.EC_AI_ENABLED === '1');
const effort = (env.EC_EFFORT as 'low' | 'medium' | 'high' | undefined) ?? 'low';
const tutor =
  env.EC_TUTOR === 'fake' ? fakeTutor : aiConfigured ? createClaudeTutor({ model: env.EC_MODEL ?? 'claude-opus-5-5', effort }) : null;

const server = createApp({
  store,
  tutor,
  staticDir: env.EC_STATIC_DIR ?? join(here, '..', 'dist'),
  inviteCode: env.EC_INVITE_CODE || undefined,
  aiDailyLimit: Number(env.EC_AI_DAILY_LIMIT ?? 300),
  registerPerHour: Number(env.EC_REGISTER_PER_HOUR ?? 30),
  log: (m) => console.error(m),
});

server.listen(port, env.HOST ?? '0.0.0.0', () => {
  console.log(`English Coach : http://localhost:${port}`);
  console.log(
    env.EC_TUTOR === 'fake'
      ? 'Professeur IA FACTICE (tests uniquement).'
      : tutor
        ? `Professeur IA actif (${env.EC_MODEL ?? 'claude-opus-5-5'}).`
        : 'Professeur IA désactivé : définir ANTHROPIC_API_KEY pour l\'activer.',
  );
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
