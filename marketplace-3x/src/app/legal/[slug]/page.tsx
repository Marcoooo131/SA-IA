import { notFound } from "next/navigation";
import { legalDocs } from "@/config/legal";
import { Alert, Container, PageHeader } from "@/components/ui";
import { brand } from "@/config/brand";

export function generateStaticParams() { return Object.keys(legalDocs).map((slug) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { return { title: legalDocs[(await params).slug]?.title ?? "Informations légales" }; }

export default async function Legal({ params }: { params: Promise<{ slug: string }> }) {
  const doc = legalDocs[(await params).slug];
  if (!doc) notFound();
  return (
    <Container className="max-w-3xl py-12">
      <PageHeader eyebrow={brand.name} title={doc.title} />
      <Alert tone="warning" title="Document provisoire">Trame à faire valider par un juriste spécialisé avant le lancement commercial.</Alert>
      <div className="mt-8 space-y-6">{doc.sections.map((s) => <section key={s.h}><h2 className="text-lg font-semibold">{s.h}</h2><p className="mt-1 leading-relaxed text-ink-2">{s.p}</p></section>)}</div>
    </Container>
  );
}
