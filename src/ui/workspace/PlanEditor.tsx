import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Level, Point, Room } from '@/domain/types';
import { useApp, useActiveDossier } from '@/state/store';
import { useEditor } from '@/state/editor';
import { PlanDrawing, type PlanTarget } from '@/plan/PlanDrawing';
import { alignRect, levelBounds, snapValue, wallLength } from '@/plan/geometry';
import {
  addOpeningAt,
  addRoom,
  addWall,
  calibrateBackground,
  findLevel,
  moveOpeningTo,
  removeOpening,
  removeRoom,
  removeWall,
  resizeRoom,
} from '@/plan/actions';
import { productForCategory } from '@/catalog/defaultCatalog';
import { uid } from '@/lib/id';
import { formatNumber } from '@/lib/format';
import { OPENING_TYPE_LABELS } from '@/domain/labels';
import { useAssetUrl } from '../useAsset';
import { Button, Modal, NumberInput, Field } from '../kit';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'room-move'; id: string; start: Room; p0: Point; moved: boolean }
  | { kind: 'room-resize'; id: string; start: Room; p0: Point; handle: Exclude<NonNullable<Extract<PlanTarget, { kind: 'room' }>['handle']>, 'move'>; moved: boolean }
  | { kind: 'wall-move'; id: string; a: Point; b: Point; p0: Point; moved: boolean }
  | { kind: 'wall-end'; id: string; end: 'a' | 'b'; moved: boolean }
  | { kind: 'device-move'; id: string; x: number; y: number; p0: Point; moved: boolean }
  | { kind: 'opening-move'; id: string; moved: boolean }
  | { kind: 'bg-move'; x: number; y: number; p0: Point; moved: boolean }
  | { kind: 'room-create'; p0: Point; p1: Point }
  | { kind: 'wall-create'; p0: Point; p1: Point };

const TOOL_HINT: Record<string, string> = {
  select: 'Cliquez pour sélectionner, glissez pour déplacer. Glisser dans le vide : déplacer la vue. Molette : zoom.',
  pan: 'Glissez pour déplacer la vue.',
  room: 'Glissez pour dessiner une pièce rectangulaire (grille magnétique active).',
  wall: 'Glissez pour tracer un mur ou une cloison.',
  porte: 'Cliquez sur un mur pour placer une porte.',
  fenetre: 'Cliquez sur un mur pour placer une fenêtre.',
  baie: 'Cliquez sur un mur pour placer une baie vitrée.',
  porte_garage: 'Cliquez sur un mur pour placer une porte de garage.',
  porte_interieure: 'Cliquez sur une cloison pour placer une porte intérieure.',
  device: "Cliquez sur le plan pour placer l'équipement sélectionné dans la bibliothèque.",
  calibrate: "Cliquez deux points d'une dimension connue sur le plan importé (ex. largeur d'une porte).",
};

