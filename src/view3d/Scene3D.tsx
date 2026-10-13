import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { Dossier, Level, OpeningType, PlacedDevice, Product, ProductCategory, Room } from '@/domain/types';
import { CATEGORY_COLORS, ROOM_COLORS } from '@/domain/labels';
import { adjacentRooms, buildWallSegments, levelBounds, type WallSegment } from '@/plan/geometry';
import { joineryVertical } from '@/furniture/joineryModels';
import { Joinery3D } from '@/furniture/Joinery3D';
import { FurnitureMesh } from '@/furniture/Furniture3D';

/**
 * Scène 3D générée à partir de la géométrie corrigée du plan (pièces, murs, ouvertures)
 * — jamais à partir de l'image importée.
 * Repère : x(plan) -> X, y(plan) -> Z, hauteur -> Y.
 */

export type WallMode = 'complet' | 'coupe' | 'masque';

export interface Scene3DOptions {
  levelFilter: 'tous' | string;
  wallMode: WallMode;
  hiddenWalls: Set<string>;
  showCoverage: boolean;
  showLabels: boolean;
  layout?: LevelLayout;
  motionAngle: number;
  motionRange: number;
  selectedDeviceId?: string | null;
  /** Mobilier générique visible (par défaut : oui). */
  showFurniture?: boolean;
  /** Équipements de sécurité visibles (par défaut : oui). */
  showDevices?: boolean;
  selectedFurnitureId?: string | null;
}

export interface Scene3DProps {
  dossier: Dossier;
  products: Product[];
  options: Scene3DOptions;
  onSelectDevice?: (id: string | null) => void;
  onFloorClick?: (levelId: string, x: number, y: number) => void;
  onWallClick?: (key: string) => void;
  onSelectFurniture?: (id: string) => void;
}

const SLAB = 0.2;

export function levelElevations(levels: Level[]): Map<string, number> {
  const sorted = [...levels].sort((a, b) => a.index - b.index);
  const map = new Map<string, number>();
  let z = 0;
  for (const l of sorted) {
    map.set(l.id, z);
    z += l.height + SLAB;
  }
  return map;
}

export function deviceHeight(category: ProductCategory, levelHeight: number, opening?: OpeningType): number {
  switch (category) {
    case 'detecteur_mouvement':
      return Math.min(2.2, levelHeight - 0.25);
    case 'detecteur_fumee':
      return levelHeight - 0.06;
    case 'clavier':
      return 1.45;
    case 'centrale':
      return 1.3;
    case 'detecteur_choc':
      return opening === 'fenetre' ? 2.0 : opening === 'baie' ? 2.05 : 1.95;
    case 'sirene_interieure':
      return levelHeight - 0.3;
    case 'sirene_exterieure':
      return levelHeight - 0.2;
    case 'boitier_save':
      return 1.0;
    default:
      return 1.2;
  }
}


const wallMaterialCache = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  let m = wallMaterialCache.get(key);
  if (!m) {
    m = make();
    wallMaterialCache.set(key, m);
  }
  return m;
}

