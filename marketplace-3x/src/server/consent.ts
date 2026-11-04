import { cookies } from "next/headers";

export const CONSENT_COOKIE = "m3x_consent";
export const REF_COOKIE = "m3x_ref";

export type Consent = { v: number; analytics: boolean; affiliate: boolean; key: string };

export async function readConsent(): Promise<Consent | null> {
  const raw = (await cookies()).get(CONSENT_COOKIE)?.value;
  if (!raw) return null;
  try { return JSON.parse(raw) as Consent; } catch { return null; }
}

/** Attributions mémorisées (uniquement si le visiteur a consenti aux traceurs d'affiliation). */
export async function readRefCookie(): Promise<string[]> {
  const raw = (await cookies()).get(REF_COOKIE)?.value;
  if (!raw) return [];
  return raw.split(".").filter((x) => /^[a-z0-9]{20,40}$/.test(x)).slice(0, 20);
}
