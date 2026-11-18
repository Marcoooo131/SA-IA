import { BookingFlow } from "@/components/BookingFlow";
import { Check, Clock, Mail, MapPin, Phone } from "lucide-react";
import { LogoMark } from "@/components/ui";
import { brandStyle } from "@/lib/color";
import { MEETING_LABELS } from "@/lib/format";
import type { PublicPageData } from "@/lib/public";

export function PublicPage({ page }: { page: PublicPageData }) {
  const p = page.profile;
  const style = brandStyle(page.branding.primary_color, page.branding.accent_color) as React.CSSProperties;

  return (
    <div style={style} className="brand-scope min-h-dvh">
      <header className="bg-[var(--brand)] text-[var(--brand-fg)]">
        <div className="mx-auto max-w-5xl px-5 py-8 md:py-12">
          <div className="flex items-center gap-3">
            {page.branding.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={page.branding.logo_url} alt="" className="h-12 w-12 rounded-card bg-surface object-contain p-1" />
              : <span className="grid h-12 w-12 place-items-center rounded-card bg-[var(--brand-fg)]/15 text-xl font-semibold">{page.name.slice(0, 1)}</span>}
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{page.name}</h1>
          </div>
          {p.tagline && <p className="mt-3 max-w-2xl text-lg text-[var(--brand-fg)]/85">{p.tagline}</p>}
          {!!p.reassurance?.length && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {p.reassurance.map((r) => <li key={r} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-fg)]/15 px-3 py-1 text-sm"><Check aria-hidden className="h-3.5 w-3.5" />{r}</li>)}
            </ul>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-5 py-8 md:grid-cols-[1fr_320px]">
        <section className="rounded-frame border border-line bg-surface p-5 shadow-float md:p-8" aria-label="Prise de rendez-vous">
          {page.accepting_bookings
            ? <BookingFlow slug={page.slug} tenantName={page.name} timezone={page.timezone} services={page.services} intro={page.flow?.intro} />
            : <p className="text-ink-muted">La réservation en ligne est momentanément indisponible.{p.phone && <> Contactez-nous au <a className="underline" href={`tel:${p.phone}`}>{p.phone}</a>.</>}</p>}
        </section>

        <aside className="space-y-6 text-sm">
          {p.description && <section><h2 className="mb-2 font-semibold">À propos</h2><p className="whitespace-pre-line text-ink-muted">{p.description}</p></section>}
          <section>
            <h2 className="mb-2 font-semibold">Nos rendez-vous</h2>
            <ul className="space-y-2">
              {page.services.map((s) => (
                <li key={s.key} className="rounded-control border border-line bg-surface p-3">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-ink-muted">{s.duration_min} min · {MEETING_LABELS[s.meeting_type]}{s.price_display && ` · ${s.price_display}`}</p>
                </li>
              ))}
            </ul>
          </section>
          {(p.phone || p.email || p.address || p.service_area || p.opening_hours) && (
            <section>
              <h2 className="mb-2 font-semibold">Coordonnées</h2>
              <ul className="space-y-1 text-ink-muted">
                {p.phone && <li className="flex gap-2"><Phone aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /><a className="underline" href={`tel:${p.phone}`}>{p.phone}</a></li>}
                {p.email && <li className="flex gap-2"><Mail aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /><a className="underline" href={`mailto:${p.email}`}>{p.email}</a></li>}
                {p.address && <li className="flex gap-2"><MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />{p.address}</li>}
                {p.service_area && <li className="pl-6">Zone d&apos;intervention : {p.service_area}</li>}
                {p.opening_hours && <li className="flex gap-2"><Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /><span className="whitespace-pre-line">{p.opening_hours}</span></li>}
              </ul>
            </section>
          )}
          <p className="flex items-start gap-1.5 text-xs text-ink-subtle"><LogoMark className="h-4 w-4" />Réservation propulsée par Venio. Vos informations sont transmises uniquement à {page.name}.</p>
        </aside>
      </main>
    </div>
  );
}