function WallBox({ a, b, y0, y1, thickness, color, onClick }: { a: { x: number; y: number }; b: { x: number; y: number }; y0: number; y1: number; thickness: number; color: string; onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 0.01 || y1 - y0 < 0.01) return null;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  return (
    <mesh
      position={[(a.x + b.x) / 2, (y0 + y1) / 2, (a.y + b.y) / 2]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
      onClick={onClick}
      material={mat(`wall-${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }))}
    >
      <boxGeometry args={[len + thickness * 0.98, y1 - y0, thickness]} />
    </mesh>
  );
}

function Wall({ seg, height, mode, onClick }: { seg: WallSegment; height: number; mode: WallMode; onClick?: () => void }) {
  if (mode === 'masque') return null;
  const top = mode === 'coupe' ? Math.min(1.1, height) : height;
  const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
  const ux = (seg.b.x - seg.a.x) / len;
  const uy = (seg.b.y - seg.a.y) / len;
  const at = (t: number) => ({ x: seg.a.x + ux * t, y: seg.a.y + uy * t });
  const color = seg.exterior ? '#e7e1d6' : '#f6f4ef';
  const pieces: React.ReactNode[] = [];
  const handle = onClick
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick();
      }
    : undefined;
  let cur = 0;
  seg.cuts.forEach((c, i) => {
    if (c.t0 > cur) pieces.push(<WallBox key={`s${i}`} a={at(cur)} b={at(c.t0)} y0={0} y1={top} thickness={seg.thickness} color={color} onClick={handle} />);
    const v = joineryVertical(c.opening, height);
    if (v.bottom > 0.01) pieces.push(<WallBox key={`b${i}`} a={at(c.t0)} b={at(c.t1)} y0={0} y1={Math.min(v.bottom, top)} thickness={seg.thickness} color={color} onClick={handle} />);
    if (top > v.top) pieces.push(<WallBox key={`t${i}`} a={at(c.t0)} b={at(c.t1)} y0={v.top} y1={top} thickness={seg.thickness} color={color} onClick={handle} />);
    // Menuiserie
    const mid = at((c.t0 + c.t1) / 2);
    const w = c.t1 - c.t0;
    const angle = Math.atan2(uy, ux);
    const yTop = Math.min(v.top, mode === 'coupe' ? Math.max(top, v.bottom + 0.3) : v.top);
    const h = yTop - v.bottom;
    if (h > 0.05 && c.opening.type !== 'passage') {
      pieces.push(
        <group key={`o${i}`} position={[mid.x, v.bottom, mid.y]} rotation={[0, -angle, 0]}>
          <Joinery3D opening={c.opening} w={w} h={h} thickness={seg.thickness} />
        </group>,
      );
      if (c.opening.exterior) {
        // liseré discret de repérage des ouvertures extérieures concernées par l'audit
        pieces.push(
          <mesh key={`f${i}`} position={[mid.x, v.bottom + h + 0.02, mid.y]} rotation={[0, -angle, 0]}>
            <boxGeometry args={[w, 0.025, seg.thickness + 0.02]} />
            <meshStandardMaterial color="#d7001e" />
          </mesh>,
        );
      }
    }
    cur = c.t1;
  });
  if (cur < len) pieces.push(<WallBox key="end" a={at(cur)} b={at(len)} y0={0} y1={top} thickness={seg.thickness} color={color} onClick={handle} />);
  return <group>{pieces}</group>;
}

/** Libellé texte sur texture (compatible avec la capture d'image pour le PDF). */
function Label({ text, sub, position, scale = 1 }: { text: string; sub?: string; position: [number, number, number]; scale?: number }) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const fs = 44;
    ctx.font = `600 ${fs}px Inter, Helvetica, Arial, sans-serif`;
    const w1 = ctx.measureText(text).width;
    ctx.font = `400 ${fs * 0.72}px Inter, Helvetica, Arial, sans-serif`;
    const w2 = sub ? ctx.measureText(sub).width : 0;
    const w = Math.ceil(Math.max(w1, w2) + 36);
    const h = sub ? 110 : 70;
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    const r = 16;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${fs}px Inter, Helvetica, Arial, sans-serif`;
    ctx.fillText(text, w / 2, sub ? 38 : h / 2);
    if (sub) {
      ctx.fillStyle = '#475569';
      ctx.font = `400 ${fs * 0.72}px Inter, Helvetica, Arial, sans-serif`;
      ctx.fillText(sub, w / 2, 82);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { texture: tex, aspect: w / h };
  }, [text, sub]);
  useEffect(() => () => texture.dispose(), [texture]);
  const h = (sub ? 0.62 : 0.4) * scale;
  return (
    <sprite position={position} scale={[h * aspect, h, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

function DeviceMesh({ device, product, level, elevation, selected, onSelect, opening }: { device: PlacedDevice; product?: Product; level: Level; elevation: number; selected: boolean; onSelect?: (id: string) => void; opening?: OpeningType }) {
  const cat = product?.category ?? 'autre';
  const color = CATEGORY_COLORS[cat];
  const suggested = device.origin === 'suggere' && !device.validated;
  const y = elevation + deviceHeight(cat, level.height, opening);
  const rot = -(device.rotation * Math.PI) / 180;
  const S = 1.6; // légèrement agrandi pour la lisibilité
  let geom: React.ReactNode;
  switch (cat) {
    case 'detecteur_fumee':
    case 'sirene_interieure':
    case 'sirene_exterieure':
      geom = <cylinderGeometry args={[0.1 * S, 0.12 * S, 0.07 * S, 24]} />;
      break;
    case 'centrale':
      geom = <boxGeometry args={[0.36 * S, 0.26 * S, 0.1 * S]} />;
      break;
    case 'clavier':
      geom = <boxGeometry args={[0.16 * S, 0.22 * S, 0.04 * S]} />;
      break;
    case 'detecteur_mouvement':
      geom = <sphereGeometry args={[0.09 * S, 20, 14]} />;
      break;
    default:
      geom = <boxGeometry args={[0.14 * S, 0.08 * S, 0.08 * S]} />;
  }
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(device.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <mesh position={[device.x, y, device.y]} rotation={[0, rot, 0]} castShadow userData={{ deviceId: device.id }}>
        {geom}
        <meshStandardMaterial color={color} transparent={suggested} opacity={suggested ? 0.6 : 1} emissive={selected ? '#d7001e' : '#000000'} emissiveIntensity={selected ? 0.6 : 0} />
      </mesh>
      {/* repère au sol : position lisible depuis toutes les vues */}
      <mesh position={[device.x, elevation + 0.09, device.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.16, selected ? 0.3 : 0.24, 32]} />
        <meshBasicMaterial color={selected ? '#d7001e' : color} transparent opacity={suggested ? 0.45 : 0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[device.x, (elevation + 0.09 + y) / 2, device.y]}>
        <cylinderGeometry args={[0.012, 0.012, Math.max(0.01, y - elevation - 0.09), 6]} />
        <meshBasicMaterial color={color} transparent opacity={suggested ? 0.35 : 0.6} />
      </mesh>
    </group>
  );
}

function CoverageSector({ device, level, elevation, offsetX = 0, angle, range }: { device: PlacedDevice; level: Level; elevation: number; offsetX?: number; angle: number; range: number }) {
  const material = useMemo(() => {
    const room = level.rooms.find((r) => r.id === device.roomId) ?? level.rooms.find((r) => device.x >= r.x && device.x <= r.x + r.w && device.y >= r.y && device.y <= r.y + r.h);
    const rooms = room ? [room, ...(room.openPlan ? adjacentRooms(level, room).filter((r) => r.openPlan) : [])] : [];
    // plans de découpe exprimés en coordonnées monde (décalage du niveau inclus)
    const minX = rooms.length ? Math.min(...rooms.map((r) => r.x)) + offsetX : -1e4;
    const maxX = rooms.length ? Math.max(...rooms.map((r) => r.x + r.w)) + offsetX : 1e4;
    const minZ = rooms.length ? Math.min(...rooms.map((r) => r.y)) : -1e4;
    const maxZ = rooms.length ? Math.max(...rooms.map((r) => r.y + r.h)) : 1e4;
    return new THREE.MeshBasicMaterial({
      color: '#f97316',
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
      clippingPlanes: [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -minX),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), maxX),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), -minZ),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), maxZ),
      ],
    });
  }, [device, level, offsetX]);
  useEffect(() => () => material.dispose(), [material]);
  const thetaLen = (angle * Math.PI) / 180;
  // CircleGeometry dans le plan XY, couché au sol (rotation -90° autour de X : y -> -z)
  const start = (device.rotation * Math.PI) / 180;
  return (
    <mesh position={[device.x, elevation + 0.1, device.y]} rotation={[Math.PI / 2, 0, 0]} material={material} renderOrder={2}>
      <circleGeometry args={[range, 48, start - thetaLen / 2, thetaLen]} />
    </mesh>
  );
}

