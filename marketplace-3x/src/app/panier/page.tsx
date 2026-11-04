import Image from "next/image";
import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { getCart } from "@/server/services/orders";
import { Alert, ButtonLink, Card, Container, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/Form";
import { cartQtyAction } from "@/app/actions/shop";
import { formatEUR } from "@/lib/money";

export const metadata = { title: "Panier" };

export default async function CartPage({ searchParams }: { searchParams: Promise<{ annule?: string }> }) {
  const actor = await requireActor("/panier");
  const { annule } = await searchParams;
  const cart = await getCart(actor.id);
  const items = cart?.items ?? [];
  const groups = new Map<string, typeof items>();
  for (const i of items) groups.set(i.product.ownerId, [...(groups.get(i.product.ownerId) ?? []), i]);
  const price = (i: (typeof items)[number]) => i.variant?.priceCents ?? i.product.priceCents;
  const subtotal = items.reduce((a, i) => a + price(i) * i.quantity, 0);
  const shipping = [...groups.values()].reduce((a, g) => a + Math.max(...g.map((i) => i.product.shippingCents)), 0);
  return (
    <Container className="py-10">
      <PageHeader title="Votre panier" subtitle={items.length ? `${items.length} article${items.length > 1 ? "s" : ""} · ${groups.size} vendeur${groups.size > 1 ? "s" : ""}` : undefined} />
      {annule && <div className="mb-4"><Alert tone="warning">Le paiement a été annulé. Vos articles ont été remis en vente ; ajoutez-les à nouveau si besoin.</Alert></div>}
      {!items.length ? <EmptyState title="Votre panier est vide" action={<ButtonLink href="/recherche">Parcourir les annonces</ButtonLink>} /> : (
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {[...groups.entries()].map(([sellerId, g]) => (
              <Card key={sellerId}>
                <div className="border-b border-line px-5 py-3 text-sm">Vendu par <span className="font-semibold">{g[0].product.owner.supplierProfile?.companyName ?? g[0].product.owner.displayName}</span> · un colis</div>
                <ul className="divide-y divide-line">
                  {g.map((i) => {
                    const unavailable = i.product.status !== "ACTIVE";
                    return (
                      <li key={i.id} className="flex gap-4 p-4">
                        <Link href={`/produit/${i.productId}`} className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-black/5">
                          {i.product.images[0] && <Image src={i.product.images[0].url} alt="" fill sizes="80px" className="object-cover" />}
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link href={`/produit/${i.productId}`} className="font-medium hover:underline">{i.product.title}</Link>
                          {i.variant && <p className="text-sm text-ink-3">{i.variant.name}</p>}
                          {i.attributionId && <p className="text-xs text-pro">Recommandé par un indépendant</p>}
                          {i.offerId && <p className="text-xs text-success">Prix négocié appliqué à la commande</p>}
                          {unavailable && <p className="text-xs text-danger">Plus disponible</p>}
                          <div className="mt-2 flex items-center gap-2">
                            {i.quantity > 1 && <ActionButton action={cartQtyAction} fields={{ itemId: i.id, quantity: String(i.quantity - 1) }} variant="secondary">−</ActionButton>}
                            <span className="text-sm">Qté {i.quantity}</span>
                            <ActionButton action={cartQtyAction} fields={{ itemId: i.id, quantity: String(i.quantity + 1) }} variant="secondary">+</ActionButton>
                            <ActionButton action={cartQtyAction} fields={{ itemId: i.id, quantity: "0" }} variant="ghost">Retirer</ActionButton>
                          </div>
                        </div>
                        <p className="font-semibold">{formatEUR(price(i) * i.quantity)}</p>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </div>
          <Card className="h-fit p-5 lg:sticky lg:top-24">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-2">Articles</dt><dd>{formatEUR(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Livraison estimée</dt><dd>{formatEUR(shipping)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total estimé</dt><dd>{formatEUR(subtotal + shipping)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-ink-3">Le montant définitif (offres acceptées, codes promotionnels) est calculé à l&apos;étape suivante.</p>
            <ButtonLink href="/commande" size="lg" className="mt-4 w-full">Passer la commande</ButtonLink>
          </Card>
        </div>
      )}
    </Container>
  );
}
