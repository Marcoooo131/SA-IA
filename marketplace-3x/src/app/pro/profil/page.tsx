import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Badge, Card, CardHeader, Checkbox, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { proProfileAction } from "@/app/actions/account";
import { verificationLabel } from "@/lib/labels";

export default async function ProProfileEdit() {
  const actor = await requireActor();
  const [p, categories] = await Promise.all([db.professionalProfile.findUniqueOrThrow({ where: { userId: actor.id } }), db.category.findMany({ where: { parentId: null, restricted: false }, orderBy: { position: "asc" } })]);
  return (
    <>
      <PageHeader title="Profil public" subtitle="Ce que voient les particuliers dans l'annuaire." action={<Link href={`/independants/${actor.id}`} className="text-sm underline">Voir mon profil public</Link>} />
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div><p className="text-sm text-ink-3">Statut de vérification</p><Badge tone={p.verificationStatus === "VERIFIED" ? "success" : "warning"}>{verificationLabel[p.verificationStatus]}</Badge>{p.verificationNote && <p className="mt-1 text-sm text-ink-2">{p.verificationNote}</p>}</div>
        <p className="text-sm text-ink-3">Code commercial : <strong className="text-pro">{p.refCode}</strong></p>
      </Card>
      <Card><CardHeader title="Présentation" />
        <Form action={proProfileAction} className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Accroche" className="md:col-span-2"><Input name="headline" defaultValue={p.headline ?? ""} maxLength={140} placeholder="Ex. Spécialiste high-tech à Rennes" /></Field>
          <Field label="Présentation" className="md:col-span-2"><Textarea name="bio" defaultValue={p.bio ?? ""} /></Field>
          <Field label="Zone d'intervention (ville)"><Input name="serviceArea" defaultValue={p.serviceArea ?? ""} /></Field>
          <Field label="Rayon (km)"><Input name="serviceRadiusKm" type="number" defaultValue={p.serviceRadiusKm} /></Field>
          <Field label="Spécialités (séparées par des virgules)"><Input name="specialties" defaultValue={p.specialties.join(", ")} /></Field>
          <Field label="Commission habituelle (%)"><Input name="defaultCommission" defaultValue={(p.defaultCommissionBps / 100).toString()} /></Field>
          <Field label="SIRET"><Input name="siret" defaultValue={p.siret ?? ""} /></Field>
          <div className="flex items-end"><Checkbox name="offersPickup" defaultChecked={p.offersPickup} label="Je peux récupérer, préparer et expédier les articles" /></div>
          <fieldset className="md:col-span-2"><legend className="mb-1.5 text-sm font-medium">Catégories commercialisées</legend>
            <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3">{categories.map((c) => <Checkbox key={c.slug} name="categorySlugs" value={c.slug} defaultChecked={p.categorySlugs.includes(c.slug)} label={c.name} />)}</div></fieldset>
          {(p.verificationStatus === "UNVERIFIED" || p.verificationStatus === "REJECTED") && <Checkbox name="requestVerification" label="Demander la vérification de mon profil (SIRET requis)" className="md:col-span-2" />}
          <div><Submit variant="accent">Enregistrer</Submit></div>
        </Form>
      </Card>
    </>
  );
}
