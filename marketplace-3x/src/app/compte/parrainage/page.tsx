import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCommerceSettings } from "@/server/settings";
import { Badge, Card, CardHeader, Container, Input, PageHeader, Stat, StatGrid } from "@/components/ui";
import { formatEUR } from "@/lib/money";
import { formatDate } from "@/lib/format";

export default async function Referral() {
  const actor = await requireActor("/compte/parrainage");
  const [u, settings, rewards, referees] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actor.id } }), getCommerceSettings(),
    db.referralReward.findMany({ where: { referrerId: actor.id }, orderBy: { createdAt: "desc" } }),
    db.user.count({ where: { referredById: actor.id } }),
  ]);
  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/inscription?parrain=${u.referralCode}`;
  return (
    <Container className="max-w-3xl py-10">
      <PageHeader title="Parrainage" subtitle={settings.referralEnabled ? `Invitez vos proches : ${formatEUR(settings.referralRewardCents)} de récompense lorsque votre filleul réalise un premier achat d'au moins ${formatEUR(settings.referralMinOrderCents)}.` : "Le programme de parrainage est momentanément suspendu."} />
      <StatGrid><Stat label="Filleuls inscrits" value={referees} /><Stat label="Récompenses" value={formatEUR(rewards.reduce((a, r) => a + (r.status !== "CANCELLED" ? r.amountCents : 0), 0))} /></StatGrid>
      <Card className="mt-6 p-5"><p className="mb-2 text-sm font-medium">Votre lien personnel</p><Input readOnly value={link} /><p className="mt-2 text-xs text-ink-3">Code : <strong>{u.referralCode}</strong></p></Card>
      <Card className="mt-6"><CardHeader title="Récompenses" subtitle="Validées par l'équipe après contrôle anti-fraude" />
        <ul className="divide-y divide-line text-sm">{rewards.map((r) => <li key={r.id} className="flex justify-between p-4"><span>{r.reason} · {formatDate(r.createdAt)}</span><span>{formatEUR(r.amountCents)} <Badge>{{ PENDING: "En attente", AVAILABLE: "Disponible", PAID: "Versée", CANCELLED: "Annulée" }[r.status]}</Badge></span></li>)}</ul>
        {!rewards.length && <p className="p-5 text-sm text-ink-3">Aucune récompense pour le moment.</p>}
      </Card>
    </Container>
  );
}
