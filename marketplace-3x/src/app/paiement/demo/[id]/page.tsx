import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Alert, Card, Container } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { demoPayAction } from "./actions";
import { formatEUR } from "@/lib/money";

/** Page du bac à sable de paiement — affichée uniquement avec PAYMENT_PROVIDER=demo. */
export default async function DemoPayment({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const payment = await db.payment.findFirst({ where: { id, buyerId: actor.id, provider: "demo" }, include: { orders: true } });
  if (!payment || (process.env.PAYMENT_PROVIDER ?? "demo") !== "demo") notFound();
  return (
    <Container className="max-w-lg py-16">
      <Card className="p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-warning">Bac à sable de paiement</p>
        <h1 className="mt-2 text-2xl font-semibold">{formatEUR(payment.amountCents)}</h1>
        <p className="mt-1 text-sm text-ink-3">{payment.orders.length} commande(s) · {payment.status}</p>
        <div className="my-5"><Alert tone="warning" title="Aucun argent réel n'est débité">Ce simulateur remplace la page du prestataire en développement. Il déclenche exactement le même traitement qu&apos;un webhook de paiement réel (répartition, notifications, stock). En production, configurez Stripe (PAYMENT_PROVIDER=stripe).</Alert></div>
        {payment.status === "PENDING" ? (
          <div className="flex gap-2">
            <Form action={demoPayAction}><input type="hidden" name="paymentId" value={payment.id} /><input type="hidden" name="outcome" value="success" /><Submit>Simuler un paiement accepté</Submit></Form>
            <Form action={demoPayAction}><input type="hidden" name="paymentId" value={payment.id} /><input type="hidden" name="outcome" value="fail" /><Submit variant="danger">Simuler un refus</Submit></Form>
          </div>
        ) : <p className="text-sm">Ce paiement a déjà été traité.</p>}
      </Card>
    </Container>
  );
}
