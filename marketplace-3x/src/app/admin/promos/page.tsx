import { db } from "@/server/db";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { ActionButton, Form, Submit } from "@/components/ui/Form";
import { promoAction, promoToggleAction } from "@/app/actions/admin";
import { formatBps, formatEUR } from "@/lib/money";
import { formatDate } from "@/lib/format";

export default async function Promos() {
  const promos = await db.promoCode.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title="Codes promotionnels" subtitle="Remises financées par la plateforme : les revenus des vendeurs et des indépendants ne sont pas réduits." />
      <Card className="mb-6"><CardHeader title="Créer un code" />
        <Form action={promoAction} className="grid gap-3 p-5 md:grid-cols-6" resetOnSuccess>
          <Field label="Code"><Input name="code" required className="uppercase" /></Field>
          <Field label="Type"><Select name="type"><option value="PERCENT">%</option><option value="FIXED">€</option></Select></Field>
          <Field label="Valeur"><Input name="value" required /></Field>
          <Field label="Commande min. (€)"><Input name="minOrder" /></Field>
          <Field label="Utilisations max."><Input name="maxUses" type="number" /></Field>
          <Field label="Valable jusqu'au"><Input name="validUntil" type="date" /></Field>
          <div><Submit variant="accent">Créer</Submit></div>
        </Form></Card>
      <Card><Table><thead><tr><Th>Code</Th><Th>Remise</Th><Th>Minimum</Th><Th>Utilisations</Th><Th>Fin</Th><Th>Statut</Th><Th /></tr></thead>
        <tbody>{promos.map((p) => <tr key={p.id}><Td className="font-mono">{p.code}</Td><Td>{p.type === "PERCENT" ? formatBps(p.value) : formatEUR(p.value)}</Td><Td>{formatEUR(p.minOrderCents)}</Td><Td>{p.usedCount}{p.maxUses ? ` / ${p.maxUses}` : ""}</Td><Td>{formatDate(p.validUntil)}</Td><Td><Badge tone={p.active ? "success" : "neutral"}>{p.active ? "Actif" : "Inactif"}</Badge></Td><Td><ActionButton action={promoToggleAction} fields={{ id: p.id }}>{p.active ? "Désactiver" : "Activer"}</ActionButton></Td></tr>)}</tbody></Table></Card>
    </>
  );
}
