import type { Catalog, Product, ProductCategory } from '@/domain/types';

/**
 * Catalogue de démonstration.
 * - Les références « DEMO-… » sont fictives : aucune référence commerciale officielle n'est inventée.
 * - Les prix sont ceux communiqués pour le prototype et ne constituent pas des tarifs officiels.
 * - Centrale : 499 € (supplément mensuel non communiqué) ; clavier : 149 € sans supplément mensuel.
 */
export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'prd_centrale',
    reference: 'DEMO-CENT-01',
    name: 'Centrale',
    category: 'centrale',
    description: "Unité centrale du système, une par logement associé à une adresse.",
    priceInitial: 499,
    monthly: null,
    billing: 'unitaire',
    packQuantity: 1,
    icon: 'centrale',
    compatibility: 'À confirmer avec la fiche fabricant.',
    active: true,
    comments: 'Prix matériel communiqué : 499 €. Supplément mensuel non communiqué (à confirmer). Incluse dans les packs.',
  },
  {
    id: 'prd_clavier',
    reference: 'DEMO-CLAV-01',
    name: 'Clavier',
    category: 'clavier',
    description: "Clavier de commande, placé à proximité d'un point d'entrée.",
    priceInitial: 149,
    monthly: 0,
    billing: 'unitaire',
    packQuantity: 1,
    icon: 'clavier',
    compatibility: "Jusqu'à 4 claviers par logement selon les points d'entrée (hypothèse à valider).",
    active: true,
    comments: 'Prix communiqué : 149 €, sans supplément mensuel. Inclus dans les packs.',
  },
  {
    id: 'prd_choc',
    reference: 'DEMO-CHOC-01',
    name: "Détecteur de choc et d'ouverture",
    category: 'detecteur_choc',
    description: 'Détecte les chocs et ouvertures sur une porte ou une fenêtre.',
    priceInitial: 79,
    monthly: 2,
    billing: 'unitaire',
    packQuantity: 1,
    icon: 'choc',
    compatibility: 'Portes, fenêtres. Baie vitrée : 2 unités indicatives. Non posé automatiquement sur porte sectionnelle.',
    active: true,
    comments: '',
  },
  {
    id: 'prd_mouvement',
    reference: 'DEMO-MVT-01',
    name: 'Détecteur de mouvement avec photographie',
    category: 'detecteur_mouvement',
    description: 'Détecteur volumétrique avec prise de photographie lors du déclenchement.',
    priceInitial: 149,
    monthly: 2,
    billing: 'unitaire',
    packQuantity: 1,
    icon: 'mouvement',
    compatibility: "Compatibilité animaux et usage nocturne non garantie : à vérifier selon le modèle et la configuration.",
    active: true,
    comments: 'Caractéristiques communiquées : 110° / 10 m (référence produit, couverture réelle à vérifier).',
    specs: { 'Angle de détection': '110°', 'Portée de référence': '10 m' },
  },
  {
    id: 'prd_fumee',
    reference: 'DEMO-FUM-01',
    name: 'Détecteur de fumée',
    category: 'detecteur_fumee',
    description: 'Détecteur de fumée connecté.',
    priceInitial: 149,
    monthly: 2,
    billing: 'unitaire',
    packQuantity: 1,
    icon: 'fumee',
    compatibility: 'Couverture indicative de départ : 50 m² par détecteur (à vérifier selon exigences et fabricant).',
    active: true,
    comments: '',
  },
  {
    id: 'prd_sirene_int',
    reference: 'DEMO-SIR-INT',
    name: 'Sirène intérieure',
    category: 'sirene_interieure',
    description: 'Sirène dissuasive intérieure.',
    priceInitial: 149,
    monthly: 2,
    billing: 'unitaire',
    packQuantity: 1,
    icon: 'sirene',
    compatibility: '',
    active: true,
    comments: '',
  },
  {
    id: 'prd_sirene_ext',
    reference: 'DEMO-SIR-EXT',
    name: 'Sirène extérieure',
    category: 'sirene_exterieure',
    description: 'Sirène dissuasive extérieure.',
    priceInitial: 149,
    monthly: 2,
    billing: 'unitaire',
    packQuantity: 1,
    icon: 'sirene',
    compatibility: '',
    active: true,
    comments: '',
  },
  {
    id: 'prd_pack_perim',
    reference: 'DEMO-PACK-PERIM5',
    name: "Pack périmétrique (5 détecteurs de choc et d'ouverture)",
    category: 'pack_perimetrique',
    description: "Lot de 5 détecteurs de choc et d'ouverture.",
    priceInitial: 249,
    monthly: 5,
    billing: 'lot',
    packQuantity: 5,
    bundleOf: 'detecteur_choc',
    icon: 'pack',
    compatibility: "Remplace 5 détecteurs de choc et d'ouverture unitaires.",
    active: true,
    comments: '',
  },
  {
    id: 'prd_save',
    reference: 'DEMO-SAVE-01',
    name: 'Boîtier Save',
    category: 'boitier_save',
    description: 'Boîtier Save.',
    priceInitial: 149,
    monthly: 2,
    billing: 'unitaire',
    packQuantity: 1,
    icon: 'save',
    compatibility: '',
    active: true,
    comments: '',
  },
];

