import { create } from 'zustand';
import type { OpeningType, RoomType } from '@/domain/types';
import type { JoineryModelId } from '@/furniture/joineryModels';

export type Tool = 'select' | 'room' | 'wall' | OpeningType | 'device' | 'calibrate' | 'pan' | 'place_opening' | 'furniture';

/**
 * Modes d'affichage : plan architectural seul, plan meublé, maquette 3D meublée,
 * maquette 3D meublée avec équipements de sécurité, maquette 3D sans mobilier.
 */
export type DisplayMode = 'plan_archi' | 'plan_meuble' | '3d_meuble' | '3d_securite' | '3d_sans_mobilier';

export interface EditorState {
  tool: Tool;
  grid: number;
  snap: boolean;
  align: boolean;
  showCoverage: boolean;
  showLabels: boolean;
  nextRoomType: RoomType;
  showProvenance: boolean;
  highlightImport: boolean;
  /** Ouverture « à positionner » en cours de placement. */
  placingOpeningId: string | null;
  /** Modèle de mobilier armé (outil « furniture »). */
  armedFurnitureId: string | null;
  /** Modèle de menuiserie choisi dans la bibliothèque (préréglages appliqués à la création). */
  openingPreset: JoineryModelId | null;
  /** Murs, pièces et menuiseries verrouillés pendant l'aménagement. */
  lockStructure: boolean;
  /** Plan 2D : mobilier affiché. */
  show2dFurniture: boolean;
  /** Plan 2D : équipements de sécurité affichés. */
  show2dDevices: boolean;
  /** Maquette 3D : mobilier et équipements affichés. */
  show3dFurniture: boolean;
  show3dDevices: boolean;
  /** Vue : origine (m) en haut à gauche et échelle (px par m). */
  view: { x: number; y: number; scale: number };
  fitRequest: number;
  setTool(tool: Tool): void;
  set(patch: Partial<Omit<EditorState, 'set' | 'setTool' | 'requestFit'>>): void;
  requestFit(): void;
}

export const useEditor = create<EditorState>()((set) => ({
  tool: 'select',
  grid: 0.25,
  snap: true,
  align: true,
  showCoverage: true,
  showLabels: true,
  nextRoomType: 'chambre',
  showProvenance: true,
  highlightImport: false,
  placingOpeningId: null,
  armedFurnitureId: null,
  openingPreset: null,
  lockStructure: false,
  show2dFurniture: true,
  show2dDevices: true,
  show3dFurniture: true,
  show3dDevices: true,
  view: { x: -2, y: -2, scale: 45 },
  fitRequest: 0,
  setTool: (tool) =>
    set((s) => ({
      tool,
      placingOpeningId: tool === 'place_opening' ? s.placingOpeningId : null,
      armedFurnitureId: tool === 'furniture' ? s.armedFurnitureId : null,
      // le préréglage de menuiserie est choisi dans la bibliothèque (set) ; tout changement d'outil l'annule
      openingPreset: null,
    })),
  set: (patch) => set(patch),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
}));
