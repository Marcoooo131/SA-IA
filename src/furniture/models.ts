import type { RoomType } from '@/domain/types';

/**
 * Bibliothèque de mobilier générique.
 *
 * Chaque modèle est décrit UNE seule fois par des volumes simples (« parts ») exprimés
 * dans son repère local : x de gauche à droite, y de l'arrière (côté mur) vers l'avant,
 * z vers le haut. La vue 2D (vue de dessus) et la géométrie 3D sont toutes deux
 * dérivées de ces volumes : mêmes dimensions, même position, même orientation.
 *
 * Les volumes sont stockés en fractions des dimensions du modèle, ce qui permet de
 * redimensionner un objet (ou de choisir une variante) sans le redessiner.
 */

export type PartShape = 'box' | 'round' | 'cyl' | 'sphere' | 'cylx' | 'cyly';

export interface FurniturePart {
  shape: PartShape;
  /** Fractions (0..1) de la largeur / profondeur / hauteur du modèle. */
  x: number;
  y: number;
  w: number;
  d: number;
  z: number;
  h: number;
  /** Couleur ; « main » = couleur principale de l'objet (personnalisable). */
  color: string;
  opacity?: number;
}

export type FurnitureCategory =
  | 'sejour'
  | 'cuisine'
  | 'chambre'
  | 'salle_de_bain'
  | 'wc'
  | 'entree'
  | 'garage'
  | 'buanderie'
  | 'bureau'
  | 'divers';

export const FURNITURE_CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  sejour: 'Salon et séjour',
  cuisine: 'Cuisine',
  chambre: 'Chambre',
  salle_de_bain: 'Salle de bain',
  wc: 'WC',
  entree: 'Entrée et couloir',
  garage: 'Garage',
  buanderie: 'Buanderie et cellier',
  bureau: 'Bureau',
  divers: 'Divers',
};

export interface FurnitureVariant {
  id: string;
  label: string;
  w: number;
  d: number;
  h?: number;
}

export interface FurnitureModel {
  id: string;
  name: string;
  category: FurnitureCategory;
  /** Pièces dans lesquelles le modèle est proposé en priorité (bibliothèque). */
  rooms: RoomType[];
  /** Dimensions par défaut (m). */
  w: number;
  d: number;
  h: number;
  /** Hauteur de pose (m) pour les objets muraux ou posés (meubles hauts, téléviseur, miroir). */
  elevation: number;
  /** `sol` : occupe le sol ; `haut` : mural ou posé, ne gêne pas la circulation. */
  layer: 'sol' | 'haut';
  /** Couleur principale par défaut. */
  color: string;
  /** L'objet peut être redimensionné librement par le conseiller. */
  resizable: boolean;
  variants?: FurnitureVariant[];
  parts: FurniturePart[];
}

type P = [shape: PartShape, x: number, y: number, w: number, d: number, z: number, h: number, color: string, opacity?: number];

/** Définition en mètres (plus lisible) puis conversion en fractions du modèle. */
function def(
  id: string,
  name: string,
  category: FurnitureCategory,
  rooms: RoomType[],
  [w, d, h]: [number, number, number],
  color: string,
  parts: P[],
  extra: Partial<Pick<FurnitureModel, 'elevation' | 'layer' | 'resizable' | 'variants'>> = {},
): FurnitureModel {
  return {
    id,
    name,
    category,
    rooms,
    w,
    d,
    h,
    color,
    elevation: extra.elevation ?? 0,
    layer: extra.layer ?? 'sol',
    resizable: extra.resizable ?? true,
    variants: extra.variants,
    parts: parts.map(([shape, x, y, pw, pd, z, ph, c, opacity]) => ({
      shape,
      x: x / w,
      y: y / d,
      w: pw / w,
      d: pd / d,
      z: z / h,
      h: ph / h,
      color: c,
      opacity,
    })),
  };
}

