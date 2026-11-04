"use client";
import { useState } from "react";
import Link from "next/link";
import { Briefcase, Building2, User } from "lucide-react";
import { Form, Submit } from "@/components/ui/Form";
import { Checkbox, Field, Input } from "@/components/ui";
import { registerAction } from "../actions";
import { cn } from "@/lib/cn";

const roles = [
  { id: "INDIVIDUAL", label: "Particulier", icon: User, text: "J'achète, je vends, je peux confier mes ventes à un indépendant.", color: "var(--space-individual)" },
  { id: "PROFESSIONAL", label: "Indépendant", icon: Briefcase, text: "Je commercialise les produits des autres et je touche des commissions.", color: "var(--space-pro)" },
  { id: "SUPPLIER", label: "Entreprise fournisseur", icon: Building2, text: "Je publie mon catalogue et m'appuie sur un réseau de commerciaux.", color: "var(--space-supplier)" },
] as const;

export function RegisterForm({ initialRole, referral }: { initialRole: string; referral?: string }) {
  const [role, setRole] = useState(initialRole);
  return (
    <Form action={registerAction} className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Je suis…</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {roles.map((r) => (
            <label key={r.id} className={cn("cursor-pointer rounded-2xl border-2 p-4 transition", role === r.id ? "bg-white shadow-sm" : "border-line hover:border-ink-3")}
              style={role === r.id ? { borderColor: r.color } : undefined}>
              <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="sr-only" />
              <r.icon className="h-6 w-6" style={{ color: r.color }} />
              <p className="mt-2 font-semibold">{r.label}</p>
              <p className="mt-1 text-xs text-ink-3">{r.text}</p>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={role === "SUPPLIER" ? "Nom du contact" : "Prénom et initiale"}><Input name="displayName" required maxLength={80} /></Field>
        <Field label="Adresse e-mail"><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Mot de passe" hint="10 caractères minimum, avec au moins une lettre et un chiffre."><Input name="password" type="password" autoComplete="new-password" required minLength={10} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Code postal" className="col-span-1"><Input name="postalCode" inputMode="numeric" maxLength={5} /></Field>
          <Field label="Ville" className="col-span-2"><Input name="city" /></Field>
        </div>
        {role === "SUPPLIER" && <Field label="Raison sociale"><Input name="companyName" required /></Field>}
        {role !== "INDIVIDUAL" && <Field label="SIRET" hint="Requis pour la vérification de votre profil professionnel."><Input name="siret" inputMode="numeric" maxLength={14} /></Field>}
        <Field label="Code de parrainage (facultatif)"><Input name="referralCode" defaultValue={referral} /></Field>
      </div>
      {role !== "INDIVIDUAL" && (
        <p className="rounded-xl bg-canvas p-3 text-xs text-ink-2">
          Les profils professionnels sont vérifiés par notre équipe (identité, SIRET) avant de pouvoir commercialiser des produits.
          Les versements nécessitent la vérification d&apos;identité opérée par notre prestataire de paiement.
        </p>
      )}
      <Checkbox name="acceptTerms" required label={<>J&apos;accepte les <Link href="/legal/cgu" className="underline" target="_blank">conditions générales d&apos;utilisation</Link> et la <Link href="/legal/confidentialite" className="underline" target="_blank">politique de confidentialité</Link>.</>} />
      <Submit size="lg" className="w-full">Créer mon compte</Submit>
    </Form>
  );
}
