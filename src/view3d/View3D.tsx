import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Box, Camera, Eye, EyeOff, Layers, MousePointerClick, Move3d, RotateCcw, Scissors } from 'lucide-react';
import { useApp, useActiveDossier } from '@/state/store';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '@/domain/labels';
import type { ProductCategory } from '@/domain/types';
import { uid } from '@/lib/id';
import { Scene3DContent, cameraPreset, type LevelLayout, type WallMode } from './Scene3D';
import { cx } from '@/ui/kit';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { setLastViewSnapshot } from './lastView';
import { useEditor } from '@/state/editor';
import { moveFurniture } from '@/furniture/actions';
import { findLevel } from '@/plan/actions';

type Preset = 'iso' | 'dessus' | 'face';

function CameraRig({ preset, levelFilter, nonce, layout }: { preset: Preset; levelFilter: string; nonce: number; layout: LevelLayout }) {
  const dossier = useActiveDossier();
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  useEffect(() => {
    if (!dossier) return;
    const p = cameraPreset(dossier, preset, levelFilter, layout === 'cote' && levelFilter === 'tous' ? 0.8 : 1, layout);
    camera.position.copy(p.position);
    camera.lookAt(p.target);
    if (controls) {
      controls.target.copy(p.target);
      controls.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, levelFilter, nonce, controls, camera, layout]);
  return null;
}

function SnapshotBridge({ onReady }: { onReady: (fn: () => string) => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    onReady(() => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png');
    });
  }, [gl, scene, camera, onReady]);
  return null;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function View3D() {
  const dossier = useActiveDossier();
  const products = useApp((s) => s.catalog.products);
  const rules = useApp((s) => s.rules);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const armed = useApp((s) => s.armedProductId);
  const armProduct = useApp((s) => s.armProduct);
  const mutate = useApp((s) => s.mutate);
  const toast = useApp((s) => s.toast);
  const setActiveLevel = useApp((s) => s.setActiveLevel);
  const show3dFurniture = useEditor((s) => s.show3dFurniture);
  const show3dDevices = useEditor((s) => s.show3dDevices);
  const [preset, setPreset] = useState<Preset>('iso');
  const [nonce, setNonce] = useState(0);
  const [levelFilter, setLevelFilter] = useState<string>('tous');
  const [wallMode, setWallMode] = useState<WallMode>('coupe');
  const [layout, setLayout] = useState<LevelLayout>('cote');
  const [hiddenWalls, setHiddenWalls] = useState<Set<string>>(new Set());
  const [hideOnClick, setHideOnClick] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const snapRef = useRef<(() => string) | null>(null);
  const [glOk] = useState(webglAvailable);

  if (!dossier) return null;
  const levels = [...dossier.plan.levels].sort((a, b) => a.index - b.index);
  const selectedDeviceId = selection?.kind === 'device' ? selection.id : null;
  const selectedFurnitureId = selection?.kind === 'furniture' ? selection.id : null;
  const usedCats = Array.from(new Set(dossier.devices.map((d) => products.find((p) => p.id === d.productId)?.category).filter(Boolean))) as ProductCategory[];

  const onFloorClick = (levelId: string, x: number, y: number) => {
    if (armed) {
      const product = products.find((p) => p.id === armed);
      if (!product) return;
      const level = levels.find((l) => l.id === levelId)!;
      const room = level.rooms.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      const id = uid('dev');
      mutate((d) =>
        d.devices.push({ id, productId: product.id, levelId, x, y, rotation: 0, quantity: 1, origin: 'manuel', validated: true, roomId: room?.id }),
      );
      select({ kind: 'device', id });
      setActiveLevel(levelId);
      toast('success', `${product.name} placé en 3D (visible aussi sur le plan 2D).`);
      return;
    }
    if (moveMode && selectedFurnitureId) {
      // déplacement du meuble sélectionné au point cliqué (même donnée que le plan 2D)
      const level = levels.find((l) => (l.furniture ?? []).some((f) => f.id === selectedFurnitureId));
      if (level && level.id === levelId) mutate((d) => moveFurniture(findLevel(d, levelId), selectedFurnitureId, Math.round(x * 100) / 100, Math.round(y * 100) / 100));
      return;
    }
    if (moveMode && selectedDeviceId) {
      const level = levels.find((l) => l.id === levelId)!;
      const room = level.rooms.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      mutate((d) => {
        const dv = d.devices.find((v) => v.id === selectedDeviceId);
        if (dv) Object.assign(dv, { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, levelId, roomId: room?.id });
      });
      return;
    }
    select(null);
  };

  const toolbarBtn = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string) => (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
        active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-2 py-1.5" role="toolbar" aria-label="Commandes 3D">
        {toolbarBtn(preset === 'iso', () => (setPreset('iso'), setNonce((n) => n + 1)), <Box size={13} />, 'Isométrique')}
        {toolbarBtn(preset === 'dessus', () => (setPreset('dessus'), setNonce((n) => n + 1)), <Layers size={13} />, 'Dessus')}
        {toolbarBtn(preset === 'face', () => (setPreset('face'), setNonce((n) => n + 1)), <Move3d size={13} />, 'Face')}
        <div className="mx-1 h-5 w-px bg-slate-200" />
        <select
          aria-label="Niveau affiché"
          className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs"
          value={levelFilter}
          onChange={(e) => {
            setLevelFilter(e.target.value);
            setNonce((n) => n + 1);
            if (e.target.value !== 'tous') setActiveLevel(e.target.value);
          }}
        >
          <option value="tous">Tous les niveaux</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} seul
            </option>
          ))}
        </select>
        <select
          aria-label="Disposition des niveaux"
          className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs"
          value={layout}
          disabled={levelFilter !== 'tous' || levels.length < 2}
          onChange={(e) => {
            setLayout(e.target.value as LevelLayout);
            setNonce((n) => n + 1);
          }}
        >
          <option value="cote">Niveaux côte à côte</option>
          <option value="empile">Niveaux empilés</option>
        </select>
        <select aria-label="Affichage des murs" className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs" value={wallMode} onChange={(e) => setWallMode(e.target.value as WallMode)}>
          <option value="complet">Murs complets</option>
          <option value="coupe">Murs coupés (vue maquette)</option>
          <option value="masque">Murs masqués</option>
        </select>
        {toolbarBtn(hideOnClick, () => setHideOnClick((v) => !v), <Scissors size={13} />, 'Masquer un mur au clic')}
        {hiddenWalls.size > 0 && toolbarBtn(false, () => setHiddenWalls(new Set()), <RotateCcw size={13} />, `Réafficher ${hiddenWalls.size} mur(s)`)}
        <div className="mx-1 h-5 w-px bg-slate-200" />
        {toolbarBtn(showCoverage, () => setShowCoverage((v) => !v), showCoverage ? <Eye size={13} /> : <EyeOff size={13} />, 'Zones indicatives')}
        {toolbarBtn(showLabels, () => setShowLabels((v) => !v), <Layers size={13} />, 'Noms des pièces')}
        {toolbarBtn(moveMode, () => setMoveMode((v) => !v), <MousePointerClick size={13} />, 'Déplacer l’équipement au clic')}
        <button
          className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          onClick={() => {
            if (!snapRef.current) return;
            setLastViewSnapshot(dossier.id, snapRef.current());
            toast('success', 'Vue 3D actuelle retenue pour le devis PDF.');
          }}
        >
          <Camera size={13} /> Utiliser cette vue pour le devis
        </button>
      </div>
      <div className="relative min-h-0 flex-1 bg-gradient-to-b from-slate-200 to-slate-100" data-testid="view3d">
        <OpeningsLegend />
        {!glOk ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-slate-600">
            WebGL n'est pas disponible dans ce navigateur : la vue 3D ne peut pas être affichée. Le plan 2D et le devis restent utilisables.
          </div>
        ) : (
          <ErrorBoundary
            fallback={(e, reset) => (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-sm text-slate-600">
                <p>La scène 3D n'a pas pu être affichée : {e.message}</p>
                <button className="rounded border bg-white px-3 py-1" onClick={reset}>
                  Réessayer
                </button>
              </div>
            )}
          >
            <Canvas
              shadows
              dpr={[1, 2]}
              gl={{ preserveDrawingBuffer: true, antialias: true }}
              camera={{ fov: 40, near: 0.1, far: 500, position: [20, 18, 20] }}
              onPointerMissed={() => !armed && !moveMode && select(null)}
            >
              <color attach="background" args={['#eef2f6']} />
              <Suspense fallback={null}>
                <Scene3DContent
                  dossier={dossier}
                  products={products}
                  options={{
                    levelFilter,
                    wallMode,
                    hiddenWalls,
                    showCoverage,
                    showLabels,
                    layout,
                    motionAngle: rules.motion.angleDeg,
                    motionRange: rules.motion.rangeM,
                    selectedDeviceId,
                    selectedFurnitureId,
                    showFurniture: show3dFurniture,
                    showDevices: show3dDevices,
                  }}
                  onSelectFurniture={(id) => {
                    const lvl = dossier.plan.levels.find((l) => (l.furniture ?? []).some((f) => f.id === id));
                    if (lvl) setActiveLevel(lvl.id);
                    select({ kind: 'furniture', id });
                    armProduct(null);
                  }}
                  onSelectDevice={(id) => {
                    if (!id) return select(null);
                    select({ kind: 'device', id });
                    const dv = dossier.devices.find((d) => d.id === id);
                    if (dv) setActiveLevel(dv.levelId);
                    armProduct(null);
                  }}
                  onFloorClick={onFloorClick}
                  onWallClick={hideOnClick ? (key) => setHiddenWalls((s) => new Set(s).add(key)) : undefined}
                />
              </Suspense>
              <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI / 2.05} minDistance={3} maxDistance={120} />
              <CameraRig preset={preset} levelFilter={levelFilter} nonce={nonce} layout={layout} />
              <SnapshotBridge onReady={(fn) => (snapRef.current = fn)} />
            </Canvas>
          </ErrorBoundary>
        )}
        {/* Légende */}
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-xs rounded-lg border border-slate-200 bg-white/95 p-2.5 text-[11px] shadow-sm">
          <div className="mb-1 font-semibold text-slate-700">Légende des équipements</div>
          {usedCats.length === 0 && <div className="text-slate-500">Aucun équipement placé.</div>}
          {usedCats.map((c) => (
            <div key={c} className="flex items-center gap-1.5 text-slate-600">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[c] }} />
              {CATEGORY_LABELS[c]}
            </div>
          ))}
          <div className="mt-1.5 border-t border-slate-100 pt-1.5 text-slate-500">
            Translucide : suggestion non validée · <span className="text-amber-600">secteurs orange</span> : zones de détection théoriques, simulation indicative.
          </div>
        </div>
        <div className="pointer-events-none absolute right-3 bottom-3 rounded-md bg-white/90 px-2 py-1 text-[11px] text-slate-500 shadow-sm">
          Clic gauche : rotation · clic droit : déplacement · molette : zoom
          {armed && <span className="ml-1 font-medium text-brand-700">· Cliquez sur un sol pour placer l'équipement</span>}
        </div>
      </div>
    </div>
  );
}

/** Récapitulatif des menuiseries représentées dans la 3D (positionnées / indicatives). */
function OpeningsLegend() {
  const dossier = useActiveDossier();
  if (!dossier) return null;
  const all = dossier.plan.levels.flatMap((l) => l.openings);
  const placed = all.filter((o) => o.host.kind !== 'unplaced').length;
  const pending = all.length - placed;
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-10 rounded border bg-white/90 px-2 py-1 text-[11px] text-slate-700 shadow-sm" data-testid="view3d-openings">
      <span data-testid="view3d-openings-placed">{placed}</span> menuiserie(s) positionnée(s)
      {pending > 0 && (
        <>
          {' · '}
          <span className="text-amber-700">
            <span data-testid="view3d-openings-pending">{pending}</span> à positionner (repères orange translucides, indicatifs)
          </span>
        </>
      )}
    </div>
  );
}
