import "server-only";

const API_URL = process.env.VENIO_API_URL ?? "http://127.0.0.1:8000";

export type PublicPage = {
  slug: string; name: string; vertical: string; timezone: string; accepting_bookings: boolean;
  branding: { primary_color?: string; accent_color?: string; logo_url?: string | null };
  profile: { tagline?: string; description?: string; phone?: string; email?: string; address?: string;
    service_area?: string; opening_hours?: string; reassurance?: string[] };
  services: { key: string; name: string; description: string | null; meeting_type: string; duration_min: number; price_display: string | null }[];
  flow: { version_id: string; intro?: string } | null;
};

export async function getPublicPage(slug: string): Promise<PublicPage | null> {
  const res = await fetch(`${API_URL}/api/public/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
