// Timeline maîtresse de la cinématique : source unique de vérité pour le découpage en scènes et en plans,
// les fondus, les sous-titres et les marqueurs utilisés par la bande-son.
import { clamp, lerp } from './math';

export const DURATION = 120;

export type SceneKey = 'eagle' | 'world' | 'plain' | 'city' | 'battle' | 'cathedral' | 'title';

export interface Shot {
  id: string;
  scene: SceneKey;
  start: number;
  end: number;
  label: string;
}

/** Découpage plan par plan (storyboard exécutable). Les scènes 3D lisent ces bornes pour animer caméra et acteurs. */
export const SHOTS: Shot[] = [
  // SCÈNE 1 — LE RÉVEIL DE L'AIGLE
  { id: '1a', scene: 'eagle', start: 0, end: 5.2, label: "Noir, vent — l'œil de l'aigle s'ouvre" },
  { id: '1b', scene: 'eagle', start: 5.2, end: 7.4, label: 'Serres agrippées au rocher, plumes au vent' },
  { id: '1c', scene: 'eagle', start: 7.4, end: 9.6, label: 'Contre-plongée : il déploie ses ailes' },
  { id: '1d', scene: 'eagle', start: 9.6, end: 11.0, label: 'Derrière lui : il saute dans le vide' },
  { id: '1e', scene: 'eagle', start: 11.0, end: 12.0, label: "Vue subjective : plongée vers la mer" },
  // SCÈNE 2 — LA TRAVERSÉE DU MONDE
  { id: '2a', scene: 'world', start: 12.0, end: 18.0, label: "Au ras des vagues, falaises et navires" },
  { id: '2b', scene: 'world', start: 18.0, end: 21.0, label: 'Remontée brutale vers le ciel' },
  { id: '2c', scene: 'world', start: 21.0, end: 24.0, label: 'Traversée des nuages, rayons de soleil' },
  { id: '2d', scene: 'world', start: 24.0, end: 30.0, label: 'Révélation : la chaîne de montagnes' },
  // SCÈNE 3 — LA PLAINE OUBLIÉE
  { id: '3a', scene: 'plain', start: 30.0, end: 32.6, label: 'Herbes ondulant sous le vent' },
  { id: '3b', scene: 'plain', start: 32.6, end: 35.2, label: 'Arbre mort et pierre runique' },
  { id: '3c', scene: 'plain', start: 35.2, end: 38.0, label: 'Squelette colossal et machine de guerre' },
  { id: '3d', scene: 'plain', start: 38.0, end: 42.0, label: "La route de pierre — l'aigle file vers la cité" },
  // SCÈNE 4 — LA GRANDE CITÉ
  { id: '4a', scene: 'city', start: 42.0, end: 46.0, label: 'Murailles colossales, statues des héros' },
  { id: '4b', scene: 'city', start: 46.0, end: 50.0, label: 'Plongée dans les rues, marchés et forges' },
  { id: '4c', scene: 'city', start: 50.0, end: 54.0, label: 'Autour de la grande tour' },
  { id: '4d', scene: 'city', start: 54.0, end: 60.0, label: 'La grande place : les aventuriers se préparent' },
  // SCÈNE 5 — LES HÉROS ET LES COMBATS
  { id: '5a', scene: 'battle', start: 60.0, end: 63.6, label: 'Le mage — runes et boule d’énergie' },
  { id: '5b', scene: 'battle', start: 63.6, end: 67.2, label: "L'épéiste — parade, esquive, contre circulaire" },
  { id: '5c', scene: 'battle', start: 67.2, end: 71.0, label: "L'invocateur — cercle, portail, créature" },
  { id: '5d', scene: 'battle', start: 71.0, end: 74.6, label: 'Le berserker — charge, arme brisée, maillet-tonneau' },
  { id: '5e', scene: 'battle', start: 74.6, end: 78.0, label: 'Le rôdeur — la flèche au ralenti' },
  { id: '5f', scene: 'battle', start: 78.0, end: 82.0, label: 'Le colosse se dresse' },
  // SCÈNE 6 — L'APPARITION DU GRAND MÉCHANT
  { id: '6a', scene: 'cathedral', start: 82.0, end: 88.0, label: 'Silence. La nef abandonnée, la brume' },
  { id: '6b', scene: 'cathedral', start: 88.0, end: 91.5, label: 'Les ailes noires se déploient' },
  { id: '6c', scene: 'cathedral', start: 91.5, end: 94.5, label: 'La relique : une bouteille d’eau' },
  { id: '6d', scene: 'cathedral', start: 94.5, end: 97.0, label: 'Elle lève la tête vers nous' },
  { id: '6e', scene: 'cathedral', start: 97.0, end: 99.3, label: 'Elle saisit la bouteille' },
  { id: '6f', scene: 'cathedral', start: 99.3, end: 104.2, label: '« Vous avez cherché la puissance… »' },
  { id: '6g', scene: 'cathedral', start: 104.2, end: 108.0, label: '« La sobriété… ne vous sera pas rendue. »' },
  // SCÈNE 7 — LE TITRE
  { id: '7a', scene: 'title', start: 108.0, end: 120.0, label: 'ALCOOLIQUE QUEST — La Sobriété Perdue' },
];

