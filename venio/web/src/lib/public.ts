export type PublicPageData = {
  slug: string; name: string; vertical: string; timezone: string; accepting_bookings: boolean;
  branding: { primary_color?: string; accent_color?: string; logo_url?: string | null };
  profile: { tagline?: string; description?: string; phone?: string; email?: string; address?: string;
    service_area?: string; opening_hours?: string; reassurance?: string[] };
  services: { key: string; name: string; description: string | null; meeting_type: string; duration_min: number; price_display: string | null }[];
  flow: { version_id: string; intro?: string } | null;
};
