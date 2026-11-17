export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; headers?: Record<string, string>; form?: FormData };

/** Appel à l'API Venio (même origine : /api, cookie de session HttpOnly). */
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: opts.method ?? "GET", headers, body, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "network", "Connexion impossible. Vérifiez votre réseau et réessayez.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail)) {
      const { code, message, ...extra } = detail;
      throw new ApiError(res.status, code ?? "error", message ?? "Une erreur est survenue.", extra);
    }
    if (Array.isArray(detail)) {
      throw new ApiError(res.status, "validation", "Certaines informations sont invalides : " +
        detail.map((d: { loc: string[]; msg: string }) => d.loc.slice(-1)[0]).join(", ") + ".");
    }
    throw new ApiError(res.status, "error", "Une erreur est survenue. Réessayez dans un instant.");
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : "Une erreur inattendue est survenue.";
}
