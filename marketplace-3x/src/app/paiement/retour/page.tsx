import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { ButtonLink, Card, Container } from "@/components/ui";
import { formatEUR } from "@/lib/money";

export default async function PaymentReturn({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const actor = await requireActor();
  const { payment: id } = await searchParams;
  const payment = id ? await db.payment.findFirst({ where: { id, buyerId: actor.id }, include: { orders: true } }) : null;
  const ok = payment?.status === "SUCCEEDED";
  return (
    <Container className="max-w-xl py-16 text-center">
      <Card className="p-8">
        {ok ? <CheckCircle2 className="mx-auto h-12 w-12 text-success" /> : <Clock className="mx-auto h-12 w-12 text-warning" />}
        <h1 className="mt-4 text-2xl font-semibold">{ok ? "Merci pour votre commande !" : "Paiement en cours de confirmation"}</h1>
        <p className="mt-2 text-ink-2">
          {ok ? `Paiement de ${formatEUR(payment!.amountCents)} confirmé. Les vendeurs ont été prévenus.`
            : "Nous attendons la confirmation du prestataire de paiement. Cette page se met à jour dès réception — vous serez aussi notifié."}
        </p>
        {payment && <ul className="mt-6 space-y-1 text-sm">{payment.orders.map((o) => <li key={o.id}><Link href={`/commandes/${o.id}`} className="underline">Commande {o.number}</Link></li>)}</ul>}
        <ButtonLink href="/espace/achats" className="mt-6">Suivre mes achats</ButtonLink>
        {!ok && <meta httpEquiv="refresh" content="4" />}
      </Card>
    </Container>
  );
}
