import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass } from "@/components/ui";
import { GUIDES } from "@/content/guides";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const g = GUIDES.find((x) => x.slug === slug);
  return g ? { title: g.title, description: g.summary } : {};
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) notFound();
  return (
    <article className="mx-auto max-w-2xl px-5 pb-24 pt-14">
      <Link href="/ressources" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft aria-hidden className="h-4 w-4" />Ressources</Link>
      <h1 className="mt-6 font-display text-4xl font-semibold leading-tight text-ink md:text-5xl">{g.title}</h1>
      <p className="mt-5 text-lg text-ink-muted">{g.summary}</p>
      {g.sections.map((s) => (
        <section key={s.title} className="mt-10">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">{s.title}</h2>
          {s.paragraphs.map((p) => <p key={p.slice(0, 30)} className="mt-4 leading-relaxed text-ink">{p}</p>)}
          {s.list && <ul className="mt-4 list-disc space-y-2 pl-6 text-ink marker:text-signal-strong">{s.list.map((l) => <li key={l}>{l}</li>)}</ul>}
        </section>
      ))}
      <div className="mt-14 rounded-frame border border-line bg-surface p-6">
        <p className="font-semibold text-ink">Voir comment Venio applique ces conseils</p>
        <p className="mt-1 text-sm text-ink-muted">La démonstration montre le parcours complet, de l&apos;appel manqué au rendez-vous.</p>
        <Link href="/demo" className={`${buttonClass("primary")} mt-4`}>Lancer la démonstration</Link>
      </div>
    </article>
  );
}
