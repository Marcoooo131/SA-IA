import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui";
import { LEGAL_DOCS } from "@/content/legal";

type Props = { params: Promise<{ doc: string }> };

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ doc: d.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { doc } = await params;
  const d = LEGAL_DOCS.find((x) => x.slug === doc);
  return d ? { title: d.title, robots: { index: false, follow: true } } : {};
}

/** Mise en évidence des champs à compléter, pour qu'aucun ne passe inaperçu. */
function Text({ text }: { text: string }) {
  const parts = text.split(/(\[À compléter[^\]]*\])/g);
  return <>{parts.map((p, i) => p.startsWith("[À compléter") ? <mark key={i} className="rounded bg-warning-soft px-1 text-warning">{p}</mark> : p)}</>;
}

export default async function LegalPage({ params }: Props) {
  const { doc } = await params;
  const d = LEGAL_DOCS.find((x) => x.slug === doc);
  if (!d) notFound();
  return (
    <article className="mx-auto max-w-2xl px-5 pb-24 pt-14">
      <h1 className="font-display text-4xl font-semibold text-ink md:text-5xl">{d.title}</h1>
      <p className="mt-3 text-sm text-ink-muted">Version du {d.version}</p>
      {d.sections.some((s) => s.paragraphs.some((p) => p.includes("[À compléter"))) && (
        <div className="mt-6"><Alert kind="warning" title="Document en cours de finalisation">Les informations surlignées seront renseignées à la création de l&apos;entreprise.</Alert></div>
      )}
      {d.sections.map((s) => (
        <section key={s.title} className="mt-10">
          <h2 className="text-xl font-semibold text-ink">{s.title}</h2>
          {s.paragraphs.map((p) => <p key={p.slice(0, 40)} className="mt-3 leading-relaxed text-ink"><Text text={p} /></p>)}
        </section>
      ))}
      <nav aria-label="Autres documents" className="mt-14 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-6 text-sm">
        {LEGAL_DOCS.filter((x) => x.slug !== d.slug).map((x) => <Link key={x.slug} href={`/legal/${x.slug}`} className="text-ink-muted hover:text-ink">{x.title}</Link>)}
      </nav>
    </article>
  );
}