/** Escalier droit : marches calculées depuis le rectangle de la pièce « escalier ». */
function StairSteps({ room, rise }: { room: Room; rise: number }) {
  const along = room.h >= room.w ? 'y' : 'x';
  const length = along === 'y' ? room.h : room.w;
  const n = Math.max(8, Math.round(rise / 0.18));
  const run = length / n;
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const h = (rise * (i + 1)) / n;
        const t = run * i + run / 2;
        const pos: [number, number, number] =
          along === 'y' ? [room.x + room.w / 2, h / 2, room.y + room.h - t] : [room.x + t, h / 2, room.y + room.h / 2];
        const size: [number, number, number] = along === 'y' ? [room.w - 0.1, h, run] : [run, h, room.h - 0.1];
        return (
          <mesh key={i} position={pos} castShadow receiveShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial color={i % 2 ? '#c8b89a' : '#d6c7aa'} roughness={0.8} />
          </mesh>
        );
      })}
    </group>
  );
}

export type LevelLayout = 'empile' | 'cote';

/** Position de chaque niveau dans la scène : empilés, ou côte à côte (vue maquette). */
export function levelPlacements(levels: Level[], layout: LevelLayout, levelFilter: string) {
  const sorted = [...levels].sort((a, b) => a.index - b.index);
  const visible = sorted.filter((l) => levelFilter === 'tous' || l.id === levelFilter);
  const elev = levelElevations(sorted);
  const map = new Map<string, { dx: number; y: number }>();
  let right: number | null = null;
  for (const l of visible) {
    const b = levelBounds(l) ?? { minX: 0, minY: 0, maxX: 8, maxY: 8 };
    if (layout === 'empile' || visible.length === 1) {
      map.set(l.id, { dx: 0, y: layout === 'empile' ? (elev.get(l.id) ?? 0) : 0 });
      continue;
    }
    const dx: number = right === null ? 0 : right + 4 - b.minX;
    map.set(l.id, { dx, y: 0 });
    right = b.maxX + dx;
  }
  let bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, maxY3: 0 };
  for (const l of visible) {
    const b = levelBounds(l);
    const p = map.get(l.id)!;
    if (!b) continue;
    bounds = {
      minX: Math.min(bounds.minX, b.minX + p.dx),
      maxX: Math.max(bounds.maxX, b.maxX + p.dx),
      minY: Math.min(bounds.minY, b.minY),
      maxY: Math.max(bounds.maxY, b.maxY),
      maxY3: Math.max(bounds.maxY3, p.y),
    };
  }
  if (!Number.isFinite(bounds.minX)) bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10, maxY3: 0 };
  return { visible, placements: map, bounds };
}

