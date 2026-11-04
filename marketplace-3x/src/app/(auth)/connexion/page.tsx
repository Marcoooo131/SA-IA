import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { Form, Submit } from "@/components/ui/Form";
import { Field, Input } from "@/components/ui";
import { loginAction } from "../actions";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell title="Bon retour parmi nous" subtitle="Connectez-vous à votre espace.">
      <Form action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Adresse e-mail"><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Mot de passe"><Input name="password" type="password" autoComplete="current-password" required /></Field>
        <div className="text-right text-sm"><Link href="/mot-de-passe-oublie" className="text-ink-2 underline">Mot de passe oublié ?</Link></div>
        <Submit className="w-full" size="lg">Se connecter</Submit>
      </Form>
      <p className="mt-6 text-center text-sm text-ink-2">Pas encore de compte ? <Link href="/inscription" className="font-medium text-brand">Créer un compte</Link></p>
      <div className="mt-6 rounded-2xl bg-canvas p-4 text-xs text-ink-2">
        <p className="mb-1 font-semibold text-ink">Comptes de démonstration (données fictives)</p>
        <p>Mot de passe : <code className="rounded bg-white px-1">demo-m3x-2026</code></p>
        <ul className="mt-1 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <li>camille@demo.m3x — particulière</li><li>lucas@demo.m3x — acheteur</li>
          <li>sofiane@demo.m3x — indépendant</li><li>technopro@demo.m3x — fournisseur</li>
          <li>admin@demo.m3x — administrateur</li><li>noah@demo.m3x — pro non vérifié</li>
        </ul>
      </div>
    </AuthShell>
  );
}