const WOOD = '#c9a77c';
const DARK_WOOD = '#8b6b4a';
const WHITE = '#f4f2ee';
const CERAMIC = '#fbfbfa';
const METAL = '#9ca3af';
const BLACK = '#1f2937';
const TOP = '#7c6a58';
const GLASS = '#bfe3f2';
const CUSHION = '#c3c9d1';

/** Quatre pieds fins aux coins d'un plateau. */
function legs(x: number, y: number, w: number, d: number, h: number, c = DARK_WOOD, s = 0.05): P[] {
  return [
    ['box', x, y, s, s, 0, h, c],
    ['box', x + w - s, y, s, s, 0, h, c],
    ['box', x, y + d - s, s, s, 0, h, c],
    ['box', x + w - s, y + d - s, s, s, 0, h, c],
  ];
}

/** Chaise vue de dessus : assise + dossier (dossier côté `back`). */
function chair(x: number, y: number, back: 'haut' | 'bas', c = WOOD): P[] {
  const s = 0.42;
  return [
    ['box', x, y, s, s, 0.42, 0.05, c],
    ...legs(x, y, s, s, 0.42, DARK_WOOD, 0.04),
    back === 'haut' ? ['box', x, y, s, 0.06, 0.47, 0.45, c] : ['box', x, y + s - 0.06, s, 0.06, 0.47, 0.45, c],
  ];
}

function diningTable(id: string, name: string, tableW: number, perSide: number): FurnitureModel {
  const W = tableW + 0.2;
  const D = 1.8;
  const step = tableW / perSide;
  const chairs: P[] = [];
  for (let i = 0; i < perSide; i++) {
    const cx = 0.1 + step * i + (step - 0.42) / 2;
    chairs.push(...chair(cx, 0.02, 'haut'), ...chair(cx, D - 0.44, 'bas'));
  }
  return def(
    id,
    name,
    'sejour',
    ['sejour', 'cuisine', 'veranda'],
    [W, D, 0.92],
    WOOD,
    [['box', 0.1, 0.5, tableW, 0.8, 0.71, 0.04, 'main'], ...legs(0.15, 0.55, tableW - 0.1, 0.7, 0.71), ...chairs],
  );
}

function kitchenBase(id: string, name: string, w: number, extra: P[] = [], variants?: FurnitureVariant[]): FurnitureModel {
  return def(
    id,
    name,
    'cuisine',
    ['cuisine'],
    [w, 0.6, 0.92],
    WHITE,
    [['box', 0, 0, w, 0.56, 0.08, 0.8, 'main'], ['box', 0.03, 0.02, w - 0.06, 0.5, 0, 0.08, '#d6d3d1'], ['box', 0, 0, w, 0.6, 0.88, 0.04, TOP], ...extra],
    { variants },
  );
}

