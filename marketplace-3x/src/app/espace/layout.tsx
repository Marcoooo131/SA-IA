import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { SpaceShell } from "@/components/layout/SpaceShell";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const actor = await requireRole("INDIVIDUAL", "/espace");
  const [toShip, offers, collab, priceProps] = await Promise.all([
    db.order.count({ where: { sellerId: actor.id, status: "PAID" } }),
    db.productOffer.count({ where: { status: "PENDING", product: { ownerId: actor.id, contractId: null } } }),
    db.collaborationOffer.count({ where: { toUserId: actor.id, status: "PENDING" } }),
    db.priceProposal.count({ where: { status: "PENDING", product: { ownerId: actor.id } } }),
  ]);
  return (
    <SpaceShell accent="individual" title="Espace particulier" nav={[
      { href: "/espace", label: "Tableau de bord" },
      { href: "/espace/annonces", label: "Mes annonces" },
      { href: "/espace/ventes", label: "Mes ventes", badge: toShip },
      { href: "/espace/achats", label: "Mes achats" },
      { href: "/espace/offres", label: "Offres reçues", badge: offers },
      { href: "/espace/delegation", label: "Confier mes ventes", badge: collab + priceProps },
      { href: "/espace/revenus", label: "Revenus" },
      { href: "/espace/favoris", label: "Favoris" },
      { href: "/espace/alertes", label: "Alertes" },
      { href: "/messages", label: "Messagerie" },
      { href: "/compte", label: "Mon compte" },
    ]}>{children}</SpaceShell>
  );
}
