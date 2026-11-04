import { AuthShell } from "../AuthShell";
import { Form, Submit } from "@/components/ui/Form";
import { Field, Input } from "@/components/ui";
import { forgotAction } from "../actions";

export const metadata = { title: "Mot de passe oublié" };
export default function Page() {
  return (
    <AuthShell title="Mot de passe oublié" subtitle="Indiquez votre adresse : nous vous enverrons un lien valable une heure.">
      <Form action={forgotAction} className="space-y-4">
        <Field label="Adresse e-mail"><Input name="email" type="email" required /></Field>
        <Submit className="w-full" size="lg">Envoyer le lien</Submit>
      </Form>
    </AuthShell>
  );
}
