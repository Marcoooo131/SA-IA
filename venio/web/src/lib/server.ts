import "server-only";
import type { PublicPageData } from "./public";

const API_URL = process.env.VENIO_API_URL ?? "http://127.0.0.1:8000";

export async function getPublicPage(slug: string): Promise<PublicPageData | null> {
  const res = await fetch(`${API_URL}/api/public/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export type PublicPlans = {
  plans: { code: string; name: string; monthly_cents: number; yearly_cents: number; entitlements: Record<string, unknown> }[];
  packs: { code: string; credits: number; cents: number; name: string }[];
  trial_days: number; currency: string; taxes: string;
};

/** Offres publiques (page Tarifs) : relues au plus toutes les 10 minutes. */
export async function getPublicPlans(): Promise<PublicPlans | null> {
  try {
    const res = await fetch(`${API_URL}/api/plans`, { next: { revalidate: 600 } });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}
