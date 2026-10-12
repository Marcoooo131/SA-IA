/**
 * Paramètres du moteur de règles.
 * Ces valeurs proviennent des données de travail communiquées pour le projet :
 * ce sont des HYPOTHÈSES DE CONFIGURATION tant qu'elles n'ont pas été validées
 * par le responsable métier.
 */
export interface RulesConfig {
  centralPerDwelling: number;
  keypad: { default: number; max: number };
  motion: {
    angleDeg: number;
    rangeM: number;
    minPerLevel: number;
    corridorMinLength: number;
    studyGarage: boolean;
  };
  smoke: { coverageM2: number; includeGarage: boolean };
  shock: {
    perOpening: number;
    perBay: number;
    skipSectional: boolean;
    /** En mode volumétrique : quelles ouvertures sont proposées d'office. */
    volumetricScope: 'acces' | 'toutes' | 'aucune';
  };
}

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  centralPerDwelling: 1,
  keypad: { default: 1, max: 4 },
  motion: { angleDeg: 110, rangeM: 10, minPerLevel: 1, corridorMinLength: 4, studyGarage: true },
  smoke: { coverageM2: 50, includeGarage: false },
  shock: { perOpening: 1, perBay: 2, skipSectional: true, volumetricScope: 'acces' },
};
