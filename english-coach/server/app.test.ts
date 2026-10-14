// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppOptions } from './app.ts';
import { openStore } from './db.ts';
import type { Tutor } from './tutor.ts';

let server: Server;
let base: string;

const fakeTutor: Tutor = {
  async chat(input) {
    return {
      reply: input.history.length ? 'Nice! What do you do on weekends?' : 'Hello! How are you today?',
      corrections: input.history.length ? [{ original: 'I am agree', corrected: 'I agree', explanation: 'On dit « I agree » sans « am ».' }] : [],
      vocabulary: [{ en: 'weekend', fr: 'week-end' }],
    };
  },
  async check(input) {
    return { acceptable: input.answer.includes('wish'), corrected: input.accepted[0], explanation: 'Explication.' };
  },
};

async function start(opts: Partial<AppOptions> = {}) {
  const store = openStore(':memory:');
  const staticDir = mkdtempSync(join(tmpdir(), 'ec-'));
  mkdirSync(join(staticDir, 'assets'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>English Coach</title>');
  writeFileSync(join(staticDir, 'sw.js'), 'self');
  writeFileSync(join(staticDir, 'manifest.webmanifest'), '{}');
  server = createApp({ store, tutor: fakeTutor, staticDir, ...opts });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function call(path: string, init: RequestInit & { key?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.key) headers.Authorization = `Bearer ${init.key}`;
  const res = await fetch(base + path, { ...init, headers });
  const type = res.headers.get('content-type') ?? '';
  const body: any = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, headers: res.headers, body };
}

async function register() {
  const r = await call('/api/sync/register', { method: 'POST', body: '{}' });
  expect(r.status).toBe(201);
  return r.body.key as string;
}

beforeEach(() => start());
afterEach(() => new Promise<void>((r) => server.close(() => r())));

describe('synchronisation', () => {
  it('crée un code, enregistre puis relit la progression', async () => {
    const key = await register();
    expect(key).toMatch(/^[A-Z2-9]{20}$/);
    const empty = await call('/api/sync/state', { key });
    expect(empty.body).toEqual({ doc: null, revision: 0, updatedAt: null });
    const put = await call('/api/sync/state', { method: 'PUT', key, body: JSON.stringify({ doc: { completed: { 1: {} } }, baseRevision: 0 }) });
    expect(put.body.revision).toBe(1);
    // Le code est accepté avec tirets et minuscules (saisie sur un autre appareil).
    const formatted = key.toLowerCase().replace(/(.{4})/g, '$1-');
    const again = await call('/api/sync/state', { key: formatted });
    expect(again.body.doc).toEqual({ completed: { 1: {} } });
    expect(again.body.revision).toBe(1);
  });

  it('refuse une écriture concurrente (409) pour forcer une fusion', async () => {
    const key = await register();
    await call('/api/sync/state', { method: 'PUT', key, body: JSON.stringify({ doc: { a: 1 }, baseRevision: 0 }) });
    const stale = await call('/api/sync/state', { method: 'PUT', key, body: JSON.stringify({ doc: { a: 2 }, baseRevision: 0 }) });
    expect(stale.status).toBe(409);
  });

  it('refuse un code inconnu ou absent', async () => {
    expect((await call('/api/sync/state', { key: 'NOPENOPENOPENOPENOPE' })).status).toBe(401);
    expect((await call('/api/sync/state')).status).toBe(401);
  });

  it('exige le code d\'invitation quand il est configuré', async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await start({ inviteCode: 'secret' });
    expect((await call('/api/sync/register', { method: 'POST', body: '{}' })).status).toBe(403);
    expect((await call('/api/sync/register', { method: 'POST', body: JSON.stringify({ inviteCode: 'secret' }) })).status).toBe(201);
    expect((await call('/api/health')).body).toEqual({ ok: true, ai: true, inviteRequired: true });
  });

  it('limite les créations de comptes par adresse', async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await start({ registerPerHour: 2 });
    await register();
    await register();
    expect((await call('/api/sync/register', { method: 'POST', body: '{}' })).status).toBe(429);
  });
});

describe('professeur IA', () => {
  it('répond et corrige', async () => {
    const key = await register();
    const r = await call('/api/tutor/chat', {
      method: 'POST',
      key,
      body: JSON.stringify({ scenario: 'free', day: 3, topics: ['to be'], history: [{ role: 'user', text: 'I am agree' }] }),
    });
    expect(r.status).toBe(200);
    expect(r.body.corrections[0].corrected).toBe('I agree');
  });

  it('valide une traduction libre', async () => {
    const key = await register();
    const r = await call('/api/tutor/check', {
      method: 'POST',
      key,
      body: JSON.stringify({ prompt: 'Je veux…', accepted: ['I want to learn English.'], answer: 'I wish to learn English', day: 1 }),
    });
    expect(r.body.acceptable).toBe(true);
  });

  it('indique clairement quand l\'IA n\'est pas configurée', async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await start({ tutor: null });
    const key = await register();
    const r = await call('/api/tutor/chat', { method: 'POST', key, body: JSON.stringify({ scenario: 'free', day: 1, topics: [], history: [] }) });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('ai_unavailable');
  });

  it('applique la limite quotidienne', async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await start({ aiDailyLimit: 1 });
    const key = await register();
    const body = JSON.stringify({ scenario: 'free', day: 1, topics: [], history: [] });
    expect((await call('/api/tutor/chat', { method: 'POST', key, body })).status).toBe(200);
    expect((await call('/api/tutor/chat', { method: 'POST', key, body })).status).toBe(429);
  });

  it('rejette une requête invalide et exige un code', async () => {
    const key = await register();
    expect((await call('/api/tutor/chat', { method: 'POST', key, body: JSON.stringify({ day: 500 }) })).status).toBe(400);
    expect((await call('/api/tutor/chat', { method: 'POST', body: '{}' })).status).toBe(401);
  });
});

describe('fichiers de l\'application', () => {
  it('sert la PWA avec les bons en-têtes et renvoie index.html pour les autres chemins', async () => {
    const sw = await call('/sw.js');
    expect(sw.headers.get('cache-control')).toBe('no-cache');
    const manifest = await call('/manifest.webmanifest');
    expect(manifest.headers.get('content-type')).toContain('application/manifest+json');
    const other = await call('/une/page');
    expect(other.body).toContain('English Coach');
    expect(other.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  it('bloque la sortie du dossier public', async () => {
    const r = await fetch(`${base}/..%2f..%2fpackage.json`);
    expect(await r.text()).not.toContain('"name"');
    expect((await call('/api/inconnue')).status).toBe(404);
  });
});
