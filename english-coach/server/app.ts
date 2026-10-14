import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { Store } from './db.ts';
import { Anthropic, TutorRefusal, type Tutor } from './tutor.ts';

export interface AppOptions {
  store: Store;
  /** null : professeur IA non configuré (pas de clé API). */
  tutor: Tutor | null;
  /** Dossier du build de l'application (dist) ; absent en développement. */
  staticDir?: string;
  /** Code d'invitation exigé pour créer une sauvegarde (facultatif). */
  inviteCode?: string;
  aiDailyLimit?: number;
  registerPerHour?: number;
  log?: (msg: string) => void;
}

const MAX_DOC_BYTES = 4 * 1024 * 1024;
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function newSyncKey(): string {
  const bytes = randomBytes(20);
  return Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('');
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key.toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
}

class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function send(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

async function readJson(req: IncomingMessage, limit = MAX_DOC_BYTES): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'too_large', 'Requête trop volumineuse.');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad_json', 'JSON invalide.');
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(400, 'bad_request', 'Requête invalide.');
  return r.data;
}

const ChatBody = z.object({
  scenario: z.string().max(40),
  day: z.number().int().min(1).max(90),
  topics: z.array(z.string().max(120)).max(20),
  history: z
    .array(z.object({ role: z.enum(['user', 'tutor']), text: z.string().max(2000) }))
    .min(0)
    .max(30),
});

const CheckBody = z.object({
  prompt: z.string().max(400),
  accepted: z.array(z.string().max(400)).min(1).max(10),
  answer: z.string().min(1).max(400),
  day: z.number().int().min(1).max(90),
});

const PutBody = z.object({ doc: z.record(z.string(), z.unknown()), baseRevision: z.number().int().min(0) });

export function createApp(opts: AppOptions) {
  const { store, tutor } = opts;
  const aiDailyLimit = opts.aiDailyLimit ?? 300;
  const registerPerHour = opts.registerPerHour ?? 30;
  const log = opts.log ?? (() => {});
  const registrations = new Map<string, number[]>();

  function account(req: IncomingMessage) {
    const auth = req.headers.authorization ?? '';
    const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!key) throw new HttpError(401, 'no_key', 'Code de synchronisation manquant.');
    const keyHash = hashKey(key);
    const row = store.get(keyHash);
    if (!row) throw new HttpError(401, 'unknown_key', 'Code de synchronisation inconnu.');
    return { keyHash, row };
  }

  function useAi(keyHash: string): Tutor {
    if (!tutor) throw new HttpError(503, 'ai_unavailable', "Le professeur IA n'est pas configuré sur ce serveur.");
    if (!store.consumeAi(keyHash, today(), aiDailyLimit)) {
      throw new HttpError(429, 'ai_limit', "Limite quotidienne d'échanges avec le professeur IA atteinte. Réessaie demain.");
    }
    return tutor;
  }

  async function callAi<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof TutorRefusal) throw new HttpError(422, 'ai_refusal', "Le professeur IA n'a pas pu répondre à ce message. Reformule-le.");
      if (err instanceof Anthropic.RateLimitError) throw new HttpError(503, 'ai_busy', 'Le professeur IA est très sollicité. Réessaie dans un instant.');
      if (err instanceof Anthropic.AuthenticationError) throw new HttpError(503, 'ai_unavailable', 'La clé API du professeur IA est invalide.');
      if (err instanceof Anthropic.APIConnectionError) throw new HttpError(502, 'ai_unreachable', 'Le professeur IA est injoignable pour le moment.');
      if (err instanceof Anthropic.APIError) throw new HttpError(502, 'ai_error', 'Le professeur IA a rencontré une erreur.');
      throw err;
    }
  }

  async function api(req: IncomingMessage, res: ServerResponse, path: string) {
    const method = req.method ?? 'GET';

    if (path === '/api/health' && method === 'GET') {
      return send(res, 200, { ok: true, ai: Boolean(tutor), inviteRequired: Boolean(opts.inviteCode) });
    }

    if (path === '/api/sync/register' && method === 'POST') {
      const body = (await readJson(req, 10_000)) as { inviteCode?: string };
      if (opts.inviteCode && body.inviteCode !== opts.inviteCode) throw new HttpError(403, 'invite_required', "Code d'invitation requis ou incorrect.");
      const ip = req.socket.remoteAddress ?? 'unknown';
      const hourAgo = Date.now() - 3_600_000;
      const recent = (registrations.get(ip) ?? []).filter((t) => t > hourAgo);
      if (recent.length >= registerPerHour) throw new HttpError(429, 'too_many', 'Trop de créations de sauvegarde. Réessaie plus tard.');
      registrations.set(ip, [...recent, Date.now()]);
      const key = newSyncKey();
      store.create(hashKey(key));
      return send(res, 201, { key });
    }

    if (path === '/api/sync/state' && method === 'GET') {
      const { row } = account(req);
      return send(res, 200, { doc: row.doc ? JSON.parse(row.doc) : null, revision: row.revision, updatedAt: row.updated_at });
    }

    if (path === '/api/sync/state' && method === 'PUT') {
      const { keyHash } = account(req);
      const body = parse(PutBody, await readJson(req));
      const revision = store.save(keyHash, JSON.stringify(body.doc), body.baseRevision);
      if (revision === null) throw new HttpError(409, 'conflict', 'La sauvegarde a été modifiée par un autre appareil.');
      return send(res, 200, { revision });
    }

    if (path === '/api/tutor/chat' && method === 'POST') {
      const { keyHash } = account(req);
      const body = parse(ChatBody, await readJson(req, 100_000));
      const ai = useAi(keyHash);
      const reply = await callAi(() => ai.chat(body));
      return send(res, 200, reply);
    }

    if (path === '/api/tutor/check' && method === 'POST') {
      const { keyHash } = account(req);
      const body = parse(CheckBody, await readJson(req, 20_000));
      const ai = useAi(keyHash);
      const reply = await callAi(() => ai.check(body));
      return send(res, 200, reply);
    }

    throw new HttpError(404, 'not_found', 'Route inconnue.');
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, path: string) {
    const root = opts.staticDir ? resolve(opts.staticDir) : undefined;
    if (!root || !existsSync(root)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end("Build introuvable : lance « npm run build ».");
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      throw new HttpError(400, 'bad_path', 'Chemin invalide.');
    }
    let file = normalize(join(root, decoded));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      return res.end();
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    const ext = extname(file);
    const name = file.slice(root.length + 1);
    const cache = name.startsWith('assets/')
      ? 'public, max-age=31536000, immutable'
      : ['index.html', 'sw.js', 'manifest.webmanifest'].includes(name)
        ? 'no-cache'
        : 'public, max-age=86400';
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': cache,
      'Content-Length': statSync(file).size,
      ...(name === 'sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  }

  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'",
    );
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    try {
      if (path.startsWith('/api/')) return await api(req, res, path);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method', 'Méthode non autorisée.');
      return serveStatic(req, res, path);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.code, message: err.message });
      log(`Erreur interne : ${err instanceof Error ? err.stack : String(err)}`);
      return send(res, 500, { error: 'internal', message: 'Erreur interne du serveur.' });
    }
  });
}
