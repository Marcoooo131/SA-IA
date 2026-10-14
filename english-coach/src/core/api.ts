/** Client des services en ligne : synchronisation et professeur IA. */

export type ApiErrorKind = 'offline' | 'no-server' | 'ai-unavailable' | 'limit' | 'auth' | 'conflict' | 'server';

export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export const API_MESSAGES: Record<ApiErrorKind, string> = {
  offline: "Pas de connexion Internet. Les leçons et les révisions restent disponibles ; le professeur IA et la synchronisation reprendront dès le retour du réseau.",
  'no-server': "Le serveur English Coach est injoignable. Ta progression est bien enregistrée sur cet appareil.",
  'ai-unavailable': "Le professeur IA n'est pas configuré sur le serveur. Les leçons et révisions fonctionnent normalement.",
  limit: "Limite quotidienne d'échanges avec le professeur IA atteinte. Réessaie demain.",
  auth: 'Code de synchronisation inconnu ou refusé.',
  conflict: 'Conflit de synchronisation, nouvel essai…',
  server: 'Le serveur a rencontré une erreur. Réessaie dans un instant.',
};

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

export async function apiFetch<T>(path: string, init: RequestInit & { key?: string; timeoutMs?: number } = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError('offline', API_MESSAGES.offline);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (init.key) headers.set('Authorization', `Bearer ${init.key}`);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { ...init, headers, signal: controller.signal });
  } catch {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new ApiError(offline ? 'offline' : 'no-server', offline ? API_MESSAGES.offline : API_MESSAGES['no-server']);
  } finally {
    clearTimeout(timer);
  }
  const type = res.headers.get('content-type') ?? '';
  // Un hébergement statique (sans serveur) renvoie une page HTML : on le traite comme « pas de serveur ».
  if (!type.includes('application/json')) throw new ApiError('no-server', API_MESSAGES['no-server'], res.status);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (res.ok) return body;
  const kind: ApiErrorKind =
    res.status === 401 || res.status === 403
      ? 'auth'
      : res.status === 409
        ? 'conflict'
        : res.status === 429
          ? 'limit'
          : res.status === 503 && body.error === 'ai_unavailable'
            ? 'ai-unavailable'
            : 'server';
  throw new ApiError(kind, body.message || API_MESSAGES[kind], res.status);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return API_MESSAGES.server;
}
