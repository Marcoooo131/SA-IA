import type {
  BillingType,
  DiscountTarget,
  DossierStatus,
  HousingType,
  OpeningType,
  ProductCategory,
  ProtectionMode,
  RoomType,
  TriState,
} from './types';

export const HOUSING_TYPE_LABELS: Record<HousingType, string> = {
  maison: 'Maison',
  appartement: 'Appartement',
  duplex: 'Duplex',
  local: 'Local professionnel',
  autre: 'Autre',
};

export const STATUS_LABELS: Record<DossierStatus, string> = {
  brouillon: 'Brouillon',
  audit_en_cours: 'Audit en cours',
  audit_a_verifier: 'Audit à vérifier',
  devis_genere: 'Devis généré',
  proposition_validee: 'Proposition validée (démo)',
  cloture: 'Dossier clôturé',
};

export const STATUS_ORDER: DossierStatus[] = [
  'brouillon',
  'audit_en_cours',
  'audit_a_verifier',
  'devis_genere',
  'proposition_validee',
  'cloture',
];

export const TRISTATE_LABELS: Record<TriState, string> = { oui: 'Oui', non: 'Non', inconnu: 'Non renseigné' };

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  sejour: 'Séjour',
  cuisine: 'Cuisine',
  chambre: 'Chambre',
  couloir: 'Couloir',
  entree: 'Entrée',
  garage: 'Garage',
  salle_de_bain: 'Salle de bain',
  wc: 'WC',
  bureau: 'Bureau',
  palier: 'Palier',
  cellier: 'Cellier',
  autre: 'Autre',
};

export const ROOM_COLORS: Record<RoomType, string> = {
  sejour: '#f3e9d7',
  cuisine: '#f6e3cf',
  chambre: '#e4ecf6',
  couloir: '#ecebe7',
  entree: '#e9e6df',
  garage: '#dfe2e5',
  salle_de_bain: '#dcefee',
  wc: '#dcefee',
  bureau: '#e9e4f2',
  palier: '#ecebe7',
  cellier: '#e5e5e0',
  autre: '#eeeeee',
};

export const OPENING_TYPE_LABELS: Record<OpeningType, string> = {
  porte: 'Porte',
  fenetre: 'Fenêtre',
  baie: 'Baie vitrée',
  porte_garage: 'Porte de garage',
  porte_interieure: 'Porte intérieure',
};

export const OPENING_DEFAULT_WIDTH: Record<OpeningType, number> = {
  porte: 0.9,
  fenetre: 1.2,
  baie: 2.4,
  porte_garage: 2.5,
  porte_interieure: 0.8,
};

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  centrale: 'Centrale',
  clavier: 'Clavier',
  detecteur_mouvement: 'Détecteur de mouvement avec photographie',
  detecteur_choc: "Détecteur de choc et d'ouverture",
  detecteur_fumee: 'Détecteur de fumée',
  sirene_interieure: 'Sirène intérieure',
  sirene_exterieure: 'Sirène extérieure',
  pack_perimetrique: 'Pack périmétrique',
  boitier_save: 'Boîtier Save',
  autre: 'Autre produit',
};

export const CATEGORY_SHORT: Record<ProductCategory, string> = {
  centrale: 'Centrale',
  clavier: 'Clavier',
  detecteur_mouvement: 'Mouvement',
  detecteur_choc: 'Choc/ouverture',
  detecteur_fumee: 'Fumée',
  sirene_interieure: 'Sirène int.',
  sirene_exterieure: 'Sirène ext.',
  pack_perimetrique: 'Pack périm.',
  boitier_save: 'Save',
  autre: 'Autre',
};

/** Couleurs des équipements, partagées entre 2D, 3D, légendes et PDF. */
export const CATEGORY_COLORS: Record<ProductCategory, string> = {
  centrale: '#0f3d5e',
  clavier: '#2563eb',
  detecteur_mouvement: '#d97706',
  detecteur_choc: '#16a34a',
  detecteur_fumee: '#dc2626',
  sirene_interieure: '#7c3aed',
  sirene_exterieure: '#9333ea',
  pack_perimetrique: '#15803d',
  boitier_save: '#0891b2',
  autre: '#475569',
};

export const CATEGORY_GLYPH: Record<ProductCategory, string> = {
  centrale: 'C',
  clavier: 'K',
  detecteur_mouvement: 'M',
  detecteur_choc: 'O',
  detecteur_fumee: 'F',
  sirene_interieure: 'S',
  sirene_exterieure: 'SE',
  pack_perimetrique: 'P',
  boitier_save: 'B',
  autre: '?',
};

export const BILLING_LABELS: Record<BillingType, string> = {
  unitaire: 'Unitaire',
  lot: 'Lot',
  forfait: 'Forfait uniquement',
  sur_devis: 'Sur devis',
};

export const MODE_LABELS: Record<ProtectionMode, string> = {
  volumetrique: 'Volumétrique',
  perimetrique: 'Périmétrique',
};

export const DISCOUNT_TARGET_LABELS: Record<DiscountTarget, string> = {
  materiel_supplementaire: 'Matériel supplémentaire (frais initiaux)',
  initial_total: 'Total des frais initiaux',
  mensuel_total: 'Total mensuel',
};