export const SCENE_RANGES: Record<SceneKey, [number, number]> = (() => {
  const r = {} as Record<SceneKey, [number, number]>;
  for (const s of SHOTS) {
    const cur = r[s.scene];
    r[s.scene] = cur ? [Math.min(cur[0], s.start), Math.max(cur[1], s.end)] : [s.start, s.end];
  }
  return r;
})();

const byId = new Map(SHOTS.map((s) => [s.id, s]));
export function shot(id: string) {
  const s = byId.get(id);
  if (!s) throw new Error(`Plan inconnu : ${id}`);
  return s;
}
/** Progression 0→1 (bornée) du plan `id` au temps t. */
export const prog = (id: string, t: number) => {
  const s = shot(id);
  return clamp((t - s.start) / (s.end - s.start));
};
/** Temps local (en secondes) depuis le début du plan. */
export const local = (id: string, t: number) => t - shot(id).start;
export const inShot = (id: string, t: number) => {
  const s = shot(id);
  return t >= s.start && t < s.end;
};
export function shotAt(t: number): Shot {
  for (const s of SHOTS) if (t >= s.start && t < s.end) return s;
  return SHOTS[SHOTS.length - 1];
}

/** Fondus au noir : [temps, visibilité] interpolés linéairement. Les coupes franches sont des paires très rapprochées. */
const FADES: [number, number][] = [
  [0, 0], [1.6, 0], [4.2, 1],
  [29.4, 1], [30.0, 0.0], [30.25, 1], // fondu rapide montagnes → plaine
  [59.6, 1], [60.0, 0.0], [60.05, 1], // coupe sur le combat
  [81.75, 1], [81.8, 0], [82.6, 0], [85.5, 1], // la musique s'arrête : noir puis la nef
  [107.85, 1], [107.9, 0], // éclair noir, coupe brutale
  [109.2, 0], [109.4, 1],
  [118.0, 1], [119.6, 0], [120, 0],
];
export function fadeAt(t: number): number {
  if (t <= FADES[0][0]) return FADES[0][1];
  for (let i = 1; i < FADES.length; i++) {
    const [t1, v1] = FADES[i];
    const [t0, v0] = FADES[i - 1];
    if (t <= t1) return lerp(v0, v1, (t - t0) / Math.max(1e-6, t1 - t0));
  }
  return FADES[FADES.length - 1][1];
}

/** Répliques de la prêtresse (sous-titres + voix). */
export const LINES = [
  { start: 99.7, end: 103.6, text: 'Vous avez cherché la puissance… mais vous avez oublié l’essentiel.', id: 'voice-1' },
  { start: 104.9, end: 107.7, text: 'La sobriété… ne vous sera pas rendue.', id: 'voice-2' },
];

/** Marqueurs d'impacts (synchronisation images ↔ percussions). */
export const HITS = {
  fireballLaunch: 61.55,
  fireballImpact: 62.45,
  parry: 64.15,
  dodge: 64.85,
  spin: 65.6,
  runeSlam: 67.75,
  portal: 68.75,
  roar: 69.55,
  creatureLeap: 70.35,
  berserkCharge: 71.2,
  weaponBreak: 72.3,
  grabMaul: 73.25,
  maulSmash: 74.15,
  arrowRelease: 75.0,
  arrowImpact: 77.3,
  monsterStep1: 78.4,
  monsterStep2: 79.6,
  monsterRoar: 80.6,
  musicStop: 81.8,
  bottleReveal: 91.6,
  grab: 98.0,
  wingsBurst: 99.3,
  bottleRaise: 104.3,
  blackLightning: 107.75,
  titleBoom: 109.25,
  subtitleIn: 112.6,
  silhouette: 113.8,
  bottleGlint: 116.4,
};
