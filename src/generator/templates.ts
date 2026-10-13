import type { HousingAnswers } from '@/domain/types';

/**
 * Bibliothèque de modèles de logements.
 * Un modèle = une forme (rectangulaire, en L) + des réponses par défaut.
 * La géométrie est toujours produite par le générateur déterministe (generate.ts),
 * jamais par une image : chaque modèle donne un plan entièrement modifiable.
 */

export type TemplateShape = 'rect' | 'L';

export interface HousingTemplate {
  id: string;
  name: string;
  group: 'Appartement' | 'Maison' | 'Modèles complémentaires';
  description: string;
  shape: TemplateShape;
  /** Couloir imposé par le modèle (ex. couloir central). */
  forceCorridor?: boolean;
  defaults: HousingAnswers;
}

const FEATURES_NONE: HousingAnswers['features'] = {
  stairs: false,
  extension: false,
  veranda: false,
  extraRoom: false,
  garageCommunicating: false,
  other: false,
};

function answers(partial: Partial<HousingAnswers> & Pick<HousingAnswers, 'housingType'>): HousingAnswers {
  return {
    surfaceBand: '50_80',
    surfaceExact: null,
    mainRooms: 1 + (partial.bedrooms ?? 2) + (partial.features?.extraRoom ? 1 : 0),
    levels: 1,
    bedrooms: 2,
    kitchen: 'separee',
    corridor: false,
    garage: 'aucun',
    exteriorAccesses: 1,
    windows: 4,
    bays: 1,
    extraDoors: 0,
    comment: '',
    ...partial,
    features: { ...FEATURES_NONE, ...(partial.features ?? {}) },
  };
}

export const TEMPLATES: HousingTemplate[] = [
  // Appartements
  {
    id: 'studio',
    name: 'Studio',
    group: 'Appartement',
    description: 'Pièce de vie avec coin cuisine, salle d’eau, entrée.',
    shape: 'rect',
    defaults: answers({ housingType: 'appartement', surfaceBand: 'exacte', surfaceExact: 28, bedrooms: 0, kitchen: 'ouverte', windows: 2, bays: 0 }),
  },
  {
    id: 'appt_t2',
    name: 'Appartement T2',
    group: 'Appartement',
    description: 'Séjour, cuisine séparée, une chambre.',
    shape: 'rect',
    defaults: answers({ housingType: 'appartement', surfaceBand: 'exacte', surfaceExact: 45, bedrooms: 1, windows: 3, bays: 1 }),
  },
  {
    id: 'appt_t3',
    name: 'Appartement T3',
    group: 'Appartement',
    description: 'Séjour, cuisine, deux chambres desservies par un couloir.',
    shape: 'rect',
    defaults: answers({ housingType: 'appartement', surfaceBand: '50_80', bedrooms: 2, corridor: true, windows: 4, bays: 1 }),
  },
  {
    id: 'appt_t4',
    name: 'Appartement T4',
    group: 'Appartement',
    description: 'Séjour, cuisine, trois chambres, couloir.',
    shape: 'rect',
    defaults: answers({ housingType: 'appartement', surfaceBand: '80_120', bedrooms: 3, corridor: true, windows: 5, bays: 1 }),
  },
  {
    id: 'appt_couloir',
    name: 'Appartement avec couloir central',
    group: 'Appartement',
    description: 'Pièces de jour et de nuit de part et d’autre d’un couloir.',
    shape: 'rect',
    forceCorridor: true,
    defaults: answers({ housingType: 'appartement', surfaceBand: '80_120', bedrooms: 3, corridor: true, windows: 6, bays: 1 }),
  },
  {
    id: 'appt_ouvert',
    name: 'Appartement séjour et cuisine ouverte',
    group: 'Appartement',
    description: 'Grande pièce de vie avec cuisine ouverte, deux chambres.',
    shape: 'rect',
    defaults: answers({ housingType: 'appartement', surfaceBand: '50_80', bedrooms: 2, kitchen: 'ouverte', windows: 3, bays: 1 }),
  },
  // Maisons
  {
    id: 'maison_plainpied',
    name: 'Maison de plain-pied',
    group: 'Maison',
    description: 'Un niveau, trois chambres, couloir de nuit.',
    shape: 'rect',
    defaults: answers({ housingType: 'maison', surfaceBand: '80_120', bedrooms: 3, corridor: true, exteriorAccesses: 2, windows: 6, bays: 1 }),
  },
  {
    id: 'maison_etage',
    name: 'Maison à étage',
    group: 'Maison',
    description: 'Pièces de vie au rez-de-chaussée, chambres à l’étage, escalier.',
    shape: 'rect',
    defaults: answers({
      housingType: 'maison',
      surfaceBand: '120_180',
      levels: 2,
      bedrooms: 3,
      corridor: true,
      exteriorAccesses: 2,
      windows: 8,
      bays: 1,
      features: { ...FEATURES_NONE, stairs: true },
    }),
  },
  {
    id: 'maison_garage_attenant',
    name: 'Maison avec garage attenant',
    group: 'Maison',
    description: 'Plain-pied, garage accolé communiquant avec l’entrée.',
    shape: 'rect',
    defaults: answers({
      housingType: 'maison',
      surfaceBand: '80_120',
      bedrooms: 3,
      corridor: true,
      garage: 'attenant',
      exteriorAccesses: 2,
      windows: 6,
      bays: 1,
      features: { ...FEATURES_NONE, garageCommunicating: true },
    }),
  },
  {
    id: 'maison_garage_separe',
    name: 'Maison avec garage séparé',
    group: 'Maison',
    description: 'Plain-pied, garage indépendant à côté de la maison.',
    shape: 'rect',
    defaults: answers({ housingType: 'maison', surfaceBand: '80_120', bedrooms: 3, corridor: true, garage: 'separe', exteriorAccesses: 2, windows: 6, bays: 1 }),
  },
  {
    id: 'maison_ouverte',
    name: 'Maison séjour et cuisine ouverte',
    group: 'Maison',
    description: 'Plain-pied, grande pièce de vie avec cuisine ouverte.',
    shape: 'rect',
    defaults: answers({ housingType: 'maison', surfaceBand: '80_120', bedrooms: 3, kitchen: 'ouverte', corridor: true, exteriorAccesses: 2, windows: 6, bays: 2 }),
  },
  {
    id: 'maison_chambres_etage',
    name: 'Maison avec plusieurs chambres à l’étage',
    group: 'Maison',
    description: 'Deux niveaux, quatre chambres à l’étage, garage attenant.',
    shape: 'rect',
    defaults: answers({
      housingType: 'maison',
      surfaceBand: '120_180',
      levels: 2,
      bedrooms: 4,
      corridor: true,
      garage: 'attenant',
      exteriorAccesses: 2,
      windows: 9,
      bays: 1,
      features: { ...FEATURES_NONE, stairs: true, garageCommunicating: true },
    }),
  },
  // Complémentaires
  {
    id: 'maison_l',
    name: 'Maison en L',
    group: 'Modèles complémentaires',
    description: 'Aile de jour et aile de nuit en équerre.',
    shape: 'L',
    defaults: answers({ housingType: 'maison', surfaceBand: '80_120', bedrooms: 3, kitchen: 'ouverte', corridor: true, exteriorAccesses: 2, windows: 6, bays: 1 }),
  },
  {
    id: 'maison_rect',
    name: 'Maison rectangulaire simple',
    group: 'Modèles complémentaires',
    description: 'Plan compact sans couloir, deux chambres.',
    shape: 'rect',
    defaults: answers({ housingType: 'maison', surfaceBand: '50_80', bedrooms: 2, exteriorAccesses: 1, windows: 4, bays: 1 }),
  },
  {
    id: 'maison_extension',
    name: 'Maison avec extension',
    group: 'Modèles complémentaires',
    description: 'Plain-pied avec une extension à l’arrière.',
    shape: 'rect',
    defaults: answers({
      housingType: 'maison',
      surfaceBand: '80_120',
      bedrooms: 3,
      corridor: true,
      exteriorAccesses: 2,
      windows: 7,
      bays: 1,
      features: { ...FEATURES_NONE, extension: true },
    }),
  },
  {
    id: 'personnalise',
    name: 'Logement personnalisé',
    group: 'Modèles complémentaires',
    description: 'Plan composé uniquement à partir de vos réponses.',
    shape: 'rect',
    defaults: answers({ housingType: 'maison', surfaceBand: '80_120', bedrooms: 3, corridor: true, exteriorAccesses: 2, windows: 6, bays: 1 }),
  },
];