export const FURNITURE_MODELS: FurnitureModel[] = [
  // ------------------------------------------------------------- Séjour
  def(
    'canape',
    'Canapé',
    'sejour',
    ['sejour'],
    [2.1, 0.92, 0.85],
    '#8d96a3',
    [
      ['round', 0, 0.18, 2.1, 0.74, 0, 0.42, 'main'],
      ['round', 0, 0, 2.1, 0.24, 0, 0.85, 'main'],
      ['round', 0, 0.18, 0.18, 0.74, 0, 0.62, 'main'],
      ['round', 1.92, 0.18, 0.18, 0.74, 0, 0.62, 'main'],
      ['round', 0.2, 0.26, 0.84, 0.62, 0.42, 0.12, CUSHION],
      ['round', 1.06, 0.26, 0.84, 0.62, 0.42, 0.12, CUSHION],
    ],
    {
      variants: [
        { id: '3p', label: '3 places', w: 2.1, d: 0.92 },
        { id: '2p', label: '2 places', w: 1.6, d: 0.9 },
        { id: '4p', label: '4 places', w: 2.6, d: 0.95 },
      ],
    },
  ),
  def(
    'fauteuil',
    'Fauteuil',
    'sejour',
    ['sejour', 'chambre', 'veranda'],
    [0.85, 0.85, 0.85],
    '#a3a89c',
    [
      ['round', 0, 0.18, 0.85, 0.67, 0, 0.42, 'main'],
      ['round', 0, 0, 0.85, 0.22, 0, 0.85, 'main'],
      ['round', 0, 0.18, 0.15, 0.67, 0, 0.62, 'main'],
      ['round', 0.7, 0.18, 0.15, 0.67, 0, 0.62, 'main'],
      ['round', 0.17, 0.24, 0.51, 0.55, 0.42, 0.1, CUSHION],
    ],
  ),
  def('table_basse', 'Table basse', 'sejour', ['sejour'], [1.1, 0.6, 0.42], WOOD, [['round', 0, 0, 1.1, 0.6, 0.36, 0.06, 'main'], ...legs(0.05, 0.05, 1.0, 0.5, 0.36)]),
  def(
    'meuble_tv',
    'Meuble TV',
    'sejour',
    ['sejour'],
    [1.6, 0.42, 0.5],
    DARK_WOOD,
    [
      ['box', 0, 0, 1.6, 0.42, 0.06, 0.44, 'main'],
      ['box', 0.03, 0.03, 1.54, 0.36, 0, 0.06, BLACK],
      ['box', 0.79, 0.4, 0.02, 0.02, 0.08, 0.38, '#5b4632'],
    ],
    { variants: [{ id: '160', label: '160 cm', w: 1.6, d: 0.42 }, { id: '120', label: '120 cm', w: 1.2, d: 0.4 }, { id: '200', label: '200 cm', w: 2.0, d: 0.45 }] },
  ),
  def(
    'televiseur',
    'Téléviseur',
    'sejour',
    ['sejour', 'chambre'],
    [1.2, 0.22, 0.75],
    BLACK,
    [
      ['box', 0.45, 0.04, 0.3, 0.16, 0, 0.03, BLACK],
      ['box', 0.57, 0.08, 0.06, 0.05, 0.03, 0.12, BLACK],
      ['box', 0, 0.06, 1.2, 0.05, 0.12, 0.63, 'main'],
      ['box', 0.03, 0.105, 1.14, 0.006, 0.15, 0.57, '#334155'],
    ],
    { elevation: 0.5, layer: 'haut', variants: [{ id: '55', label: '55 pouces', w: 1.23, d: 0.22 }, { id: '43', label: '43 pouces', w: 0.97, d: 0.2, h: 0.62 }, { id: '65', label: '65 pouces', w: 1.45, d: 0.25, h: 0.88 }] },
  ),
  diningTable('table_repas_4', 'Table à manger (4 chaises)', 1.2, 2),
  diningTable('table_repas_6', 'Table à manger (6 chaises)', 1.8, 3),
  def(
    'table_repas_2',
    'Table (2 chaises)',
    'cuisine',
    ['cuisine', 'sejour'],
    [0.8, 1.7, 0.92],
    WOOD,
    [['box', 0, 0.48, 0.8, 0.74, 0.71, 0.04, 'main'], ...legs(0.05, 0.53, 0.7, 0.64, 0.71), ...chair(0.19, 0.02, 'haut'), ...chair(0.19, 1.26, 'bas')],
  ),
  def(
    'plante',
    'Plante verte',
    'divers',
    ['sejour', 'entree', 'bureau', 'veranda', 'chambre'],
    [0.5, 0.5, 1.2],
    '#3f8f4f',
    [
      ['cyl', 0.12, 0.12, 0.26, 0.26, 0, 0.32, '#b45309'],
      ['sphere', 0, 0, 0.5, 0.5, 0.35, 0.7, 'main'],
    ],
    { resizable: true },
  ),
  // ------------------------------------------------------------- Cuisine
  kitchenBase('meuble_bas', 'Meuble bas et plan de travail', 0.8, [['box', 0.03, 0.56, 0.74 * 1, 0.01, 0.12, 0.72, '#e7e5e4']], [
    { id: '60', label: '60 cm', w: 0.6, d: 0.6 },
    { id: '80', label: '80 cm', w: 0.8, d: 0.6 },
    { id: '120', label: '120 cm', w: 1.2, d: 0.6 },
  ]),
  kitchenBase('evier', 'Évier', 0.8, [
    ['round', 0.12, 0.1, 0.56, 0.38, 0.86, 0.07, '#cbd5e1'],
    ['cyl', 0.37, 0.03, 0.06, 0.06, 0.92, 0.22, METAL],
  ]),
  kitchenBase('plaque_cuisson', 'Plaque de cuisson et four', 0.6, [
    ['box', 0.05, 0.07, 0.5, 0.46, 0.92, 0.012, BLACK],
    ['cyl', 0.09, 0.11, 0.17, 0.17, 0.93, 0.008, '#4b5563'],
    ['cyl', 0.34, 0.11, 0.17, 0.17, 0.93, 0.008, '#4b5563'],
    ['cyl', 0.09, 0.32, 0.17, 0.17, 0.93, 0.008, '#4b5563'],
    ['cyl', 0.34, 0.32, 0.17, 0.17, 0.93, 0.008, '#4b5563'],
    ['box', 0.05, 0.56, 0.5, 0.02, 0.25, 0.5, BLACK],
  ]),
  def(
    'refrigerateur',
    'Réfrigérateur',
    'cuisine',
    ['cuisine'],
    [0.6, 0.66, 1.85],
    '#e5e7eb',
    [
      ['box', 0, 0, 0.6, 0.62, 0, 1.85, 'main'],
      ['box', 0.01, 0.62, 0.58, 0.03, 0.02, 1.82, '#f3f4f6'],
      ['box', 0.04, 0.65, 0.03, 0.01, 0.9, 0.5, METAL],
    ],
    { resizable: false },
  ),
  def(
    'meubles_hauts',
    'Meubles hauts',
    'cuisine',
    ['cuisine'],
    [0.8, 0.35, 0.7],
    WHITE,
    [
      ['box', 0, 0, 0.8, 0.33, 0, 0.7, 'main'],
      ['box', 0.395, 0.33, 0.01, 0.02, 0.02, 0.66, '#d6d3d1'],
    ],
    { elevation: 1.45, layer: 'haut', variants: [{ id: '60', label: '60 cm', w: 0.6, d: 0.35 }, { id: '80', label: '80 cm', w: 0.8, d: 0.35 }, { id: '120', label: '120 cm', w: 1.2, d: 0.35 }] },
  ),
  // ------------------------------------------------------------- Chambre
  def(
    'lit',
    'Lit',
    'chambre',
    ['chambre'],
    [1.6, 2.05, 0.95],
    '#9fb0c4',
    [
      ['box', 0, 0, 1.6, 0.08, 0, 0.95, DARK_WOOD],
      ['box', 0, 0.08, 1.6, 1.97, 0.1, 0.22, '#d6d3d1'],
      ...legs(0.02, 0.1, 1.56, 1.93, 0.1, DARK_WOOD, 0.06),
      ['round', 0.03, 0.1, 1.54, 1.92, 0.32, 0.18, '#f8fafc'],
      ['round', 0.12, 0.16, 0.62, 0.36, 0.5, 0.12, '#e5e7eb'],
      ['round', 0.86, 0.16, 0.62, 0.36, 0.5, 0.12, '#e5e7eb'],
      ['round', 0.02, 0.62, 1.56, 1.42, 0.5, 0.07, 'main'],
    ],
    {
      variants: [
        { id: '160', label: 'Lit double 160 × 200', w: 1.6, d: 2.05 },
        { id: '140', label: 'Lit double 140 × 190', w: 1.4, d: 1.95 },
        { id: '90', label: 'Lit simple 90 × 190', w: 0.95, d: 1.95 },
      ],
    },
  ),
  def('chevet', 'Table de chevet', 'chambre', ['chambre'], [0.45, 0.4, 0.75], WOOD, [
    ['box', 0, 0, 0.45, 0.4, 0, 0.5, 'main'],
    ['cyl', 0.15, 0.1, 0.16, 0.16, 0.5, 0.05, '#e7e5e4'],
    ['cyl', 0.13, 0.08, 0.2, 0.2, 0.55, 0.2, '#fde68a', 0.9],
  ]),
  def(
    'armoire',
    'Armoire',
    'chambre',
    ['chambre', 'entree', 'couloir', 'palier'],
    [1.2, 0.6, 2.1],
    '#e7dccb',
    [
      ['box', 0, 0, 1.2, 0.58, 0, 2.1, 'main'],
      ['box', 0.595, 0.58, 0.01, 0.02, 0.05, 2.0, '#a8a29e'],
      ['box', 0.52, 0.6, 0.02, 0.01, 0.9, 0.3, METAL],
      ['box', 0.66, 0.6, 0.02, 0.01, 0.9, 0.3, METAL],
    ],
    { variants: [{ id: '120', label: '120 cm', w: 1.2, d: 0.6 }, { id: '100', label: '100 cm', w: 1.0, d: 0.6 }, { id: '160', label: '160 cm', w: 1.6, d: 0.6 }, { id: 'dressing', label: 'Dressing 200 cm', w: 2.0, d: 0.6 }] },
  ),
  def('commode', 'Commode', 'chambre', ['chambre'], [1.0, 0.5, 0.85], WOOD, [
    ['box', 0, 0, 1.0, 0.48, 0, 0.85, 'main'],
    ['box', 0.03, 0.48, 0.94, 0.02, 0.06, 0.22, '#b8946b'],
    ['box', 0.03, 0.48, 0.94, 0.02, 0.32, 0.22, '#b8946b'],
    ['box', 0.03, 0.48, 0.94, 0.02, 0.58, 0.22, '#b8946b'],
  ]),
  // ------------------------------------------------------------- Bureau
  def(
    'bureau_poste',
    'Bureau, chaise et ordinateur',
    'bureau',
    ['bureau', 'chambre'],
    [1.2, 1.15, 1.1],
    WOOD,
    [
      ['box', 0, 0, 1.2, 0.6, 0.72, 0.03, 'main'],
      ...legs(0.02, 0.02, 1.16, 0.56, 0.72),
      ['box', 0.55, 0.06, 0.1, 0.08, 0.75, 0.1, BLACK],
      ['box', 0.35, 0.08, 0.5, 0.03, 0.85, 0.3, BLACK],
      ['box', 0.4, 0.3, 0.4, 0.13, 0.75, 0.02, '#d1d5db'],
      ['cyl', 0.39, 0.66, 0.44, 0.44, 0.42, 0.07, '#374151'],
      ['cyl', 0.57, 0.84, 0.08, 0.08, 0, 0.42, BLACK],
      ['box', 0.41, 1.04, 0.4, 0.07, 0.49, 0.5, '#374151'],
    ],
  ),
  def(
    'bibliotheque',
    'Rangement / bibliothèque',
    'bureau',
    ['bureau', 'sejour', 'chambre', 'couloir'],
    [1.0, 0.35, 1.9],
    WOOD,
    [
      ['box', 0, 0, 1.0, 0.35, 0, 0.04, 'main'],
      ['box', 0, 0, 0.03, 0.35, 0, 1.9, 'main'],
      ['box', 0.97, 0, 0.03, 0.35, 0, 1.9, 'main'],
      ['box', 0, 0, 1.0, 0.02, 0, 1.9, 'main'],
      ['box', 0, 0, 1.0, 0.35, 0.62, 0.03, 'main'],
      ['box', 0, 0, 1.0, 0.35, 1.24, 0.03, 'main'],
      ['box', 0, 0, 1.0, 0.35, 1.87, 0.03, 'main'],
      ['box', 0.06, 0.04, 0.4, 0.26, 0.04, 0.3, '#7c3aed', 0.8],
      ['box', 0.52, 0.04, 0.38, 0.26, 0.65, 0.3, '#0f766e', 0.8],
      ['box', 0.1, 0.04, 0.5, 0.26, 1.27, 0.28, '#b45309', 0.8],
    ],
  ),
  // ------------------------------------------------------------- Salle de bain
  def('meuble_vasque', 'Meuble vasque', 'salle_de_bain', ['salle_de_bain'], [0.8, 0.48, 0.92], WOOD, [
    ['box', 0, 0, 0.8, 0.46, 0.15, 0.68, 'main'],
    ['box', 0, 0, 0.8, 0.48, 0.83, 0.04, CERAMIC],
    ['round', 0.18, 0.08, 0.44, 0.32, 0.86, 0.06, '#e0f2fe'],
    ['cyl', 0.37, 0.02, 0.06, 0.06, 0.87, 0.14, METAL],
  ], { variants: [{ id: '80', label: '80 cm', w: 0.8, d: 0.48 }, { id: '60', label: '60 cm', w: 0.6, d: 0.45 }, { id: '120', label: 'Double vasque 120 cm', w: 1.2, d: 0.5 }] }),
  def('miroir', 'Miroir', 'salle_de_bain', ['salle_de_bain', 'entree'], [0.7, 0.04, 0.8], '#dbeafe', [['box', 0, 0, 0.7, 0.03, 0, 0.8, 'main']], { elevation: 1.15, layer: 'haut' }),
  def(
    'douche',
    'Douche',
    'salle_de_bain',
    ['salle_de_bain'],
    [0.9, 0.9, 2.0],
    '#eef2f6',
    [
      ['box', 0, 0, 0.9, 0.9, 0, 0.06, 'main'],
      ['cyl', 0.41, 0.41, 0.08, 0.08, 0.06, 0.005, METAL],
      ['box', 0, 0.875, 0.9, 0.025, 0.06, 1.94, GLASS, 0.35],
      ['box', 0.875, 0, 0.025, 0.9, 0.06, 1.94, GLASS, 0.35],
      ['cyl', 0.4, 0.02, 0.1, 0.06, 1.85, 0.03, METAL],
    ],
    { variants: [{ id: '90', label: '90 × 90', w: 0.9, d: 0.9 }, { id: '80', label: '80 × 80', w: 0.8, d: 0.8 }, { id: '120', label: 'Italienne 120 × 90', w: 1.2, d: 0.9 }] },
  ),
  def(
    'baignoire',
    'Baignoire',
    'salle_de_bain',
    ['salle_de_bain'],
    [1.7, 0.75, 0.58],
    CERAMIC,
    [
      ['round', 0, 0, 1.7, 0.75, 0, 0.56, 'main'],
      ['round', 0.1, 0.09, 1.5, 0.57, 0.5, 0.07, '#e0f2fe'],
      ['cyl', 0.05, 0.34, 0.06, 0.06, 0.56, 0.12, METAL],
    ],
    { variants: [{ id: '170', label: '170 × 75', w: 1.7, d: 0.75 }, { id: '160', label: '160 × 70', w: 1.6, d: 0.7 }, { id: '180', label: '180 × 80', w: 1.8, d: 0.8 }] },
  ),
  def(
    'wc',
    'WC',
    'wc',
    ['wc', 'salle_de_bain'],
    [0.4, 0.68, 0.8],
    CERAMIC,
    [
      ['box', 0.02, 0, 0.36, 0.18, 0.35, 0.45, 'main'],
      ['cyl', 0.03, 0.14, 0.34, 0.52, 0, 0.4, 'main'],
      ['cyl', 0.05, 0.17, 0.3, 0.46, 0.4, 0.03, '#e5e7eb'],
    ],
    { resizable: false },
  ),
  def('lave_mains', 'Lave-mains', 'wc', ['wc'], [0.42, 0.28, 0.9], CERAMIC, [
    ['round', 0, 0, 0.42, 0.28, 0.75, 0.15, 'main'],
    ['round', 0.07, 0.06, 0.28, 0.18, 0.86, 0.04, '#e0f2fe'],
    ['cyl', 0.19, 0.01, 0.04, 0.04, 0.9, 0.1, METAL],
  ]),
  def('colonne_sdb', 'Colonne de rangement', 'salle_de_bain', ['salle_de_bain'], [0.4, 0.35, 1.8], WHITE, [
    ['box', 0, 0, 0.4, 0.34, 0, 1.8, 'main'],
    ['box', 0.03, 0.34, 0.34, 0.01, 0.05, 1.7, '#e7e5e4'],
  ]),
  // ------------------------------------------------------------- Entrée et couloir
  def('meuble_chaussures', 'Meuble à chaussures', 'entree', ['entree', 'couloir'], [0.9, 0.32, 0.9], WHITE, [
    ['box', 0, 0, 0.9, 0.32, 0, 0.9, 'main'],
    ['box', 0.03, 0.31, 0.84, 0.01, 0.05, 0.38, '#d6d3d1'],
    ['box', 0.03, 0.31, 0.84, 0.01, 0.47, 0.38, '#d6d3d1'],
  ]),
  def('porte_manteau', 'Porte-manteau', 'entree', ['entree'], [0.5, 0.5, 1.8], DARK_WOOD, [
    ['cyl', 0.08, 0.08, 0.34, 0.34, 0, 0.03, 'main'],
    ['cyl', 0.22, 0.22, 0.06, 0.06, 0, 1.8, 'main'],
    ['cyl', 0.05, 0.05, 0.4, 0.4, 1.62, 0.04, 'main'],
  ]),
  def('console', 'Console', 'entree', ['entree', 'couloir', 'sejour'], [1.0, 0.35, 0.8], WOOD, [['box', 0, 0, 1.0, 0.35, 0.76, 0.04, 'main'], ...legs(0.03, 0.03, 0.94, 0.29, 0.76)]),
  def('rangement_bas', 'Petit meuble de rangement', 'entree', ['couloir', 'palier', 'entree'], [0.8, 0.35, 0.85], WOOD, [
    ['box', 0, 0, 0.8, 0.35, 0, 0.85, 'main'],
    ['box', 0.395, 0.34, 0.01, 0.01, 0.05, 0.75, '#8b6b4a'],
  ]),
  // ------------------------------------------------------------- Garage
  def(
    'voiture',
    'Voiture',
    'garage',
    ['garage'],
    [1.8, 4.3, 1.45],
    '#5b7a99',
    [
      ['round', 0.02, 0.05, 1.76, 4.2, 0.28, 0.55, 'main'],
      ['round', 0.15, 1.2, 1.5, 2.1, 0.83, 0.55, 'main'],
      ['box', 0.2, 3.25, 1.4, 0.06, 0.85, 0.45, '#1e293b', 0.85],
      ['box', 0.2, 1.22, 1.4, 0.05, 0.85, 0.45, '#1e293b', 0.85],
      ['cylx', -0.02, 0.6, 0.26, 0.64, 0, 0.64, BLACK],
      ['cylx', 1.56, 0.6, 0.26, 0.64, 0, 0.64, BLACK],
      ['cylx', -0.02, 3.05, 0.26, 0.64, 0, 0.64, BLACK],
      ['cylx', 1.56, 3.05, 0.26, 0.64, 0, 0.64, BLACK],
      ['box', 0.15, 4.22, 0.3, 0.05, 0.55, 0.12, '#fef3c7'],
      ['box', 1.35, 4.22, 0.3, 0.05, 0.55, 0.12, '#fef3c7'],
    ],
    { resizable: false },
  ),
  def(
    'etagere',
    'Étagères de rangement',
    'garage',
    ['garage', 'cellier'],
    [1.2, 0.45, 1.9],
    METAL,
    [
      ['box', 0, 0, 0.04, 0.45, 0, 1.9, 'main'],
      ['box', 1.16, 0, 0.04, 0.45, 0, 1.9, 'main'],
      ['box', 0, 0, 1.2, 0.45, 0.1, 0.03, '#cbd5e1'],
      ['box', 0, 0, 1.2, 0.45, 0.7, 0.03, '#cbd5e1'],
      ['box', 0, 0, 1.2, 0.45, 1.3, 0.03, '#cbd5e1'],
      ['box', 0, 0, 1.2, 0.45, 1.87, 0.03, '#cbd5e1'],
      ['box', 0.1, 0.05, 0.45, 0.35, 0.13, 0.3, '#d97706', 0.85],
      ['box', 0.65, 0.05, 0.45, 0.35, 0.73, 0.3, '#2563eb', 0.85],
    ],
  ),
  def('etabli', 'Établi', 'garage', ['garage'], [1.5, 0.7, 0.92], '#a16207', [
    ['box', 0, 0, 1.5, 0.7, 0.86, 0.06, 'main'],
    ...legs(0.03, 0.03, 1.44, 0.64, 0.86, '#57534e', 0.06),
    ['box', 0.05, 0.05, 1.4, 0.6, 0.2, 0.03, '#78716c'],
    ['box', 1.2, 0.55, 0.2, 0.18, 0.92, 0.1, '#475569'],
  ]),
  // ------------------------------------------------------------- Buanderie
  def('lave_linge', 'Machine à laver', 'buanderie', ['cellier', 'salle_de_bain', 'cuisine', 'garage'], [0.6, 0.6, 0.85], CERAMIC, [
    ['box', 0, 0, 0.6, 0.58, 0, 0.85, 'main'],
    ['cyly', 0.13, 0.57, 0.34, 0.03, 0.2, 0.34, '#94a3b8'],
    ['box', 0.05, 0.57, 0.5, 0.02, 0.72, 0.1, '#e2e8f0'],
  ], { resizable: false }),
  def('seche_linge', 'Sèche-linge', 'buanderie', ['cellier', 'garage'], [0.6, 0.6, 0.85], '#eef2f6', [
    ['box', 0, 0, 0.6, 0.58, 0, 0.85, 'main'],
    ['cyly', 0.13, 0.57, 0.34, 0.03, 0.2, 0.34, '#cbd5e1'],
    ['box', 0.05, 0.57, 0.5, 0.02, 0.72, 0.1, '#e2e8f0'],
  ], { resizable: false }),
  // ------------------------------------------------------------- Divers / véranda
  def(
    'salon_jardin',
    'Table ronde et 2 fauteuils',
    'divers',
    ['veranda'],
    [1.7, 0.9, 0.85],
    '#d6c7a1',
    [
      ['cyl', 0.55, 0.15, 0.6, 0.6, 0.7, 0.04, 'main'],
      ['cyl', 0.82, 0.42, 0.06, 0.06, 0, 0.7, DARK_WOOD],
      ['round', 0, 0.15, 0.5, 0.6, 0, 0.42, '#a3a89c'],
      ['round', 0, 0.15, 0.12, 0.6, 0, 0.8, '#a3a89c'],
      ['round', 1.2, 0.15, 0.5, 0.6, 0, 0.42, '#a3a89c'],
      ['round', 1.58, 0.15, 0.12, 0.6, 0, 0.8, '#a3a89c'],
    ],
  ),
];

const BY_ID = new Map(FURNITURE_MODELS.map((m) => [m.id, m]));

export function getFurnitureModel(id: string): FurnitureModel | undefined {
  return BY_ID.get(id);
}

/** Dimensions d'une variante (ou du modèle par défaut). */
export function variantDims(model: FurnitureModel, variantId?: string): { w: number; d: number; h: number } {
  const v = model.variants?.find((x) => x.id === variantId);
  return { w: v?.w ?? model.w, d: v?.d ?? model.d, h: v?.h ?? model.h };
}

/** Couleur d'un volume : couleur principale personnalisée ou couleur fixe. */
export function partColor(part: FurniturePart, model: FurnitureModel, custom?: string): string {
  return part.color === 'main' ? (custom ?? model.color) : part.color;
}

/** Modèles proposés pour un type de pièce (bibliothèque). */
export function modelsForRoom(type: RoomType): FurnitureModel[] {
  return FURNITURE_MODELS.filter((m) => m.rooms.includes(type));
}
