import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { balances } from "@/server/services/finance";
import { ButtonLink, Card, CardHeader, PageHeader, Stat, StatGrid } from "@/components/ui";
import { CommissionTable } from "@/components/CommissionTable";
import { formatEUR } from "@/lib/money";

export default async function Revenue() {
  const actor = await requireActor();
  const [b, rows] = await Promise.all([
    balances(actor.id),
    db.commissionTransaction.findMany({ where: { beneficiaryId: actor.id }, orderBy: { createdAt: "desc" }, take: 100, include: { orderItem: { select: { title: true, order: { select: { id: true, number: true } } } } } }),
  ]);
  return (
    <>
      <PageHeader title="Revenus" subtitle="Vos revenus deviennent disponibles après la confirmation de réception et l'expiration du délai de validation." action={<ButtonLink href="/compte/paiements" variant="accent">Compte de versement</ButtonLink>} />
      <StatGrid>
        <Stat label="En cours de validation" value={formatEUR(b.validating + b.validated)} />
        <Stat label="Disponibles" value={formatEUR(b.available)} />
        <Stat label="Versés" value={formatEUR(b.paid)} />
        <Stat label="Gelés (litiges)" value={formatEUR(b.disputed)} />
      </StatGrid>
      <Card className="mt-6"><CardHeader title="Historique financier" subtitle="Chaque ligne correspond à un mouvement traçable" /><CommissionTable rows={rows} /></Card>
    </>
  );
}
