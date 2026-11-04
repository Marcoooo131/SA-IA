import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Alert, Badge, Card, CardHeader, Container, Field, Input, PageHeader } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { passwordAction, profileAction } from "@/app/actions/account";
import { resendVerificationAction } from "@/app/(auth)/actions";
import { roleLabel } from "@/lib/labels";

export const metadata = { title: "Mon compte" };
export default async function Account() {
  const actor = await requireActor("/compte");
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  return (
    <Container className="max-w-3xl py-10">
      <PageHeader title="Mon compte" subtitle={<span className="flex flex-wrap gap-2">{actor.roles.map((r) => <Badge key={r}>{roleLabel[r]}</Badge>)}</span>} />
      <nav className="mb-6 flex flex-wrap gap-2 text-sm">
        {[["/compte/paiements", "Versements & vérification"], ["/compte/parrainage", "Parrainage"], ["/compte/donnees", "Mes données (RGPD)"], ["/notifications", "Notifications"]].map(([h, l]) => <Link key={h} href={h} className="rounded-full border border-line bg-white px-3 py-1.5 hover:border-ink-3">{l}</Link>)}
      </nav>
      {!u.emailVerifiedAt && (
        <div className="mb-6"><Alert tone="warning" title="Adresse e-mail non confirmée">
          <Form action={resendVerificationAction} className="mt-2"><Submit size="sm" variant="secondary">Renvoyer l&apos;e-mail de confirmation</Submit></Form>
        </Alert></div>
      )}
      <Card className="mb-6"><CardHeader title="Informations personnelles" />
        <Form action={profileAction} className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Nom affiché"><Input name="displayName" defaultValue={u.displayName} required /></Field>
          <Field label="E-mail"><Input value={u.email} disabled /></Field>
          <Field label="Ville"><Input name="city" defaultValue={u.city ?? ""} /></Field>
          <Field label="Code postal"><Input name="postalCode" defaultValue={u.postalCode ?? ""} /></Field>
          <div><Submit>Enregistrer</Submit></div>
        </Form>
      </Card>
      <Card><CardHeader title="Mot de passe" subtitle="Le changement déconnecte toutes vos sessions." />
        <Form action={passwordAction} className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Mot de passe actuel"><Input name="current" type="password" required /></Field>
          <Field label="Nouveau mot de passe"><Input name="password" type="password" required minLength={10} /></Field>
          <div><Submit variant="secondary">Changer le mot de passe</Submit></div>
        </Form>
      </Card>
    </Container>
  );
}
