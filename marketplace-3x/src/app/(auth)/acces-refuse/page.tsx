import { AuthShell } from "../AuthShell";
import { ButtonLink } from "@/components/ui";

export default function Page() {
  return (
    <AuthShell title="Accès réservé" subtitle="Cet espace ne correspond pas à votre profil.">
      <ButtonLink href="/" className="w-full">Retour à l'accueil</ButtonLink>
    </AuthShell>
  );
}
