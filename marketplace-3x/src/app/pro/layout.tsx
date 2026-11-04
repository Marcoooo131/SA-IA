import Link from "next/link";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { SpaceShell } from "@/components/layout/SpaceShell";
import { Alert } from "@/components/ui";
import { verificationLabel } from "@/lib/labels";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const actor = await requireRole("PROFESSIONAL", "/pro");
  const [profile, pending, offers] = await Promise.all([
    db.professionalProfile.findUnique({ where: { userId: actor.id } }),
    db.collaborationOffer.count({ where: { toUserId: actor.id, status: "PENDING" } }),
    db.productOffer.count({ where: { status: "PENDING", product: { contract: { professionalId: actor.id, status: "ACTIVE" } } } }),
  ]);
  const notice = profile && profile.verificationStatus !== "VERIFIED" ? (
    <div className="mb-5"><Alert tone="warning" title={`Profil : ${verificationLabel[profile.verificationStatus]}`}>
      La prospection, les propositions et le catalogue fournisseurs s&apos;ouvrent après vérification de votre profil (identité, SIRET). <Link href="/pro/profil" className="underline">Compléter mon profil</Link>
    </Alert></div>
  ) : null;
  return (
    <SpaceShell accent="pro" title="Espace indépendant" notice={notice} nav={[
      { href: "/pro", label: "Tableau de bord" },
      { href: "/pro/prospection", label: "Prospection" },
      { href: "/pro/propositions", label: "Propositions", badge: pending },
      { href: "/pro/collaborations", label: "Collaborations" },
      { href: "/pro/ventes", label: "Ventes déléguées", badge: offers },
      { href: "/pro/catalogue", label: "Catalogue fournisseurs" },
      { href: "/pro/liens", label: "Mes liens" },
      { href: "/pro/commissions", label: "Commissions" },
      { href: "/pro/profil", label: "Profil public" },
      { href: "/messages", label: "Messagerie" },
    ]}>{children}</SpaceShell>
  );
}
