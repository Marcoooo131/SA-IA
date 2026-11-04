import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { publicProductInclude } from "@/server/services/catalog";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { ProductGrid } from "@/components/product/ProductCard";

export default async function Favorites() {
  const actor = await requireActor("/espace/favoris");
  const favs = await db.favorite.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, include: { product: { include: publicProductInclude } } });
  return (<><PageHeader title="Mes favoris" />{favs.length ? <ProductGrid products={favs.map((f) => f.product)} cols={4} /> : <EmptyState title="Aucun favori" text="Touchez le cœur sur une annonce pour la retrouver ici." action={<ButtonLink href="/recherche" variant="accent">Explorer</ButtonLink>} />}</>);
}
