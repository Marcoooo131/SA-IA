import { redirect } from "next/navigation";
import { AuthShell } from "../AuthShell";
import { verifyEmail } from "@/server/services/auth";
import { Alert, ButtonLink } from "@/components/ui";

export const metadata = { title: "Vérification de l'e-mail" };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let ok = false;
  if (token) { try { await verifyEmail(token); ok = true; } catch { ok = false; } }
  if (ok) redirect("/compte?ok=email");
  return (
    <AuthShell title="Vérification de l'adresse e-mail">
      <Alert tone="danger" title="Lien invalide ou expiré">Demandez un nouvel e-mail depuis votre compte.</Alert>
      <ButtonLink href="/compte" className="mt-4 w-full">Mon compte</ButtonLink>
    </AuthShell>
  );
}
