import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Inscription" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ role?: string; parrain?: string }> }) {
  const { role, parrain } = await searchParams;
  return (
    <AuthShell wide title="Rejoignez la marketplace" subtitle="Choisissez votre profil : vous pourrez toujours acheter, quel que soit votre statut.">
      <RegisterForm initialRole={role === "PROFESSIONAL" || role === "SUPPLIER" ? role : "INDIVIDUAL"} referral={parrain} />
      <p className="mt-6 text-center text-sm text-ink-2">Déjà inscrit ? <Link href="/connexion" className="font-medium text-brand">Se connecter</Link></p>
    </AuthShell>
  );
}
