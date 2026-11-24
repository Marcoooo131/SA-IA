"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Button, Field, Input, Logo } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export default function NewPassword() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => setToken(new URLSearchParams(window.location.search).get("jeton") ?? ""), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 10) { setError("Le mot de passe doit contenir au moins 10 caractères."); return; }
    if (password !== confirm) { setError("Les deux mots de passe ne sont pas identiques."); return; }
    setLoading(true);
    try { await api("/auth/password/reset", { method: "POST", body: { token, password } }); setDone(true); }
    catch (err) { setError(errorMessage(err)); }
    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <Link href="/"><Logo className="text-lg" /></Link>
      <h1 className="mt-10 font-display text-4xl font-semibold">Nouveau mot de passe</h1>
      {done ? (
        <div className="mt-6 space-y-4">
          <Alert kind="success" title="Mot de passe modifié">Par sécurité, toutes vos sessions ont été fermées. Connectez-vous avec votre nouveau mot de passe.</Alert>
          <Link href="/connexion" className="inline-flex font-medium text-signal-strong underline underline-offset-2">Se connecter</Link>
        </div>
      ) : token === "" ? (
        <div className="mt-6 space-y-4">
          <Alert>Ce lien est incomplet. Ouvrez le lien reçu par email, ou demandez-en un nouveau.</Alert>
          <Link href="/mot-de-passe-oublie" className="inline-flex font-medium text-signal-strong underline underline-offset-2">Demander un nouveau lien</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Nouveau mot de passe" hint="10 caractères minimum."><Input required minLength={10} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Confirmez le mot de passe"><Input required type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
          {error && (
            <Alert>{error}{/plus valable/.test(error) && <> <Link href="/mot-de-passe-oublie" className="font-semibold underline underline-offset-2">Demander un nouveau lien</Link></>}</Alert>
          )}
          <Button type="submit" loading={loading} disabled={token === null} size="lg" className="w-full">Enregistrer</Button>
        </form>
      )}
    </main>
  );
}
