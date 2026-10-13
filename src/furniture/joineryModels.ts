import type { Opening, OpeningType } from '@/domain/types';

/**
 * Bibliothèque des menuiseries génériques (2D/3D).
 * Une menuiserie reste une `Opening` du modèle de données (identifiant unique, pièce de
 * rattachement, lien avec l'audit) ; le « modèle » détermine seulement sa représentation
 * (symbole architectural en 2D, cadre / vitrage / ouvrant en 3D).
 */
export type JoineryModelId =
  | 'porte_interieure'
  | 'porte_entree'
  | 'porte_exterieure'
  | 'porte_fenetre'
  | 'fenetre_simple'
  | 'fenetre_double'
  | 'baie'
  | 'porte_garage'
  | 'passage'
  | 'autre';

export interface JoineryModel {
  id: JoineryModelId;
  name: string;
  /** Type d'ouverture créé (utilisé par l'audit). */
  type: OpeningType;
  /** Attributs appliqués à la création. */
  preset: Partial<Pick<Opening, 'leaves' | 'entry' | 'exterior'>>;
  width: number;
  /** Hauteur de passage / de vitrage par défaut (m). */
  height: number;
  /** Allège (m) : hauteur du bas de l'ouverture. */
  sill: number;
  /** Ouvrant battant (sens d'ouverture réglable). */
  swing: boolean;
  exterior: boolean;
}

export const JOINERY_MODELS: JoineryModel[] = [
  { id: 'porte_interieure', name: 'Porte intérieure', type: 'porte_interieure', preset: { exterior: false }, width: 0.8, height: 2.04, sill: 0, swing: true, exterior: false },
  { id: 'porte_entree', name: "Porte d'entrée", type: 'porte', preset: { entry: true, exterior: true }, width: 0.95, height: 2.15, sill: 0, swing: true, exterior: true },
  { id: 'porte_exterieure', name: 'Porte extérieure (service)', type: 'porte', preset: { exterior: true }, width: 0.9, height: 2.1, sill: 0, swing: true, exterior: true },
  { id: 'porte_fenetre', name: 'Porte-fenêtre', type: 'porte_fenetre', preset: { exterior: true, leaves: 2 }, width: 1.4, height: 2.15, sill: 0, swing: true, exterior: true },
  { id: 'fenetre_simple', name: 'Fenêtre simple', type: 'fenetre', preset: { exterior: true, leaves: 1 }, width: 0.7, height: 1.15, sill: 1.0, swing: true, exterior: true },
  { id: 'fenetre_double', name: 'Fenêtre double', type: 'fenetre', preset: { exterior: true, leaves: 2 }, width: 1.2, height: 1.25, sill: 0.95, swing: true, exterior: true },
  { id: 'baie', name: 'Baie vitrée coulissante', type: 'baie', preset: { exterior: true }, width: 2.4, height: 2.15, sill: 0.02, swing: false, exterior: true },
  { id: 'porte_garage', name: 'Porte de garage', type: 'porte_garage', preset: { exterior: true }, width: 2.5, height: 2.1, sill: 0, swing: false, exterior: true },
  { id: 'passage', name: 'Passage ouvert', type: 'passage', preset: { exterior: false }, width: 1.6, height: 2.2, sill: 0, swing: false, exterior: false },
  { id: 'autre', name: 'Autre ouverture', type: 'autre', preset: { exterior: true }, width: 0.8, height: 1.0, sill: 0.8, swing: false, exterior: true },
];

const BY_ID = new Map(JOINERY_MODELS.map((m) => [m.id, m]));

export function getJoineryModel(id: JoineryModelId): JoineryModel {
  return BY_ID.get(id)!;
}

/** Nombre de vantaux effectif (fenêtre : 2 au-delà d'un mètre si non précisé). */
export function openingLeaves(o: Opening): 1 | 2 {
  if (o.leaves) return o.leaves;
  if (o.type === 'porte_fenetre') return o.width >= 1.0 ? 2 : 1;
  if (o.type === 'fenetre') return o.width >= 1.0 ? 2 : 1;
  return 1;
}

/** Modèle de représentation d'une ouverture. */
export function joineryModelOf(o: Opening): JoineryModelId {
  switch (o.type) {
    case 'porte':
      return o.entry ? 'porte_entree' : o.exterior ? 'porte_exterieure' : 'porte_interieure';
    case 'fenetre':
      return openingLeaves(o) === 2 ? 'fenetre_double' : 'fenetre_simple';
    case 'porte_fenetre':
    case 'baie':
    case 'porte_garage':
    case 'passage':
    case 'autre':
    case 'porte_interieure':
      return o.type;
  }
}

/** Bas et haut de l'ouverture (m) pour la 3D. Une hauteur saisie par le conseiller est prioritaire. */
export function joineryVertical(o: Opening, levelHeight: number): { bottom: number; top: number } {
  const m = getJoineryModel(joineryModelOf(o));
  const bottom = m.sill;
  const height = o.height ?? m.height;
  return { bottom, top: Math.min(bottom + height, levelHeight - 0.15) };
}
