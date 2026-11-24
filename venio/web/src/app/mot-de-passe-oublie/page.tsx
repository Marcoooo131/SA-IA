"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert, Button, Field, Input, Logo } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try { await api("/auth/password/forgot", { method: "POST", body: { email } }); setSent(true); }
    catch (err) { setError(errorMessage(err)); }
    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <Link href="/"><Logo className="text-lg" /></Link>
      <h1 className="mt-10 font-display text-4xl font-semibold">Mot de passe oublié</h1>
      {sent ? (
        <div className="mt-6 space-y-4">
          <Alert kind="success" title="Vérifiez votre boîte mail">
            Si un compte existe pour {email}, vous allez recevoir un lien pour choisir un nouveau mot de passe. Il est valable 30 minutes. Pensez à regarder dans les courriers indésirables.
          </Alert>
          <p className="text-sm text-ink-muted"><Link className="font-medium text-signal-strong underline underline-offset-2" href="/connexion">Retour à la connexion</Link></p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-ink-muted">Indiquez l&apos;email de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
          <Field label="Email"><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading} size="lg" className="w-full">Recevoir le lien</Button>
          <p className="text-center text-sm text-ink-muted"><Link className="font-medium text-signal-strong underline underline-offset-2" href="/connexion">Retour à la connexion</Link></p>
        </form>
      )}
    </main>
  );
}
