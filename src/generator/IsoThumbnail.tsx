import type { Level } from '@/domain/types';
import { ROOM_COLORS } from '@/domain/labels';
import { buildWallSegments, type WallSegment } from '@/plan/geometry';

/**
 * Miniature 3D (vue isométrique) calculée à partir de la géométrie réelle du plan :
 * sols et murs extrudés, découpés aux ouvertures. Légère (SVG), utilisable dans une
 * galerie sans créer un contexte WebGL par vignette.
 */

const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
const proj = (x: number, y: number, z: number) => ({ X: (x - y) * COS, Y: (x + y) * SIN - z });

interface Poly {
  depth: number;
  points: string;
  fill: string;
  stroke: string;
}

function wallQuads(seg: WallSegment, z0: number, h: number): Poly[] {
  const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
  if (len < 0.01) return [];
  const ux = (seg.b.x - seg.a.x) / len;
  const uy = (seg.b.y - seg.a.y) / len;
  const at = (t: number) => ({ x: seg.a.x + ux * t, y: seg.a.y + uy * t });
  const parts: { t0: number; t1: number; bottom: number; top: number }[] = [];
  let cur = 0;
  for (const c of seg.cuts) {
    if (c.t0 > cur) parts.push({ t0: cur, t1: c.t0, bottom: 0, top: h });
    const t = c.opening.type;
    const low = t === 'fenetre' ? 0.95 : 0;
    const high = t === 'passage' || t === 'baie' || t === 'porte_garage' ? h * 0.88 : h * 0.84;
    if (low > 0) parts.push({ t0: c.t0, t1: c.t1, bottom: 0, top: low });
    parts.push({ t0: c.t0, t1: c.t1, bottom: high, top: h });
    cur = c.t1;
  }
  if (cur < len) parts.push({ t0: cur, t1: len, bottom: 0, top: h });
  const fill = seg.exterior ? '#d9d2c4' : '#efebe3';
  return parts.map((p) => {
    const a = at(p.t0);
    const b = at(p.t1);
    const pts = [proj(a.x, a.y, z0 + p.bottom), proj(b.x, b.y, z0 + p.bottom), proj(b.x, b.y, z0 + p.top), proj(a.x, a.y, z0 + p.top)];
    return {
      depth: (a.x + a.y + b.x + b.y) / 2 + z0 * 0.01,
      points: pts.map((q) => `${q.X.toFixed(2)},${q.Y.toFixed(2)}`).join(' '),
      fill,
      stroke: '#8f8676',
    };
  });
}

export function IsoThumbnail({ levels, width = 200, height = 130 }: { levels: Level[]; width?: number; height?: number }) {
  const polys: Poly[] = [];
  const floors: Poly[] = [];
  const sorted = [...levels].sort((a, b) => a.index - b.index);
  // niveaux côte à côte pour que chaque étage reste visible
  let shift = 0;
  for (const lvl of sorted) {
    const minX = Math.min(...lvl.rooms.map((r) => r.x), 0);
    const maxX = Math.max(...lvl.rooms.map((r) => r.x + r.w), 0);
    const dx = shift - minX;
    const moved: Level = { ...lvl, rooms: lvl.rooms.map((r) => ({ ...r, x: r.x + dx })), walls: lvl.walls.map((w) => ({ ...w, a: { ...w.a, x: w.a.x + dx }, b: { ...w.b, x: w.b.x + dx } })) };
    for (const r of moved.rooms) {
      const pts = [proj(r.x, r.y, 0), proj(r.x + r.w, r.y, 0), proj(r.x + r.w, r.y + r.h, 0), proj(r.x, r.y + r.h, 0)];
      floors.push({ depth: 0, points: pts.map((q) => `${q.X.toFixed(2)},${q.Y.toFixed(2)}`).join(' '), fill: ROOM_COLORS[r.type], stroke: '#d4cfc4' });
    }
    for (const seg of buildWallSegments(moved)) polys.push(...wallQuads(seg, 0, 1.6));
    shift += maxX - minX + 3;
  }
  polys.sort((p, q) => p.depth - q.depth);
  const all = [...floors, ...polys];
  const coords = all.flatMap((p) => p.points.split(' ').map((s) => s.split(',').map(Number)));
  if (!coords.length) return <svg width={width} height={height} />;
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const pad = 0.6;
  const vb = `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`;
  return (
    <svg viewBox={vb} width={width} height={height} role="img" aria-label="Miniature 3D du modèle">
      {all.map((p, i) => (
        <polygon key={i} points={p.points} fill={p.fill} stroke={p.stroke} strokeWidth={0.04} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