export function getTemplate(id: string | null | undefined): HousingTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1];
}

/**
 * Modèle le plus proche des réponses (utilisé pour le logement personnalisé).
 * Règles simples et explicables, sans aléatoire.
 */
export function bestTemplateFor(a: HousingAnswers): HousingTemplate {
  const id = (() => {
    if (a.housingType === 'appartement') {
      if (a.bedrooms === 0) return 'studio';
      if (a.kitchen === 'ouverte') return 'appt_ouvert';
      if (a.bedrooms === 1) return 'appt_t2';
      if (a.bedrooms === 2) return 'appt_t3';
      return a.corridor ? 'appt_couloir' : 'appt_t4';
    }
    if (a.levels > 1) return a.bedrooms >= 4 ? 'maison_chambres_etage' : 'maison_etage';
    if (a.features.extension) return 'maison_extension';
    if (a.garage === 'attenant') return 'maison_garage_attenant';
    if (a.garage === 'separe') return 'maison_garage_separe';
    if (a.kitchen === 'ouverte') return 'maison_ouverte';
    return a.bedrooms <= 2 && !a.corridor ? 'maison_rect' : 'maison_plainpied';
  })();
  return getTemplate(id);
}

export const SURFACE_BANDS: { value: HousingAnswers['surfaceBand']; label: string; target: number }[] = [
  { value: 'moins_50', label: 'Moins de 50 m²', target: 40 },
  { value: '50_80', label: '50 à 80 m²', target: 65 },
  { value: '80_120', label: '80 à 120 m²', target: 100 },
  { value: '120_180', label: '120 à 180 m²', target: 145 },
  { value: 'plus_180', label: 'Plus de 180 m²', target: 200 },
  { value: 'exacte', label: 'Surface exacte', target: 0 },
];

export function targetSurface(a: HousingAnswers): number {
  if (a.surfaceBand === 'exacte') return Math.min(600, Math.max(18, a.surfaceExact ?? 60));
  return SURFACE_BANDS.find((b) => b.value === a.surfaceBand)!.target;
}
