import "server-only";
import type { PublicPageData } from "./public";

const API_URL = process.env.VENIO_API_URL ?? "http://127.0.0.1:8000";

export async function getPublicPage(slug: string): Promise<PublicPageData | null> {
  const res = await fetch(`${API_URL}/api/public/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
