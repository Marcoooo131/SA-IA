/**
 * Modèle de données du prototype.
 * Toutes les longueurs sont exprimées en mètres, tous les montants en euros.
 * Les montants `null` signifient « prix non communiqué / à confirmer » : ils ne sont
 * jamais remplacés par une valeur inventée.
 */

export type Id = string;

// ---------------------------------------------------------------------------
// Dossier
// ---------------------------------------------------------------------------

export type HousingType = 'maison' | 'appartement' | 'duplex' | 'local' | 'autre';

export type DossierStatus =
  | 'brouillon'
  | 'audit_en_cours'
  | 'audit_a_verifier'
  | 'devis_genere'
  | 'proposition_validee'
  | 'cloture';

export type TriState = 'oui' | 'non' | 'inconnu';

export type ProtectionMode = 'volumetrique' | 'perimetrique';

export interface DossierInfo {
  reference: string;
  clientName: string;
  address: string;
  housingType: HousingType;
  surface: number | null;
  floors: number | null;
  rooms: number | null;
  createdAt: string; // ISO
  installationDate: string | null; // ISO date (yyyy-mm-dd)
  advisorNotes: string;
  pets: TriState;
  nightArming: TriState;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export type RoomType =
  | 'sejour'
  | 'cuisine'
  | 'chambre'
  | 'couloir'
  | 'entree'
  | 'garage'
  | 'salle_de_bain'
  | 'wc'
  | 'bureau'
  | 'palier'
  | 'cellier'
  | 'autre';

/** Pièce rectangulaire alignée sur les axes (choix volontaire de simplicité). */
export interface Room {
  id: Id;
  name: string;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Pièce ouverte sur une pièce voisine (ex. cuisine ouverte sur séjour). */
  openPlan: boolean;
}

/** Cloison ou mur libre (segment). */
export interface Wall {
  id: Id;
  a: Point;
  b: Point;
  thickness: number;
}

export type RoomSide = 'N' | 'S' | 'E' | 'W';

export type OpeningHost =
  | { kind: 'room'; roomId: Id; side: RoomSide }
  | { kind: 'wall'; wallId: Id };

export type OpeningType = 'porte' | 'fenetre' | 'baie' | 'porte_garage' | 'porte_interieure';

export interface Opening {
  id: Id;
  /** Identifiant lisible et unique (ex. « RDC-O03 ») pour éviter les doublons. */
  code: string;
  type: OpeningType;
  host: OpeningHost;
  /** Distance (m) entre le début du segment hôte et le centre de l'ouverture. */
  offset: number;
  width: number;
  /** Donne sur l'extérieur (modifiable par le conseiller). */
  exterior: boolean;
  /** Porte de garage sectionnelle : jamais équipée automatiquement. */
  sectional: boolean;
}

export interface BackgroundImage {
  assetId: Id;
  name: string;
  /** Position du coin haut-gauche (m). */
  x: number;
  y: number;
  /** Largeur représentée par l'image (m). */
  width: number;
  /** Rapport hauteur / largeur de l'image en pixels. */
  aspect: number;
  rotation: number; // degrés
  opacity: number; // 0..1
  visible: boolean;
  locked: boolean;
  /** Vrai lorsque l'échelle a été définie à partir d'une dimension connue. */
  calibrated: boolean;
}

export interface Level {
  id: Id;
  name: string;
  /** Index d'étage : 0 = rez-de-chaussée. */
  index: number;
  height: number;
  rooms: Room[];
  walls: Wall[];
  openings: Opening[];
  background: BackgroundImage | null;
}

export interface Plan {
  levels: Level[];
}

// ---------------------------------------------------------------------------
// Équipements placés
// ---------------------------------------------------------------------------

export type DeviceOrigin = 'manuel' | 'suggere';

export interface PlacedDevice {
  id: Id;
  productId: Id;
  levelId: Id;
  x: number;
  y: number;
  rotation: number; // degrés, 0 = vers +x
  quantity: number;
  origin: DeviceOrigin;
  /** Suggestion validée par le conseiller. */
  validated: boolean;
  /** Clé de la règle à l'origine de la suggestion (évite les doublons). */
  suggestionKey?: string;
  openingId?: Id;
  roomId?: Id;
  note?: string;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export type ProductCategory =
  | 'centrale'
  | 'clavier'
  | 'detecteur_mouvement'
  | 'detecteur_choc'
  | 'detecteur_fumee'
  | 'sirene_interieure'
  | 'sirene_exterieure'
  | 'pack_perimetrique'
  | 'boitier_save'
  | 'autre';

export type BillingType = 'unitaire' | 'lot' | 'forfait' | 'sur_devis';

export interface Product {
  id: Id;
  reference: string;
  name: string;
  category: ProductCategory;
  description: string;
  /** Prix matériel unitaire (null = non communiqué). */
  priceInitial: number | null;
  /** Supplément mensuel (null = non communiqué, 0 = aucun). */
  monthly: number | null;
  billing: BillingType;
  /** Nombre d'unités contenues (lot), ex. 5 pour le pack périmétrique. */
  packQuantity: number;
  /** Pour un lot : catégorie des unités contenues. */
  bundleOf?: ProductCategory;
  icon: string;
  compatibility: string;
  active: boolean;
  comments: string;
  /** Caractéristiques indicatives communiquées (ex. angle / portée). */
  specs?: Record<string, string>;
}

export interface PackItem {
  productId: Id;
  quantity: number;
}

export interface Pack {
  id: Id;
  name: string;
  description: string;
  monthly: number;
  initial: number;
  items: PackItem[];
  active: boolean;
}

export type DiscountTarget = 'materiel_supplementaire' | 'initial_total' | 'mensuel_total';

export interface Discount {
  id: Id;
  label: string;
  target: DiscountTarget;
  kind: 'pourcentage' | 'montant';
  value: number;
  active: boolean;
  note: string;
}

export interface PricingSettings {
  /** Base des prix communiqués. */
  priceBasis: 'inconnue' | 'HT' | 'TTC';
  /** Taux de TVA en % (null = non renseigné). */
  vatRate: number | null;
  /** Frais d'installation (null = à confirmer). */
  installationFee: number | null;
  /** Regrouper automatiquement les détecteurs en lot lorsque c'est plus avantageux. */
  autoBundle: boolean;
  /** Conditions commerciales configurées (texte libre affiché sur le devis). */
  conditions: string;
  /** Durée de validité du devis (jours). */
  validityDays: number;
}

export interface Catalog {
  version: number;
  updatedAt: string;
  products: Product[];
  packs: Pack[];
  discounts: Discount[];
  settings: PricingSettings;
}

// ---------------------------------------------------------------------------
// Devis
// ---------------------------------------------------------------------------

export interface QuoteAdjustment {
  productId: Id;
  /** Quantité ajoutée (positive) ou retirée (négative) par rapport au plan. */
  delta: number;
}

/** Prix modifié pour ce devis uniquement (le catalogue n'est pas changé). */
export interface PriceOverride {
  productId: Id;
  initial?: number;
  monthly?: number;
}

/** Équipements repris du logement précédent (déménagement) : 0 € et 0 €/mois. */
export interface MovedEquipment {
  productId: Id;
  quantity: number;
}

export interface QuoteDraft {
  /** null = sans forfait (à la carte). */
  packId: Id | null;
  adjustments: QuoteAdjustment[];
  discountIds: Id[];
  priceOverrides: PriceOverride[];
  moved: MovedEquipment[];
  /** Prix du forfait modifié pour ce devis. */
  packOverride: { initial?: number; monthly?: number } | null;
  /** Abonnement transféré lors du déménagement : forfait à 0 € et 0 €/mois. */
  packTransferred: boolean;
  /** Montants finaux saisis manuellement par le conseiller (remplacent le calcul). */
  totalOverride: { initial?: number; monthly?: number; note: string } | null;
}

export interface QuoteRecord {
  id: Id;
  reference: string;
  createdAt: string;
  packId: Id | null;
  packName: string;
  /** Copie des prix appliqués au moment de la génération (historique). */
  priceSnapshot: {
    products: Pick<Product, 'id' | 'reference' | 'name' | 'priceInitial' | 'monthly' | 'packQuantity'>[];
    pack: Pick<Pack, 'id' | 'name' | 'initial' | 'monthly' | 'items'> | null;
    discounts: Discount[];
    settings: PricingSettings;
    catalogVersion: number;
  };
  totals: {
    initial: number;
    monthly: number;
    hasUnpricedItems: boolean;
  };
  lines: { label: string; quantity: number; unitInitial: number | null; unitMonthly: number | null; included: number; moved?: number }[];
}

// ---------------------------------------------------------------------------
// Dossier complet
// ---------------------------------------------------------------------------

export interface AuditValidation {
  validatedAt: string;
  note: string;
}

export interface Dossier {
  id: Id;
  schemaVersion: number;
  info: DossierInfo;
  status: DossierStatus;
  updatedAt: string;
  plan: Plan;
  devices: PlacedDevice[];
  protectionMode: ProtectionMode;
  auditValidations: Record<string, AuditValidation>;
  quoteDraft: QuoteDraft;
  quotes: QuoteRecord[];
  /** Validation commerciale (action de démonstration uniquement). */
  demoValidatedAt: string | null;
}
