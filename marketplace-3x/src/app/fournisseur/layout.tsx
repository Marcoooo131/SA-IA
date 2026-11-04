import Link from "next/link";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { SpaceShell } from "@/components/layout/SpaceShell";
import { Alert } from "@/components/ui";
import { verificationLabel } from "@/lib/labels";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const actor = await requireRole("SUPPLIER", "/fournisseur");
  const [profile, toShip] = await Promise.all([db.supplierProfile.findUnique({ where: { userId: actor.id } }), db.order.count({ where: { sellerId: actor.id, status: "PAID" } })]);
  const notice = profile && profile.verificationStatus !== "VERIFIED" ? (
    <div className="mb-5"><Alert tone="warning" title={`Entreprise : ${verificationLabel[profile.verificationStatus]}`}>Vos produits seront visibles et vendables après vérification de votre entreprise. <Link href="/fournisseur/profil" className="underline">Compléter le profil</Link></Alert></div>
  ) : null;
  return (
    <SpaceShell accent="supplier" title="Espace fournisseur" notice={notice} nav={[
      { href: "/fournisseur", label: "Tableau de bord" },
      { href: "/fournisseur/produits", label: "Catalogue" },
      { href: "/fournisseur/import", label: "Import CSV / Excel" },
      { href: "/fournisseur/commandes", label: "Commandes", badge: toShip },
      { href: "/fournisseur/reseau", label: "Réseau commercial" },
      { href: "/fournisseur/finances", label: "Finances" },
      { href: "/fournisseur/profil", label: "Entreprise" },
      { href: "/messages", label: "Messagerie" },
    ]}>{children}</SpaceShell>
  );
}
