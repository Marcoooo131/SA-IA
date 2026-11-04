import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { balances } from "@/server/services/finance";
import { ButtonLink, Card, CardHeader, PageHeader, Stat, StatGrid, Tabs } from "@/components/ui";
import { CommissionTable } from "@/components/CommissionTable";
import { formatEUR } from "@/lib/money";
import type { CommissionStatus } from "@prisma/client";

export default async function Commissions({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const actor = await requireActor();
  const { s } = await searchParams;
  const valid: CommissionStatus[] = ["PENDING", "VALIDATING", "VALIDATED", "AVAILABLE", "PAID", "CANCELLED", "DISPUTED"];
  const status = valid.includes(s as CommissionStatus) ? (s as CommissionStatus) : undefined;
  const [b, rows] = await Promise.all([
    balances(actor.id),
    db.commissionTransaction.findMany({ where: { beneficiaryId: actor.id, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 200, include: { orderItem: { select: { title: true, order: { select: { id: true, number: true } } } } } }),
  ]);
  return (
    <>
      <PageHeader title="Commissions" subtitle="Une commission n'est payable qu'après paiement confirmé, réception par l'acheteur et fin du délai de validation." action={<ButtonLink href="/compte/paiements" variant="accent">Versements</ButtonLink>} />
      <StatGrid>
        <Stat label="En validation" value={formatEUR(b.validating)} hint="Paiement reçu, livraison en cours" />
        <Stat label="Validées" value={formatEUR(b.validated)} hint="Délai de rétractation en cours" />
        <Stat label="Disponibles" value={formatEUR(b.available)} />
        <Stat label="Versées" value={formatEUR(b.paid)} />
      </StatGrid>
      <Card className="mt-6"><CardHeader title="Détail" />
        <div className="px-4 pt-3"><Tabs current={status ? `/pro/commissions?s=${status}` : "/pro/commissions"} items={[{ href: "/pro/commissions", label: "Toutes" }, ...(["VALIDATING", "VALIDATED", "AVAILABLE", "PAID", "DISPUTED", "CANCELLED"] as const).map((x) => ({ href: `/pro/commissions?s=${x}`, label: { VALIDATING: "En validation", VALIDATED: "Validées", AVAILABLE: "Disponibles", PAID: "Versées", DISPUTED: "En litige", CANCELLED: "Annulées" }[x] }))]} /></div>
        <CommissionTable rows={rows} /></Card>
    </>
  );
}
