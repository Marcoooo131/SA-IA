import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Badge, Card, CardHeader, Checkbox, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { supplierProfileAction } from "@/app/actions/account";
import { verificationLabel } from "@/lib/labels";

export default async function SupplierProfileEdit() {
  const actor = await requireActor();
  const p = await db.supplierProfile.findUniqueOrThrow({ where: { userId: actor.id } });
  return (
    <>
      <PageHeader title="Entreprise" subtitle="Informations légales affichées aux acheteurs (obligation d'identification du vendeur professionnel)." />
      <Card className="mb-6 p-5"><p className="text-sm text-ink-3">Vérification</p><Badge tone={p.verificationStatus === "VERIFIED" ? "success" : "warning"}>{verificationLabel[p.verificationStatus]}</Badge>{p.verificationNote && <p className="mt-1 text-sm">{p.verificationNote}</p>}</Card>
      <Card><CardHeader title="Fiche entreprise" />
        <Form action={supplierProfileAction} className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Raison sociale"><Input name="companyName" defaultValue={p.companyName} required /></Field>
          <Field label="Forme juridique"><Input name="legalForm" defaultValue={p.legalForm ?? ""} /></Field>
          <Field label="SIRET"><Input name="siret" defaultValue={p.siret ?? ""} /></Field>
          <Field label="N° TVA intracommunautaire"><Input name="vatNumber" defaultValue={p.vatNumber ?? ""} /></Field>
          <Field label="Site web"><Input name="website" defaultValue={p.website ?? ""} /></Field>
          <Field label="Délai d'expédition par défaut (jours)"><Input name="defaultShippingDays" type="number" defaultValue={p.defaultShippingDays} /></Field>
          <Field label="Présentation" className="md:col-span-2"><Textarea name="description" defaultValue={p.description ?? ""} /></Field>
          {(p.verificationStatus === "UNVERIFIED" || p.verificationStatus === "REJECTED") && <Checkbox name="requestVerification" label="Demander la vérification de l'entreprise" className="md:col-span-2" />}
          <div><Submit variant="accent">Enregistrer</Submit></div>
        </Form>
      </Card>
    </>
  );
}