export function PlanEditor() {
  const dossier = useActiveDossier();
  const levelId = useApp((s) => s.activeLevelId);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const mutate = useApp((s) => s.mutate);
  const checkpoint = useApp((s) => s.checkpoint);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const products = useApp((s) => s.catalog.products);
  const rules = useApp((s) => s.rules);
  const armedProductId = useApp((s) => s.armedProductId);
  const toast = useApp((s) => s.toast);
  const ed = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [calib, setCalib] = useState<Point[]>([]);
  const [calibDialog, setCalibDialog] = useState<{ p1: Point; p2: Point } | null>(null);
  const [calibValue, setCalibValue] = useState<number | null>(0.9);

  const level: Level | undefined = dossier?.plan.levels.find((l) => l.id === levelId) ?? dossier?.plan.levels[0];
  const devices = useMemo(() => dossier?.devices.filter((d) => d.levelId === level?.id) ?? [], [dossier, level]);
  const bgUrl = useAssetUrl(level?.background?.assetId);
  const { view } = ed;

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  // Taille du conteneur
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!level) return;
    let b = levelBounds(level);
    const bg = level.background;
    if (bg && bg.visible) {
      const bb = { minX: bg.x, minY: bg.y, maxX: bg.x + bg.width, maxY: bg.y + bg.width * bg.aspect };
      b = b ? { minX: Math.min(b.minX, bb.minX), minY: Math.min(b.minY, bb.minY), maxX: Math.max(b.maxX, bb.maxX), maxY: Math.max(b.maxY, bb.maxY) } : bb;
    }
    if (!b) b = { minX: 0, minY: 0, maxX: 12, maxY: 9 };
    const pad = 1.5;
    const w = b.maxX - b.minX + pad * 2;
    const h = b.maxY - b.minY + pad * 2;
    const scale = Math.max(8, Math.min(200, Math.min(size.w / w, size.h / h)));
    useEditor.getState().set({
      view: { scale, x: b.minX - pad - (size.w / scale - w) / 2, y: b.minY - pad - (size.h / scale - h) / 2 },
    });
  }, [level, size.w, size.h]);

  // Recadrage au changement de niveau / à la demande
  const lastFit = useRef<string>('');
  useEffect(() => {
    const key = `${level?.id}-${ed.fitRequest}-${size.w > 0}`;
    if (lastFit.current !== key && size.w > 0) {
      lastFit.current = key;
      fit();
    }
  }, [level?.id, ed.fitRequest, size.w, fit]);

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = svgRef.current!.getBoundingClientRect();
      return { x: view.x + (e.clientX - rect.left) / view.scale, y: view.y + (e.clientY - rect.top) / view.scale };
    },
    [view],
  );
  const snap = useCallback((v: number) => (ed.snap ? snapValue(v, ed.grid) : Math.round(v * 100) / 100), [ed.snap, ed.grid]);
  const snapP = (p: Point) => ({ x: snap(p.x), y: snap(p.y) });

  // Zoom molette autour du curseur
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view: v } = useEditor.getState();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = v.x + mx / v.scale;
      const wy = v.y + my / v.scale;
      const scale = Math.max(8, Math.min(250, v.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      useEditor.getState().set({ view: { scale, x: wx - mx / scale, y: wy - my / scale } });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const deleteSelection = useCallback(() => {
    const sel = useApp.getState().selection;
    if (!sel || !level) return;
    if (sel.kind === 'background') {
      mutate((d) => {
        findLevel(d, level.id).background = null;
      });
    } else if (sel.kind === 'device') mutate((d) => void (d.devices = d.devices.filter((x) => x.id !== sel.id)));
    else
      mutate((d) => {
        const l = findLevel(d, level.id);
        if (sel.kind === 'room') removeRoom(l, sel.id);
        if (sel.kind === 'wall') removeWall(l, sel.id);
        if (sel.kind === 'opening') removeOpening(d, l, sel.id);
      });
    select(null);
  }, [level, mutate, select]);

  // Raccourcis clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (useApp.getState().selection) {
          e.preventDefault();
          deleteSelection();
        }
      } else if (e.key === 'Escape') {
        setDrag(null);
        setCalib([]);
        useEditor.getState().setTool('select');
        useApp.getState().armProduct(null);
      } else if (e.key.startsWith('Arrow')) {
        const sel = useApp.getState().selection;
        if (!sel || !level || sel.kind === 'background') return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : useEditor.getState().grid;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        mutate((d) => {
          const l = findLevel(d, level.id);
          if (sel.kind === 'room') {
            const r = l.rooms.find((x) => x.id === sel.id);
            if (r) Object.assign(r, { x: r.x + dx, y: r.y + dy });
          } else if (sel.kind === 'device') {
            const dv = d.devices.find((x) => x.id === sel.id);
            if (dv) Object.assign(dv, { x: dv.x + dx, y: dv.y + dy });
          } else if (sel.kind === 'wall') {
            const w = l.walls.find((x) => x.id === sel.id);
            if (w) Object.assign(w, { a: { x: w.a.x + dx, y: w.a.y + dy }, b: { x: w.b.x + dx, y: w.b.y + dy } });
          }
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, deleteSelection, level, mutate]);

  if (!dossier || !level) return null;

  const placeDevice = (p: Point) => {
    const product = products.find((x) => x.id === armedProductId);
    if (!product) {
      toast('info', "Sélectionnez d'abord un équipement dans la bibliothèque.");
      return;
    }
    const room = level.rooms.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    const id = uid('dev');
    mutate((d) =>
      d.devices.push({
        id,
        productId: product.id,
        levelId: level.id,
        x: p.x,
        y: p.y,
        rotation: 0,
        quantity: 1,
        origin: 'manuel',
        validated: true,
        roomId: room?.id,
      }),
    );
    select({ kind: 'device', id });
  };

  const onTargetDown = (t: PlanTarget, e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const tool = ed.tool;
    // Les outils de création agissent sur le plan, pas sur l'objet
    if (tool !== 'select') return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toWorld(e);
    if (t.kind === 'room') {
      const room = level.rooms.find((r) => r.id === t.id)!;
      select({ kind: 'room', id: t.id });
      if (t.handle && t.handle !== 'move') setDrag({ kind: 'room-resize', id: t.id, start: { ...room }, p0: p, handle: t.handle, moved: false });
      else setDrag({ kind: 'room-move', id: t.id, start: { ...room }, p0: p, moved: false });
    } else if (t.kind === 'wall') {
      const w = level.walls.find((x) => x.id === t.id)!;
      select({ kind: 'wall', id: t.id });
      if (t.handle === 'a' || t.handle === 'b') setDrag({ kind: 'wall-end', id: t.id, end: t.handle, moved: false });
      else setDrag({ kind: 'wall-move', id: t.id, a: { ...w.a }, b: { ...w.b }, p0: p, moved: false });
    } else if (t.kind === 'device') {
      const dv = dossier.devices.find((x) => x.id === t.id)!;
      select({ kind: 'device', id: t.id });
      setDrag({ kind: 'device-move', id: t.id, x: dv.x, y: dv.y, p0: p, moved: false });
    } else if (t.kind === 'opening') {
      select({ kind: 'opening', id: t.id });
      setDrag({ kind: 'opening-move', id: t.id, moved: false });
    } else if (t.kind === 'background') {
      const bg = level.background!;
      select({ kind: 'background' });
      setDrag({ kind: 'bg-move', x: bg.x, y: bg.y, p0: p, moved: false });
    }
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && (ed.tool === 'pan' || ed.tool === 'select'))) {
      if (ed.tool === 'select' && e.button === 0) select(null);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
      return;
    }
    if (e.button !== 0) return;
    const raw = toWorld(e);
    const p = snapP(raw);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    switch (ed.tool) {
      case 'room':
        setDrag({ kind: 'room-create', p0: p, p1: p });
        break;
      case 'wall':
        setDrag({ kind: 'wall-create', p0: p, p1: p });
        break;
      case 'device':
        placeDevice(raw);
        break;
      case 'calibrate': {
        if (!level.background) {
          toast('error', "Importez d'abord un plan ou une photo sur ce niveau.");
          return;
        }
        const pts = [...calib, raw];
        if (pts.length === 2) {
          setCalib([]);
          setCalibDialog({ p1: pts[0], p2: pts[1] });
        } else setCalib(pts);
        break;
      }
      case 'porte':
      case 'fenetre':
      case 'baie':
      case 'porte_garage':
      case 'porte_interieure': {
        let createdId: string | null = null;
        const tool = ed.tool;
        const probe = structuredClone({ plan: dossier.plan, devices: dossier.devices });
        const ok = addOpeningAt(probe.plan, findLevel(probe, level.id), tool, raw, 12 / view.scale + 0.25);
        if (!ok) {
          toast('info', `Cliquez plus près d'un mur pour placer : ${OPENING_TYPE_LABELS[tool].toLowerCase()}.`);
          return;
        }
        mutate((d) => {
          const o = addOpeningAt(d.plan, findLevel(d, level.id), tool, raw, 12 / view.scale + 0.25);
          createdId = o?.id ?? null;
        });
        if (createdId) select({ kind: 'opening', id: createdId });
        break;
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const raw = toWorld(e);
    setCursor(raw);
    const dr = dragRef.current;
    if (!dr) return;
    if (dr.kind === 'pan') {
      useEditor.getState().set({ view: { ...view, x: dr.vx - (e.clientX - dr.sx) / view.scale, y: dr.vy - (e.clientY - dr.sy) / view.scale } });
      return;
    }
    if (dr.kind === 'room-create' || dr.kind === 'wall-create') {
      let p1 = snapP(raw);
      if (dr.kind === 'wall-create' && e.shiftKey) {
        // contrainte horizontale / verticale
        if (Math.abs(p1.x - dr.p0.x) > Math.abs(p1.y - dr.p0.y)) p1 = { x: p1.x, y: dr.p0.y };
        else p1 = { x: dr.p0.x, y: p1.y };
      }
      setDrag({ ...dr, p1 });
      return;
    }
    const moved = 'moved' in dr && !dr.moved;
    if (moved) checkpoint();
    const markMoved = () => {
      if ('moved' in dr && !dr.moved) {
        const next = { ...dr, moved: true } as Drag;
        dragRef.current = next;
        setDrag(next);
      }
    };
    switch (dr.kind) {
      case 'room-move': {
        const dx = raw.x - dr.p0.x;
        const dy = raw.y - dr.p0.y;
        let rect = { x: snap(dr.start.x + dx), y: snap(dr.start.y + dy), w: dr.start.w, h: dr.start.h };
        let g = { x: [] as number[], y: [] as number[] };
        if (ed.align) {
          const res = alignRect(rect, level.rooms.filter((r) => r.id !== dr.id), 8 / view.scale + 0.05);
          rect = res.rect;
          g = { x: res.guidesX, y: res.guidesY };
        }
        setGuides(g);
        mutate((d) => {
          const r = findLevel(d, level.id).rooms.find((x) => x.id === dr.id);
          if (r) Object.assign(r, { x: rect.x, y: rect.y });
        }, { history: false });
        markMoved();
        break;
      }
      case 'room-resize': {
        mutate((d) => {
          const r = findLevel(d, level.id).rooms.find((x) => x.id === dr.id);
          if (r) resizeRoom(r, dr.start, dr.handle, raw.x - dr.p0.x, raw.y - dr.p0.y, snap);
        }, { history: false });
        markMoved();
        break;
      }
      case 'wall-move': {
        const dx = snap(raw.x - dr.p0.x);
        const dy = snap(raw.y - dr.p0.y);
        mutate((d) => {
          const w = findLevel(d, level.id).walls.find((x) => x.id === dr.id);
          if (w) Object.assign(w, { a: { x: dr.a.x + dx, y: dr.a.y + dy }, b: { x: dr.b.x + dx, y: dr.b.y + dy } });
        }, { history: false });
        markMoved();
        break;
      }
      case 'wall-end': {
        const p = snapP(raw);
        mutate((d) => {
          const w = findLevel(d, level.id).walls.find((x) => x.id === dr.id);
          if (w) w[dr.end] = p;
        }, { history: false });
        markMoved();
        break;
      }
      case 'device-move': {
        const nx = ed.snap ? snapValue(dr.x + raw.x - dr.p0.x, 0.05) : dr.x + raw.x - dr.p0.x;
        const ny = ed.snap ? snapValue(dr.y + raw.y - dr.p0.y, 0.05) : dr.y + raw.y - dr.p0.y;
        mutate((d) => {
          const dv = d.devices.find((x) => x.id === dr.id);
          if (dv) {
            dv.x = nx;
            dv.y = ny;
            const room = findLevel(d, level.id).rooms.find((r) => nx >= r.x && nx <= r.x + r.w && ny >= r.y && ny <= r.y + r.h);
            dv.roomId = room?.id;
          }
        }, { history: false });
        markMoved();
        break;
      }
      case 'opening-move': {
        mutate((d) => {
          const l = findLevel(d, level.id);
          const o = l.openings.find((x) => x.id === dr.id);
          if (o) moveOpeningTo(l, o, raw);
        }, { history: false });
        markMoved();
        break;
      }
      case 'bg-move': {
        mutate((d) => {
          const bg = findLevel(d, level.id).background;
          if (bg && !bg.locked) Object.assign(bg, { x: dr.x + raw.x - dr.p0.x, y: dr.y + raw.y - dr.p0.y });
        }, { history: false });
        markMoved();
        break;
      }
    }
  };

  const onPointerUp = () => {
    const dr = dragRef.current;
    setDrag(null);
    dragRef.current = null;
    setGuides({ x: [], y: [] });
    if (!dr) return;
    if (dr.kind === 'room-create') {
      const x = Math.min(dr.p0.x, dr.p1.x);
      const y = Math.min(dr.p0.y, dr.p1.y);
      const w = Math.abs(dr.p1.x - dr.p0.x);
      const h = Math.abs(dr.p1.y - dr.p0.y);
      if (w < 0.5 || h < 0.5) {
        if (w > 0 || h > 0) toast('info', 'Pièce trop petite (minimum 0,5 m) : tracé ignoré.');
        return;
      }
      let id = '';
      mutate((d) => {
        id = addRoom(findLevel(d, level.id), { x, y, w, h }, ed.nextRoomType).id;
      });
      select({ kind: 'room', id });
    } else if (dr.kind === 'wall-create') {
      const len = Math.hypot(dr.p1.x - dr.p0.x, dr.p1.y - dr.p0.y);
      if (len < 0.3) return;
      let id = '';
      mutate((d) => {
        id = addWall(findLevel(d, level.id), dr.p0, dr.p1).id;
      });
      select({ kind: 'wall', id });
    }
  };

  // Grille
  const gridLines = () => {
    const out: React.ReactNode[] = [];
    const x0 = view.x;
    const y0 = view.y;
    const x1 = view.x + size.w / view.scale;
    const y1 = view.y + size.h / view.scale;
    const minor = ed.grid * view.scale >= 9 ? ed.grid : 1;
    const lw = 1 / view.scale;
    for (let x = Math.floor(x0 / minor) * minor; x <= x1; x += minor) {
      const major = Math.abs(x - Math.round(x)) < 1e-6;
      out.push(<line key={`gx${x.toFixed(3)}`} x1={x} y1={y0} x2={x} y2={y1} stroke={major ? '#cbd5e1' : '#e2e8f0'} strokeWidth={lw} />);
    }
    for (let y = Math.floor(y0 / minor) * minor; y <= y1; y += minor) {
      const major = Math.abs(y - Math.round(y)) < 1e-6;
      out.push(<line key={`gy${y.toFixed(3)}`} x1={x0} y1={y} x2={x1} y2={y} stroke={major ? '#cbd5e1' : '#e2e8f0'} strokeWidth={lw} />);
    }
    return out;
  };

  const scaleBar = (() => {
    const candidates = [0.5, 1, 2, 5, 10, 20];
    const m = candidates.find((c) => c * view.scale >= 70) ?? 20;
    return { m, px: m * view.scale };
  })();

  const preview = drag && (drag.kind === 'room-create' || drag.kind === 'wall-create') ? drag : null;
  const toolCursor = ed.tool === 'select' ? 'default' : ed.tool === 'pan' ? 'grab' : 'crosshair';
  const hint = ed.tool === 'device' && armedProductId ? `Placer : ${products.find((p) => p.id === armedProductId)?.name}. ${TOOL_HINT.device}` : TOOL_HINT[ed.tool];

  return (
    <div className="relative h-full w-full overflow-hidden bg-white" ref={containerRef} data-testid="plan-editor">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="no-select block touch-none"
        style={{ cursor: drag?.kind === 'pan' ? 'grabbing' : toolCursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        data-testid="plan-svg"
      >
        <g transform={`scale(${view.scale}) translate(${-view.x} ${-view.y})`}>
          <g style={{ pointerEvents: 'none' }}>{gridLines()}</g>
          <PlanDrawing
            level={level}
            devices={devices}
            products={products}
            backgroundUrl={bgUrl}
            selected={selection as PlanTarget | null}
            pxPerMeter={view.scale}
            interactive
            showCoverage={ed.showCoverage}
            showLabels={ed.showLabels}
            motionAngle={rules.motion.angleDeg}
            motionRange={rules.motion.rangeM}
            onTargetDown={onTargetDown}
          />
          {/* Guides d'alignement */}
          {guides.x.map((x) => (
            <line key={`g${x}`} x1={x} y1={view.y} x2={x} y2={view.y + size.h / view.scale} stroke="#ec4899" strokeWidth={1 / view.scale} strokeDasharray={`${4 / view.scale}`} />
          ))}
          {guides.y.map((y) => (
            <line key={`h${y}`} x1={view.x} y1={y} x2={view.x + size.w / view.scale} y2={y} stroke="#ec4899" strokeWidth={1 / view.scale} strokeDasharray={`${4 / view.scale}`} />
          ))}
          {/* Aperçu de création */}
          {preview?.kind === 'room-create' && (
            <g>
              <rect
                x={Math.min(preview.p0.x, preview.p1.x)}
                y={Math.min(preview.p0.y, preview.p1.y)}
                width={Math.abs(preview.p1.x - preview.p0.x)}
                height={Math.abs(preview.p1.y - preview.p0.y)}
                fill="#bfdbfe"
                fillOpacity={0.5}
                stroke="#2563eb"
                strokeWidth={2 / view.scale}
              />
              <text
                x={(preview.p0.x + preview.p1.x) / 2}
                y={(preview.p0.y + preview.p1.y) / 2}
                fontSize={13 / view.scale}
                textAnchor="middle"
                fill="#1e3a8a"
                fontWeight={600}
              >
                {formatNumber(Math.abs(preview.p1.x - preview.p0.x))} × {formatNumber(Math.abs(preview.p1.y - preview.p0.y))} m
              </text>
            </g>
          )}
          {preview?.kind === 'wall-create' && (
            <g>
              <line x1={preview.p0.x} y1={preview.p0.y} x2={preview.p1.x} y2={preview.p1.y} stroke="#2563eb" strokeWidth={0.1} strokeLinecap="square" />
              <text x={(preview.p0.x + preview.p1.x) / 2} y={(preview.p0.y + preview.p1.y) / 2 - 0.25} fontSize={13 / view.scale} textAnchor="middle" fill="#1e3a8a" fontWeight={600}>
                {formatNumber(wallLength({ id: '', a: preview.p0, b: preview.p1, thickness: 0 }))} m
              </text>
            </g>
          )}
          {calib.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={5 / view.scale} fill="#ec4899" />
          ))}
          {calib.length === 1 && cursor && (
            <line x1={calib[0].x} y1={calib[0].y} x2={cursor.x} y2={cursor.y} stroke="#ec4899" strokeWidth={2 / view.scale} strokeDasharray={`${5 / view.scale}`} />
          )}
        </g>
      </svg>

      {/* Échelle graphique */}
      <div className="pointer-events-none absolute bottom-9 left-3 flex items-end gap-2 text-[11px] text-slate-600">
        <div className="h-2 border-x-2 border-b-2 border-slate-700" style={{ width: scaleBar.px }} />
        <span>{scaleBar.m} m</span>
      </div>
      {/* Barre d'état */}
      <div className="absolute inset-x-0 bottom-0 flex h-7 items-center gap-4 border-t border-slate-200 bg-white/95 px-3 text-[11px] text-slate-500">
        <span className="truncate">{hint}</span>
        <span className="ml-auto tabular-nums">
          {cursor ? `x ${formatNumber(cursor.x)} m · y ${formatNumber(cursor.y)} m` : ''}
        </span>
        <span className="tabular-nums">Zoom {Math.round((view.scale / 45) * 100)} %</span>
        <span>Grille {formatNumber(ed.grid)} m {ed.snap ? '(magnétique)' : ''}</span>
      </div>
      {level.rooms.length === 0 && !level.background && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg border border-dashed border-slate-300 bg-white/90 px-6 py-4 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-700">Niveau vide</p>
            <p>Choisissez l'outil « Pièce » et glissez sur la grille, ou importez un plan / une photo comme fond de référence.</p>
          </div>
        </div>
      )}

      {calibDialog && (
        <Modal
          title="Définir l'échelle à partir d'une dimension connue"
          onClose={() => setCalibDialog(null)}
          footer={
            <>
              <Button onClick={() => setCalibDialog(null)}>Annuler</Button>
              <Button
                variant="primary"
                onClick={() => {
                  try {
                    let factor = 1;
                    mutate((d) => {
                      factor = calibrateBackground(findLevel(d, level.id), calibDialog.p1, calibDialog.p2, calibValue ?? 0);
                    });
                    toast('success', `Échelle appliquée (facteur ${formatNumber(factor, 3)}). Tracez maintenant les pièces par-dessus le plan.`);
                    useEditor.getState().setTool('room');
                    useEditor.getState().requestFit();
                  } catch (err) {
                    toast('error', (err as Error).message);
                  }
                  setCalibDialog(null);
                }}
              >
                Appliquer l'échelle
              </Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-slate-600">
            Distance mesurée sur l'image : <strong>{formatNumber(Math.hypot(calibDialog.p2.x - calibDialog.p1.x, calibDialog.p2.y - calibDialog.p1.y))} m</strong> (échelle
            actuelle). Indiquez la dimension réelle correspondante.
          </p>
          <Field label="Dimension réelle" hint="Exemple : largeur d'une porte d'entrée (0,90 m) ou cote écrite sur le plan.">
            <NumberInput value={calibValue} onChange={setCalibValue} min={0.05} max={200} step={0.05} suffix="m" autoFocus name="calibration" />
          </Field>
        </Modal>
      )}
    </div>
  );
}

export function useProductForCategory() {
  const products = useApp((s) => s.catalog.products);
  return (cat: Parameters<typeof productForCategory>[1]) => productForCategory(products, cat);
}
