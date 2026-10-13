import type { Opening } from '@/domain/types';
import { joineryModelOf, openingLeaves } from './joineryModels';

/**
 * Menuiserie 3D intégrée dans l'épaisseur du mur : cadre, vitrage, ouvrant simplifiés.
 * Repère local : x le long du mur (centré), y vers le haut depuis le bas de l'ouverture,
 * z selon l'épaisseur du mur.
 */
export function Joinery3D({ opening, w, h, thickness }: { opening: Opening; w: number; h: number; thickness: number }) {
  const model = joineryModelOf(opening);
  if (model === 'passage' || h < 0.05) return null;
  const f = 0.06; // section du cadre
  const depth = Math.min(0.09, thickness * 0.8);
  const frameColor = opening.exterior ? '#f8fafc' : '#e7e1d6';
  const parts: React.ReactNode[] = [];
  const box = (key: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, opacity = 1) =>
    parts.push(
      <mesh key={key} position={[x, y, z]} castShadow={opacity >= 1}>
        <boxGeometry args={[Math.max(0.005, sx), Math.max(0.005, sy), Math.max(0.005, sz)]} />
        <meshStandardMaterial color={color} roughness={opacity < 1 ? 0.1 : 0.6} metalness={opacity < 1 ? 0.1 : 0} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
      </mesh>,
    );
  const frame = (withBottom: boolean) => {
    box('fl', -w / 2 + f / 2, h / 2, 0, f, h, depth, frameColor);
    box('fr', w / 2 - f / 2, h / 2, 0, f, h, depth, frameColor);
    box('ft', 0, h - f / 2, 0, w, f, depth, frameColor);
    if (withBottom) box('fb', 0, f / 2, 0, w, f, depth, frameColor);
  };
  const glassPane = (key: string, x: number, pw: number, z = 0, y0 = f, y1 = h - f) => box(key, x, (y0 + y1) / 2, z, pw, y1 - y0, 0.02, '#a5d8f0', 0.4);
  const handle = (x: number) => box('poignee', x, Math.min(1.0, h * 0.5), depth / 2 + 0.02, 0.03, 0.12, 0.03, '#9ca3af');
  const latch = opening.hinge === 'droite' ? -1 : 1; // côté de la poignée

  switch (model) {
    case 'fenetre_simple':
    case 'fenetre_double': {
      frame(true);
      if (model === 'fenetre_double') {
        box('meneau', 0, h / 2, 0, 0.05, h - 2 * f, depth * 0.9, frameColor);
        glassPane('v1', -(w - 2 * f) / 4 - 0.012, (w - 2 * f) / 2 - 0.025);
        glassPane('v2', (w - 2 * f) / 4 + 0.012, (w - 2 * f) / 2 - 0.025);
      } else glassPane('v', 0, w - 2 * f);
      // appui de fenêtre
      box('appui', 0, -0.02, 0, w + 0.08, 0.04, thickness + 0.06, '#d6d3d1');
      break;
    }
    case 'porte_fenetre': {
      frame(false);
      if (openingLeaves(opening) === 2) {
        box('meneau', 0, h / 2, 0, 0.06, h - f, depth * 0.9, frameColor);
        glassPane('v1', -(w - 2 * f) / 4 - 0.015, (w - 2 * f) / 2 - 0.03, 0, 0.1);
        glassPane('v2', (w - 2 * f) / 4 + 0.015, (w - 2 * f) / 2 - 0.03, 0, 0.1);
      } else glassPane('v', 0, w - 2 * f, 0, 0.1);
      box('soubassement', 0, 0.05, 0, w - 2 * f, 0.1, depth * 0.7, frameColor);
      break;
    }
    case 'baie': {
      frame(true);
      const pw = (w - 2 * f) / 2 + 0.05;
      glassPane('v1', -(w - 2 * f) / 4 + 0.025, pw, -0.02);
      glassPane('v2', (w - 2 * f) / 4 - 0.025, pw, 0.02);
      box('m1', 0.025, h / 2, -0.02, 0.05, h - 2 * f, 0.04, frameColor);
      box('m2', -0.025, h / 2, 0.02, 0.05, h - 2 * f, 0.04, frameColor);
      break;
    }
    case 'porte_garage': {
      box('panneau', 0, h / 2, 0, w, h, 0.05, '#aab4bf');
      for (let i = 1; i < 5; i++) box(`rainure${i}`, 0, (h * i) / 5, 0.03, w * 0.98, 0.02, 0.01, '#8a96a3');
      break;
    }
    case 'autre': {
      frame(true);
      box('panneau', 0, h / 2, 0, w - 2 * f, h - 2 * f, 0.03, '#d6d3d1', 0.7);
      break;
    }
    default: {
      // portes (intérieure, extérieure, entrée)
      frame(false);
      const color = model === 'porte_entree' ? '#5b3a29' : model === 'porte_exterieure' ? '#7c5a3c' : '#efe9df';
      box('ouvrant', 0, (h - f) / 2, 0, w - 2 * f, h - f, 0.045, color);
      if (model === 'porte_entree') {
        box('imposte', 0, h * 0.7, 0.025, (w - 2 * f) * 0.3, h * 0.35, 0.01, '#a5d8f0', 0.6);
        box('seuil', 0, 0.01, 0, w, 0.02, thickness + 0.04, '#78716c');
      }
      handle(latch * (w / 2 - f - 0.08));
    }
  }
  return <group>{parts}</group>;
}
