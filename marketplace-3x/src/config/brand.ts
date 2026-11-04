/**
 * Identité de la plateforme — modifiable en un seul endroit.
 * Les couleurs sont des variables CSS déclarées dans src/app/globals.css (:root) ;
 * les teintes de chaque espace (particulier / indépendant / fournisseur / admin) aussi.
 */
export const brand = {
  name: "MARKETPLACE 3X",
  shortName: "M3X",
  tagline: "Achetez, vendez, confiez vos ventes. Ensemble.",
  description:
    "La marketplace collaborative qui réunit particuliers, commerciaux indépendants et entreprises fournisseurs.",
  supportEmail: "support@marketplace3x.local",
  legalEntity: "MARKETPLACE 3X SAS (à compléter)",
  country: "FR",
  currency: "EUR",
  locale: "fr-FR",
} as const;

export const spaces = {
  INDIVIDUAL: { label: "Particulier", path: "/espace", accent: "var(--space-individual)" },
  PROFESSIONAL: { label: "Indépendant", path: "/pro", accent: "var(--space-pro)" },
  SUPPLIER: { label: "Fournisseur", path: "/fournisseur", accent: "var(--space-supplier)" },
  ADMIN: { label: "Administration", path: "/admin", accent: "var(--space-admin)" },
} as const;
