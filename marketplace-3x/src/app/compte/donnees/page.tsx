import { requireActor } from "@/server/auth/session";
import { ButtonLink, Card, CardHeader, Container, Field, Input, PageHeader } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { deleteAccountAction } from "@/app/actions/account";
import { ReopenCookies } from "@/components/layout/CookieBanner";

export const metadata = { title: "Mes données" };
export default async function Data() {
  await requireActor("/compte/donnees");
  return (
    <Container className="max-w-3xl py-10">
      <PageHeader title="Mes données personnelles" subtitle="Vos droits au titre du RGPD : accès, portabilité, rectification, effacement, opposition." />
      <Card className="mb-6"><CardHeader title="Télécharger mes données" subtitle="Export complet au format JSON (droit d'accès et de portabilité)" />
        <div className="p-5"><ButtonLink href="/api/me/export" variant="secondary">Télécharger l&apos;export</ButtonLink></div></Card>
      <Card className="mb-6"><CardHeader title="Cookies" /><div className="p-5 text-sm"><ReopenCookies /></div></Card>
      <Card><CardHeader title="Supprimer mon compte" subtitle="Vos annonces sont retirées et vos données d'identification effacées. Les données de transaction sont conservées de façon dissociée pendant la durée légale (obligations comptables et fiscales)." />
        <Form action={deleteAccountAction} className="space-y-3 p-5">
          <Field label="Tapez SUPPRIMER pour confirmer"><Input name="confirm" required /></Field>
          <Submit variant="danger" confirm="Cette action est définitive. Continuer ?">Supprimer définitivement</Submit>
        </Form>
      </Card>
    </Container>
  );
}
