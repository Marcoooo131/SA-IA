import { AuthShell } from "../AuthShell";
import { Form, Submit } from "@/components/ui/Form";
import { Field, Input } from "@/components/ui";
import { resetAction } from "../actions";

export const metadata = { title: "Nouveau mot de passe" };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Choisissez un nouveau mot de passe">
      <Form action={resetAction} className="space-y-4">
        <input type="hidden" name="token" value={token ?? ""} />
        <Field label="Nouveau mot de passe" hint="10 caractères minimum, lettres et chiffres."><Input name="password" type="password" required minLength={10} /></Field>
        <Field label="Confirmation"><Input name="confirm" type="password" required minLength={10} /></Field>
        <Submit className="w-full" size="lg">Enregistrer</Submit>
      </Form>
    </AuthShell>
  );
}
