import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { balances, refreshPayoutAccount } from "@/server/services/finance";
import { Alert, Badge, Card, CardHeader, Container, PageHeader, Stat, StatGrid, Table, Td, Th } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { payoutOnboardingAction } from "@/app/actions/account";
import { formatEUR } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { getCommerceSettings } from "@/server/settings";

export const metadata = { title: "Versements" };
export default async function Payouts({ searchParams }: { searchParams: Promise<{ retour?: string }> }) {
  const actor = await requireActor("/compte/paiements");
  const { retour } = await searchParams;
  if (retour) await refreshPayoutAccount(actor.id).catch(() => null);
  const [account, b, payouts, settings] = await Promise.all([
    db.payoutAccount.findUnique({ where: { userId: actor.id } }), balances(actor.id),
    db.payout.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" } }), getCommerceSettings(),
  ]);
  const st = account?.status ?? "NOT_STARTED";
  return (
    <Container className="max-w-4xl py-10">
      <PageHeader title="Versements" subtitle="Vos revenus sont transférés sur votre compte bancaire par notre prestataire de paiement agréé, après vérification de votre identité." />
      <StatGrid>
        <Stat label="En validation" value={formatEUR(b.validating + b.validated)} />
        <Stat label="Disponible" value={formatEUR(b.available)} hint={`Versement à partir de ${formatEUR(settings.minPayoutCents)}`} />
        <Stat label="Déjà versé" value={formatEUR(b.paid)} />
        <Stat label="Gelé (litiges)" value={formatEUR(b.disputed)} />
      </StatGrid>
      <Card className="mt-6"><CardHeader title="Compte bénéficiaire" action={<Badge tone={st === "VERIFIED" ? "success" : st === "NOT_STARTED" ? "neutral" : "warning"}>{{ NOT_STARTED: "Non configuré", PENDING: "Vérification en cours", VERIFIED: "Vérifié", RESTRICTED: "Informations requises" }[st]}</Badge>} />
        <div className="space-y-3 p-5 text-sm text-ink-2">
          <p>La vérification d&apos;identité (KYC) et la saisie de votre IBAN se font directement chez le prestataire de paiement : la plateforme ne stocke ni vos pièces d&apos;identité ni vos coordonnées bancaires.</p>
          {account?.provider === "demo" && <Alert tone="warning">Compte de démonstration : vérification simulée, aucun virement réel.</Alert>}
          {st !== "VERIFIED" && <Form action={payoutOnboardingAction}><Submit>{account ? "Compléter ma vérification" : "Configurer mon compte de versement"}</Submit></Form>}
          <p className="text-xs text-ink-3">Les versements sont déclenchés par l&apos;équipe financière à partir des montants disponibles (délai de validation écoulé, aucun litige en cours).</p>
        </div>
      </Card>
      <Card className="mt-6"><CardHeader title="Historique des versements" />
        {!payouts.length ? <p className="p-5 text-sm text-ink-3">Aucun versement.</p> : (
          <Table><thead><tr><Th>Date</Th><Th>Référence</Th><Th>Statut</Th><Th className="text-right">Montant</Th></tr></thead>
            <tbody>{payouts.map((p) => <tr key={p.id}><Td>{formatDate(p.createdAt)}</Td><Td className="font-mono text-xs">{p.providerRef ?? "—"}</Td><Td><Badge tone={p.status === "PAID" ? "success" : p.status === "FAILED" ? "danger" : "warning"}>{{ PAID: "Versé", FAILED: "Échec", PENDING: "En cours" }[p.status]}</Badge></Td><Td className="text-right font-semibold">{formatEUR(p.amountCents)}</Td></tr>)}</tbody></Table>
        )}
      </Card>
    </Container>
  );
}
