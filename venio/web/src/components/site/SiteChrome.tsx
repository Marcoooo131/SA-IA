import { Menu } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo, buttonClass, cx } from "@/components/ui";

export const NAV = [
  { href: "/fonctionnalites", label: "Fonctionnalités" },
  { href: "/secteurs", label: "Secteurs" },
  { href: "/tarifs", label: "Tarifs" },
  { href: "/demo", label: "Démo" },
  { href: "/ressources", label: "Ressources" },
  { href: "/faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5">
        <Link href="/" aria-label="Venio, accueil"><Logo className="text-lg" /></Link>
        <nav aria-label="Navigation principale" className="hidden items-center gap-1 text-sm lg:flex">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="rounded-control px-3 py-2 text-ink-muted transition-colors hover:text-ink">{n.label}</Link>)}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/connexion" className={buttonClass("ghost")}>Se connecter</Link>
          <Link href="/inscription" className={buttonClass("primary")}>Essai gratuit</Link>
        </div>
        {/* Menu mobile sans JavaScript : <details> natif, accessible au clavier. */}
        <details className="group relative lg:hidden">
          <summary className={cx(buttonClass("ghost"), "list-none [&::-webkit-details-marker]:hidden")} aria-label="Ouvrir le menu">
            <Menu aria-hidden className="h-5 w-5" />
          </summary>
          <nav aria-label="Navigation mobile" className="absolute right-0 top-12 w-64 rounded-card border border-line bg-surface p-2 shadow-float">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="block rounded-control px-3 py-2.5 text-ink hover:bg-sunken">{n.label}</Link>)}
            <div className="mt-2 grid gap-2 border-t border-line pt-2">
              <Link href="/connexion" className={buttonClass("secondary")}>Se connecter</Link>
              <Link href="/inscription" className={buttonClass("primary")}>Essai gratuit</Link>
            </div>
          </nav>
        </details>
      </div>
    </header>
  );
}

const LEGAL = [
  { href: "/legal/mentions-legales", label: "Mentions légales" },
  { href: "/legal/cgv", label: "CGV" },
  { href: "/legal/cgu", label: "CGU" },
  { href: "/legal/confidentialite", label: "Confidentialité" },
  { href: "/legal/sous-traitance", label: "Sous-traitance des données" },
  { href: "/legal/cookies", label: "Cookies" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo className="text-lg" />
          <p className="mt-3 max-w-xs text-sm text-ink-muted">Chaque appel, chaque visite, une opportunité de rendez-vous.</p>
          <p className="mt-3 text-xs text-ink-subtle">Données hébergées dans l&apos;Union européenne.</p>
        </div>
        <nav aria-label="Produit" className="text-sm">
          <p className="mb-3 font-semibold text-ink">Produit</p>
          <ul className="space-y-2">{NAV.map((n) => <li key={n.href}><Link className="text-ink-muted hover:text-ink" href={n.href}>{n.label}</Link></li>)}</ul>
        </nav>
        <nav aria-label="Informations légales" className="text-sm">
          <p className="mb-3 font-semibold text-ink">Légal</p>
          <ul className="space-y-2">{LEGAL.map((n) => <li key={n.href}><Link className="text-ink-muted hover:text-ink" href={n.href}>{n.label}</Link></li>)}</ul>
        </nav>
      </div>
    </footer>
  );
}

/** Bloc de section de la vitrine : espaces généreux, une idée par section. */
export function Section({ id, eyebrow, title, intro, children, tone = "paper", className }:
  { id?: string; eyebrow?: string; title: ReactNode; intro?: ReactNode; children?: ReactNode; tone?: "paper" | "surface" | "ink"; className?: string }) {
  return (
    <section id={id} className={cx(tone === "surface" && "border-y border-line bg-surface", tone === "ink" && "bg-ink text-white", className)}>
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        {eyebrow && <p className={cx("mb-3 text-sm font-semibold", tone === "ink" ? "text-signal" : "text-signal-strong")}>{eyebrow}</p>}
        <h2 className={cx("max-w-3xl font-display text-4xl font-semibold leading-tight md:text-5xl", tone === "ink" ? "text-white" : "text-ink")}>{title}</h2>
        {intro && <p className={cx("mt-5 max-w-2xl text-lg", tone === "ink" ? "text-white/80" : "text-ink-muted")}>{intro}</p>}
        {children && <div className="mt-12">{children}</div>}
      </div>
    </section>
  );
}

export function PageHero({ eyebrow, title, intro, children }: { eyebrow?: string; title: ReactNode; intro?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 pt-16 md:pb-16 md:pt-24">
      {eyebrow && <p className="mb-4 text-sm font-semibold text-signal-strong">{eyebrow}</p>}
      <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[1.05] text-ink md:text-6xl">{title}</h1>
      {intro && <p className="mt-6 max-w-2xl text-lg text-ink-muted md:text-xl">{intro}</p>}
      {children && <div className="mt-8">{children}</div>}
    </div>
  );
}

/** Capture réelle du produit (générée depuis l'espace de démonstration). */
export function Capture({ src, alt, width, height, className }: { src: string; alt: string; width: number; height: number; className?: string }) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`${base}/captures/${src}`} alt={alt} width={width} height={height} loading="lazy" decoding="async" className={cx("h-auto w-full", className)} />;
}