export function createDefaultCatalog(): Catalog {
  return {
    version: 1,
    updatedAt: new Date('2026-01-01T09:00:00.000Z').toISOString(),
    products: structuredClone(DEFAULT_PRODUCTS),
    packs: [
      {
        id: 'pack_essentiel',
        name: 'Pack Essentiel',
        description: 'Offre de démonstration – composition et tarif communiqués pour le prototype.',
        monthly: 37.9,
        initial: 799,
        active: true,
        items: [
          { productId: 'prd_centrale', quantity: 1 },
          { productId: 'prd_clavier', quantity: 1 },
          { productId: 'prd_choc', quantity: 1 },
          { productId: 'prd_mouvement', quantity: 1 },
          { productId: 'prd_fumee', quantity: 1 },
        ],
      },
      {
        id: 'pack_serenite',
        name: 'Pack Sérénité',
        description: 'Offre de démonstration – composition et tarif communiqués pour le prototype.',
        monthly: 43.9,
        initial: 999,
        active: true,
        items: [
          { productId: 'prd_centrale', quantity: 1 },
          { productId: 'prd_clavier', quantity: 1 },
          { productId: 'prd_choc', quantity: 3 },
          { productId: 'prd_mouvement', quantity: 3 },
          { productId: 'prd_fumee', quantity: 1 },
          { productId: 'prd_save', quantity: 1 },
        ],
      },
    ],
    discounts: [
      {
        id: 'disc_exemple',
        label: 'Exemple de remise sur matériel supplémentaire',
        target: 'materiel_supplementaire',
        kind: 'pourcentage',
        value: 10,
        active: true,
        note: 'Exemple de configuration pour la démonstration : aucune remise réelle n’est validée.',
      },
    ],
    settings: {
      priceBasis: 'inconnue',
      vatRate: null,
      installationFee: null,
      autoBundle: true,
      conditions:
        "Proposition établie à partir d'un prototype de démonstration. Prix communiqués pour le prototype, non contractuels et à confirmer. Conditions commerciales à compléter par le responsable commercial.",
      validityDays: 30,
    },
  };
}

/** Produit actif à utiliser pour une catégorie (hors lots). */
export function productForCategory(products: Product[], category: ProductCategory): Product | undefined {
  return (
    products.find((p) => p.active && p.category === category && p.billing !== 'lot') ??
    products.find((p) => p.category === category && p.billing !== 'lot')
  );
}

/**
 * Mise à jour des catalogues déjà enregistrés dans un navigateur : applique les prix
 * communiqués pour la centrale et le clavier uniquement s'ils n'ont jamais été
 * renseignés (un prix saisi par l'utilisateur n'est jamais écrasé).
 */
export function migrateCatalog<T extends { products: Product[] }>(catalog: T): { catalog: T; changed: boolean } {
  let changed = false;
  const products = catalog.products.map((p) => {
    const ref = DEFAULT_PRODUCTS.find((d) => d.id === p.id);
    if (!ref || (p.id !== 'prd_centrale' && p.id !== 'prd_clavier')) return p;
    if (p.priceInitial !== null || p.billing !== 'forfait') return p;
    changed = true;
    return { ...p, priceInitial: ref.priceInitial, monthly: p.monthly ?? ref.monthly, billing: ref.billing, comments: ref.comments };
  });
  return { catalog: changed ? { ...catalog, products } : catalog, changed };
}
