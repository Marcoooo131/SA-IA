import { redirect } from "next/navigation";
import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { getCart } from "@/server/services/orders";
import { db } from "@/server/db";
import { Card, Checkbox, Container, Field, Input, PageHeader, Select, Alert } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { checkoutAction } from "@/app/actions/shop";
import { carriers } from "@/lib/labels";
import { formatEUR } from "@/lib/money";
import { paymentProviderInfo } from "@/server/payments/info";

export const metadata = { title: "Commande" };

export default async function CheckoutPage() {
  const actor = await requireActor("/commande");
  const cart = await getCart(actor.id);
  if (!cart?.items.length) redirect("/panier");
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  const subtotal = cart.items.reduce((a, i) => a + (i.variant?.priceCents ?? i.product.priceCents) * i.quantity, 0);
  const hasPro = cart.items.some((i) => i.product.owner.primaryRole === "SUPPLIER");
  const hasP2P = cart.items.some((i) => i.product.owner.primaryRole !== "SUPPLIER");
  const info = paymentProviderInfo();
  return (
    <Container className="max-w-4xl py-10">
      <PageHeader title="Finaliser la commande" />
      <Form action={checkoutAction} className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="font-semibold">Adresse de livraison</h2>
            <Field label="Nom du destinataire"><Input name="shippingName" defaultValue={user.displayName} required /></Field>
            <Field label="Adresse"><Input name="shippingLine1" required autoComplete="address-line1" /></Field>
            <Field label="Complément (facultatif)"><Input name="shippingLine2" autoComplete="address-line2" /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Code postal"><Input name="shippingPostal" defaultValue={user.postalCode ?? ""} required inputMode="numeric" maxLength={5} /></Field>
              <Field label="Ville" className="col-span-2"><Input name="shippingCity" defaultValue={user.city ?? ""} required /></Field>
            </div>
            <Field label="Transporteur souhaité"><Select name="carrier" defaultValue="colissimo">{carriers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
          </Card>
          <Card className="space-y-3 p-5 text-sm text-ink-2">
            <h2 className="font-semibold text-ink">Informations précontractuelles</h2>
            {hasPro && <p>• Articles vendus par un <strong>professionnel</strong> : droit de rétractation de 14 jours à compter de la réception, garanties légales de conformité et des vices cachés.</p>}
            {hasP2P && <p>• Articles vendus par un <strong>particulier</strong> : le droit de la consommation (rétractation, garantie de conformité) ne s&apos;applique pas. Vous bénéficiez de la protection de la plateforme : le vendeur n&apos;est payé qu&apos;après confirmation de la réception, et un litige peut être ouvert en cas de non-conformité.</p>}
            <p>• Le paiement est opéré par un prestataire de services de paiement agréé. Chaque vendeur expédie son colis séparément.</p>
            <Checkbox name="acceptTerms" required label={<>J&apos;ai lu et j&apos;accepte les <Link href="/legal/cgv" className="underline" target="_blank">conditions générales de vente</Link>.</>} />
          </Card>
        </div>
        <Card className="h-fit space-y-4 p-5">
          <p className="text-sm text-ink-3">{cart.items.length} article(s) · sous-total</p>
          <p className="text-2xl font-semibold">{formatEUR(subtotal)}</p>
          <Field label="Code promotionnel"><Input name="promoCode" placeholder="BIENVENUE10" className="uppercase" /></Field>
          <Submit size="lg" className="w-full">Payer</Submit>
          {info.sandbox && <Alert tone="warning">{info.name === "demo" ? "Bac à sable : aucun paiement réel ne sera effectué." : "Stripe en mode test : utilisez la carte 4242 4242 4242 4242."}</Alert>}
        </Card>
      </Form>
    </Container>
  );
}
