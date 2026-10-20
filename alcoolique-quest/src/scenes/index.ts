// Registre des scènes, dans l'ordre de la timeline.
import type { CineScene, Quality } from '../core/director';
import type { SceneKey } from '../core/timeline';
import { createEagleScene } from './eagleScene';
import { createWorldScene } from './worldScene';
import { createPlainScene } from './plainScene';
import { createCityScene } from './cityScene';
import { createBattleScene } from './battleScene';
import { createCathedralScene } from './cathedralScene';
import { createTitleScene } from './titleScene';

export const SCENE_FACTORIES: [string, SceneKey, (q: Quality) => CineScene][] = [
  ["L'aigle", 'eagle', createEagleScene],
  ['La traversée du monde', 'world', createWorldScene],
  ['La plaine oubliée', 'plain', createPlainScene],
  ['La grande cité', 'city', createCityScene],
  ['Les héros', 'battle', createBattleScene],
  ['La cathédrale', 'cathedral', createCathedralScene],
  ['Le titre', 'title', createTitleScene],
];
