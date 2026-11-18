import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPage } from "@/components/PublicPage";
import { getPublicPage } from "@/lib/server";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPublicPage((await params).slug);
  return page ? { title: `Prendre rendez-vous — ${page.name}`, description: page.profile.tagline || `Réservez en ligne avec ${page.name}.` } : {};
}

export default async function PublicBookingPage({ params }: Props) {
  const page = await getPublicPage((await params).slug);
  if (!page) notFound();
  return <PublicPage page={page} />;
}
