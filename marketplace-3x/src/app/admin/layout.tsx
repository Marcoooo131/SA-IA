import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { SpaceShell } from "@/components/layout/SpaceShell";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole("ADMIN", "/admin");
  const [verif, moderation, disputes, reports] = await Promise.all([
    db.user.count({ where: { OR: [{ professionalProfile: { verificationStatus: "PENDING" } }, { supplierProfile: { verificationStatus: "PENDING" } }] } }),
    db.product.count({ where: { status: "PENDING_REVIEW" } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    db.report.count({ where: { status: "OPEN" } }),
  ]);
  return (
    <SpaceShell accent="admin" title="Administration" nav={[
      { href: "/admin", label: "Tableau de bord" },
      { href: "/admin/utilisateurs", label: "Utilisateurs", badge: verif },
      { href: "/admin/produits", label: "Modération", badge: moderation },
      { href: "/admin/signalements", label: "Signalements", badge: reports },
      { href: "/admin/commandes", label: "Commandes" },
      { href: "/admin/litiges", label: "Litiges", badge: disputes },
      { href: "/admin/finances", label: "Finances" },
      { href: "/admin/parametres", label: "Paramètres commerciaux" },
      { href: "/admin/categories", label: "Catégories" },
      { href: "/admin/promos", label: "Codes promo" },
      { href: "/admin/audit", label: "Journal d'audit" },
      { href: "/admin/emails", label: "E-mails envoyés" },
    ]}>{children}</SpaceShell>
  );
}
