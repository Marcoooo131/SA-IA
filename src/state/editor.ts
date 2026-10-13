import { create } from 'zustand';
import type { OpeningType, RoomType } from '@/domain/types';

export type Tool = 'select' | 'room' | 'wall' | OpeningType | 'device' | 'calibrate' | 'pan' | 'place_opening';

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
  view: { x: -2, y: -2, scale: 45 },
  fitRequest: 0,
  setTool: (tool) => set(tool === 'place_opening' ? { tool } : { tool, placingOpeningId: null }),
  set: (patch) => set(patch),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
}));
