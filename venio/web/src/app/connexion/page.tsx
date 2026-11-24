"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field, Input, Logo } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/auth/login", { method: "POST", body: { email, password } });
      router.push("/app");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-5 py-16">
      <Link href="/"><Logo className="text-lg" /></Link>
      <h1 className="mt-10 font-display text-4xl font-semibold">Connexion</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Email"><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Mot de passe"><Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        <p className="-mt-2 text-right text-sm"><Link className="text-ink-muted underline underline-offset-2 hover:text-ink" href="/mot-de-passe-oublie">Mot de passe oublié ?</Link></p>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading} size="lg" className="w-full">Se connecter</Button>
        <p className="text-center text-sm text-ink-muted">Pas encore de compte ? <Link className="font-medium text-signal-strong underline underline-offset-2" href="/inscription">Essai gratuit</Link></p>
      </form>
    </main>
  );
}
