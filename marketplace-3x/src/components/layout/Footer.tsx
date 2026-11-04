import Link from "next/link";
import { brand } from "@/config/brand";
import { Logo } from "@/components/ui/Logo";

const cols = [
  { title: "Acheter & vendre", links: [["/recherche", "Parcourir les annonces"], ["/espace/annonces/nouvelle", "Vendre un article"], ["/espace/delegation", "Confier mes ventes"], ["/comment-ca-marche#acheteurs", "Protection des achats"]] },
  { title: "Professionnels", links: [["/inscription?role=PROFESSIONAL", "Devenir indépendant"], ["/independants", "Annuaire des indépendants"], ["/inscription?role=SUPPLIER", "Espace fournisseurs"], ["/comment-ca-marche#commissions", "Commissions et frais"]] },
  { title: "Informations légales", links: [["/legal/cgu", "CGU"], ["/legal/cgv", "CGV"], ["/legal/confidentialite", "Confidentialité"], ["/legal/cookies", "Cookies"], ["/legal/collaboration", "Règles de collaboration"], ["/legal/transparence", "Transparence (DSA)"]] },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-4 md:px-6">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-ink-3">{brand.description}</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="mb-3 text-sm font-semibold">{c.title}</p>
            <ul className="space-y-2 text-sm text-ink-2">
              {c.links.map(([h, l]) => <li key={h}><Link href={h} className="hover:text-ink">{l}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-ink-3">
        © {new Date().getFullYear()} {brand.legalEntity} · Paiements opérés par un prestataire de services de paiement agréé · <Link href="/legal/cookies" className="underline">Gérer les cookies</Link>
      </div>
    </footer>
  );
}
