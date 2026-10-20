// Registre des scènes, dans l'ordre de la timeline.
import type { CineScene, Quality } from '../core/director';
import { createEagleScene } from './eagleScene';
import { createWorldScene } from './worldScene';
import { createPlainScene } from './plainScene';
import { createCityScene } from './cityScene';
import { createBattleScene } from './battleScene';
import { createCathedralScene } from './cathedralScene';
import { createTitleScene } from './titleScene';

export const SCENE_FACTORIES: [string, (q: Quality) => CineScene][] = [
  ["L'aigle", createEagleScene],
  ['La traversée du monde', createWorldScene],
  ['La plaine oubliée', createPlainScene],
  ['La grande cité', createCityScene],
  ['Les héros', createBattleScene],
  ['La cathédrale', createCathedralScene],
  ['Le titre', createTitleScene],
];
