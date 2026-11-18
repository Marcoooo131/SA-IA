"use client";
import { Hammer, Sparkles, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field, Input, Logo, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

const VERTICALS = [
  { code: "renovation", label: "Rénovation de l'habitat", Icon: Hammer, hint: "Salle de bain, cuisine, menuiseries, isolation…" },
  { code: "demenagement", label: "Déménagement", Icon: Truck, hint: "Visite ou visio d'estimation du volume" },
  { code: "generique", label: "Autre activité", Icon: Sparkles, hint: "Un parcours simple, adaptable à tout métier" },
];

export default function Signup() {
  const router = useRouter();
  const [vertical, setVertical] = useState("renovation");
  const [form, setForm] = useState({ company_name: "", full_name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/auth/signup", { method: "POST", body: { ...form, vertical } });
      router.push("/app?bienvenue=1");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      <Link href="/"><Logo className="text-lg" /></Link>
      <h1 className="mt-10 font-display text-4xl font-semibold">Créez votre page de réservation</h1>
      <p className="mt-2 text-ink-muted">Elle sera prête en quelques minutes. Tout reste modifiable ensuite.</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Votre activité</legend>
          <div className="grid gap-2">
            {VERTICALS.map((v) => (
              <button type="button" key={v.code} onClick={() => setVertical(v.code)} aria-pressed={vertical === v.code}
                className={cx("flex items-center gap-3 rounded-card border bg-surface p-3 text-left transition",
                  vertical === v.code ? "border-ink ring-1 ring-ink" : "border-line hover:border-ink/40")}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-sunken text-ink"><v.Icon aria-hidden className="h-5 w-5" strokeWidth={1.75} /></span>
                <span><span className="block font-medium">{v.label}</span><span className="text-sm text-ink-muted">{v.hint}</span></span>
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Nom de l'entreprise"><Input required minLength={2} value={form.company_name} onChange={set("company_name")} autoComplete="organization" /></Field>
        <Field label="Votre nom"><Input required minLength={2} value={form.full_name} onChange={set("full_name")} autoComplete="name" /></Field>
        <Field label="Email professionnel"><Input required type="email" value={form.email} onChange={set("email")} autoComplete="email" /></Field>
        <Field label="Mot de passe" hint="10 caractères minimum."><Input required type="password" minLength={10} value={form.password} onChange={set("password")} autoComplete="new-password" /></Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading} size="lg" className="w-full">Créer mon espace</Button>
        <p className="text-center text-sm text-ink-muted">Déjà inscrit ? <Link className="font-medium text-signal-strong underline underline-offset-2" href="/connexion">Se connecter</Link></p>
      </form>
    </main>
  );
}
