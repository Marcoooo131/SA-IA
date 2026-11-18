import { ArrowRight, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/SiteChrome";
import { GUIDES } from "@/content/guides";

export const metadata: Metadata = {
  title: "Ressources",
  description: "Guides pratiques : réduire les appels manqués, préparer une visite technique, réduire les absences aux rendez-vous.",
};

export default function ResourcesPage() {
  return (
    <>
      <PageHero eyebrow="Ressources" title="Des conseils concrets pour ne plus perdre de rendez-vous."
        intro="Des guides courts, issus du terrain, à appliquer avec ou sans Venio." />
      <div className="mx-auto grid max-w-6xl gap-4 px-5 pb-24 md:grid-cols-3">
        {GUIDES.map((g) => (
          <Link key={g.slug} href={`/ressources/${g.slug}`} className="group flex flex-col rounded-frame border border-line bg-surface p-6 transition-colors hover:border-ink/40">
            <p className="flex items-center gap-1.5 text-xs text-ink-subtle"><Clock aria-hidden className="h-3.5 w-3.5" />{g.minutes} min de lecture</p>
            <h2 className="mt-3 font-display text-2xl font-semibold leading-snug text-ink">{g.title}</h2>
            <p className="mt-3 flex-1 text-sm text-ink-muted">{g.summary}</p>
            <p className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-signal-strong">Lire le guide<ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></p>
          </Link>
        ))}
      </div>
    </>
  );
}