export function Scene3DContent({ dossier, products, options, onSelectDevice, onFloorClick, onWallClick, onSelectFurniture }: Scene3DProps) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);
  const layout = options.layout ?? 'empile';
  const { visible, placements, bounds } = levelPlacements(dossier.plan.levels, layout, options.levelFilter);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minY + bounds.maxY) / 2;
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 6);

  return (
    <group>
      <ambientLight intensity={0.65} />
      <hemisphereLight args={['#ffffff', '#cbd5e1', 0.6]} />
      <directionalLight position={[cx + size, 18, cz + size * 0.8]} intensity={1.15} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-size} shadow-camera-right={size} shadow-camera-top={size} shadow-camera-bottom={-size} />
      {/* Terrain */}
      <mesh position={[cx, -0.06, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[size * 3 + 10, size * 3 + 10]} />
        <meshStandardMaterial color="#e8eee6" roughness={1} />
      </mesh>
      {visible.map((level) => {
        const { dx, y: y0 } = placements.get(level.id)!;
        const segments = buildWallSegments(level);
        const lb = levelBounds(level);
        const devices = dossier.devices.filter((d) => d.levelId === level.id);
        return (
          <group key={level.id} position={[dx, y0, 0]}>
            {/* Dalle */}
            {lb && (
              <mesh position={[(lb.minX + lb.maxX) / 2, -SLAB / 2, (lb.minY + lb.maxY) / 2]} receiveShadow>
                <boxGeometry args={[lb.maxX - lb.minX + 0.2, SLAB, lb.maxY - lb.minY + 0.2]} />
                <meshStandardMaterial color="#cfd5db" />
              </mesh>
            )}
            {/* Escaliers (vers le niveau supérieur) */}
            {dossier.plan.levels.some((l) => l.index > level.index) &&
              level.rooms.filter((r) => r.type === 'escalier').map((r) => <StairSteps key={`st-${r.id}`} room={r} rise={level.height + SLAB} />)}
            {/* Sols des pièces (trémie d'escalier laissée ouverte à l'étage) */}
            {level.rooms.filter((r) => !(r.type === 'escalier' && level.index > 0)).map((r) => (
              <mesh
                key={r.id}
                position={[r.x + r.w / 2, 0.02, r.y + r.h / 2]}
                receiveShadow
                onClick={(e) => {
                  if (!onFloorClick) return;
                  e.stopPropagation();
                  onFloorClick(level.id, e.point.x - dx, e.point.z);
                }}
              >
                <boxGeometry args={[r.w, 0.04, r.h]} />
                <meshStandardMaterial color={ROOM_COLORS[r.type]} roughness={0.95} />
              </mesh>
            ))}
            {segments
              .filter((s) => !options.hiddenWalls.has(`${level.id}:${s.key}`))
              .map((s) => (
                <Wall key={s.key} seg={s} height={level.height} mode={options.wallMode} onClick={onWallClick ? () => onWallClick(`${level.id}:${s.key}`) : undefined} />
              ))}
            {/* Ouvertures saisies par quantité (non positionnées) : repères translucides indicatifs */}
            {level.rooms.map((r) => {
              const pending = level.openings.filter((o) => o.host.kind === 'unplaced' && o.host.roomId === r.id);
              return pending.map((o, i) => {
                const n = pending.length;
                const step = Math.min(0.6, (r.w - 0.3) / Math.max(1, n));
                const x = r.x + r.w / 2 + (i - (n - 1) / 2) * step;
                const v = joineryVertical(o, level.height);
                const h = Math.max(0.3, v.top - v.bottom);
                return (
                  <mesh key={`up-${o.id}`} position={[x, v.bottom + h / 2, r.y + r.h - 0.25]}>
                    <boxGeometry args={[Math.max(0.15, step * 0.7), h, 0.06]} />
                    <meshStandardMaterial color="#f59e0b" transparent opacity={0.45} depthWrite={false} />
                  </mesh>
                );
              });
            })}
            {options.showLabels &&
              level.rooms.map((r) => (
                <Label key={`l-${r.id}`} text={r.name} sub={`${(r.w * r.h).toFixed(1).replace('.', ',')} m²`} position={[r.x + r.w / 2, 0.7, r.y + r.h / 2]} scale={Math.min(1, Math.max(0.6, Math.min(r.w, r.h) / 3))} />
              ))}
            {layout === 'cote' && visible.length > 1 && lb && (
              <Label text={level.name} position={[(lb.minX + lb.maxX) / 2, 3.2, lb.minY - 0.6]} scale={1.6} />
            )}
            {options.showFurniture !== false &&
              (level.furniture ?? []).map((f) => (
                <FurnitureMesh key={f.id} item={f} selected={options.selectedFurnitureId === f.id} onSelect={onSelectFurniture} />
              ))}
            {options.showDevices !== false && devices.map((d) => {
              const opening = d.openingId ? level.openings.find((o) => o.id === d.openingId)?.type : undefined;
              return (
                <DeviceMesh
                  key={d.id}
                  device={d}
                  product={productMap.get(d.productId)}
                  level={level}
                  elevation={0}
                  selected={options.selectedDeviceId === d.id}
                  onSelect={onSelectDevice ? (id) => onSelectDevice(id) : undefined}
                  opening={opening}
                />
              );
            })}
            {options.showCoverage && options.showDevices !== false &&
              devices
                .filter((d) => productMap.get(d.productId)?.category === 'detecteur_mouvement')
                .map((d) => (
                  <CoverageSector key={`c-${d.id}`} device={d} level={level} elevation={0} offsetX={dx} angle={options.motionAngle} range={options.motionRange} />
                ))}
          </group>
        );
      })}
    </group>
  );
}

/** Position de caméra pour les vues prédéfinies. */
export function cameraPreset(dossier: Dossier, preset: 'iso' | 'dessus' | 'face', levelFilter: string, zoom = 1, layout: LevelLayout = 'empile') {
  const { bounds: b } = levelPlacements(dossier.plan.levels, layout, levelFilter);
  const targetY = b.maxY3 / 2;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minY + b.maxY) / 2;
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, 6) * zoom;
  const target = new THREE.Vector3(cx, targetY, cz);
  if (preset === 'dessus') return { position: new THREE.Vector3(cx, targetY + size * 1.35, cz + 0.01), target };
  if (preset === 'face') return { position: new THREE.Vector3(cx, targetY + size * 0.35, cz + size * 1.2), target };
  return { position: new THREE.Vector3(cx + size * 0.55, targetY + size * 0.8, cz + size * 0.85), target };
}

export function useStableRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
