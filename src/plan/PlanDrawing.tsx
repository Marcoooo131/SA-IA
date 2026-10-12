import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Level, Opening, PlacedDevice, Product, Room } from '@/domain/types';
import { CATEGORY_COLORS, CATEGORY_GLYPH, ROOM_COLORS } from '@/domain/labels';
import { adjacentRooms, buildWallSegments, openingPlacement, roomArea, type WallSegment } from './geometry';
import { formatNumber } from '@/lib/format';

export type PlanTarget =
  | { kind: 'room'; id: string; handle?: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' }
  | { kind: 'opening'; id: string }
  | { kind: 'wall'; id: string; handle?: 'a' | 'b' | 'move' }
  | { kind: 'device'; id: string }
  | { kind: 'background' };

export interface PlanDrawingProps {
  level: Level;
  devices: PlacedDevice[];
  products: Product[];
  backgroundUrl?: string;
  selected?: PlanTarget | null;
  showDimensions?: boolean;
  showCoverage?: boolean;
  showLabels?: boolean;
  /** Échelle d'affichage (px par mètre) pour garder des traits lisibles. */
  pxPerMeter?: number;
  interactive?: boolean;
  motionAngle?: number;
  motionRange?: number;
  onTargetDown?: (target: PlanTarget, e: ReactPointerEvent) => void;
}

const DOOR = '#334155';

function wallPieces(seg: WallSegment): { a: { x: number; y: number }; b: { x: number; y: number } }[] {
  const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
  if (len === 0) return [];
  const ux = (seg.b.x - seg.a.x) / len;
  const uy = (seg.b.y - seg.a.y) / len;
  const at = (t: number) => ({ x: seg.a.x + ux * t, y: seg.a.y + uy * t });
  const out = [];
  let cur = 0;
  for (const c of seg.cuts) {
    if (c.t0 > cur + 0.001) out.push({ a: at(cur), b: at(c.t0) });
    cur = Math.max(cur, c.t1);
  }
  if (cur < len - 0.001) out.push({ a: at(cur), b: at(len) });
  return out;
}

function sectorPath(cx: number, cy: number, r: number, rotationDeg: number, angleDeg: number): string {
  const a0 = ((rotationDeg - angleDeg / 2) * Math.PI) / 180;
  const a1 = ((rotationDeg + angleDeg / 2) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = angleDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

export function OpeningShape({ level, opening, selected, px }: { level: Level; opening: Opening; selected: boolean; px: number }) {
  const pl = openingPlacement(level, opening);
  if (!pl) return null;
  const { start, end, center, angle } = pl;
  const w = Math.hypot(end.x - start.x, end.y - start.y);
  const deg = (angle * 180) / Math.PI;
  const lw = 1.5 / px;
  const color = opening.exterior ? '#0f766e' : DOOR;
  let body: ReactNode;
  if (opening.type === 'passage') {
    body = (
      <g>
        <rect x={-w / 2} y={-0.07} width={w} height={0.14} fill="#ffffff" stroke="none" />
        <line x1={-w / 2} y1={-0.07} x2={w / 2} y2={-0.07} stroke="#94a3b8" strokeWidth={lw} strokeDasharray={`${4 / px} ${3 / px}`} />
        <line x1={-w / 2} y1={0.07} x2={w / 2} y2={0.07} stroke="#94a3b8" strokeWidth={lw} strokeDasharray={`${4 / px} ${3 / px}`} />
      </g>
    );
  } else if (opening.type === 'fenetre' || opening.type === 'baie') {
    const t = opening.type === 'baie' ? 0.16 : 0.12;
    body = (
      <g>
        <rect x={-w / 2} y={-t / 2} width={w} height={t} fill="#e0f2fe" stroke="#0369a1" strokeWidth={lw} />
        <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke="#0369a1" strokeWidth={lw} />
        {opening.type === 'baie' && <line x1={0} y1={-t / 2} x2={0} y2={t / 2} stroke="#0369a1" strokeWidth={lw} />}
      </g>
    );
  } else if (opening.type === 'porte_garage') {
    body = (
      <g>
        <rect x={-w / 2} y={-0.08} width={w} height={0.16} fill="#f1f5f9" stroke={color} strokeWidth={lw} strokeDasharray={`${4 / px} ${3 / px}`} />
      </g>
    );
  } else {
    // Porte : battant + arc d'ouverture vers l'intérieur de la pièce hôte
    // Repère local : x le long du mur, y = normale à gauche. Le battant s'ouvre vers l'intérieur de la pièce hôte.
    const s = opening.host.kind === 'room' ? (opening.host.side === 'N' || opening.host.side === 'E' ? 1 : -1) : 1;
    body = (
      <g>
        <rect x={-w / 2} y={-0.06} width={w} height={0.12} fill="#ffffff" stroke="none" />
        <line x1={-w / 2} y1={0} x2={-w / 2} y2={s * w} stroke={color} strokeWidth={lw * 1.4} />
        <path d={`M ${-w / 2} ${s * w} A ${w} ${w} 0 0 ${s > 0 ? 0 : 1} ${w / 2} 0`} fill="none" stroke={color} strokeWidth={lw} strokeDasharray={`${3 / px} ${2 / px}`} />
      </g>
    );
  }
  return (
    <g transform={`translate(${center.x} ${center.y}) rotate(${deg})`}>
      {body}
      {selected && <rect x={-w / 2 - 0.08} y={-0.2} width={w + 0.16} height={0.4} fill="none" stroke="#2563eb" strokeWidth={2 / px} />}
    </g>
  );
}

export function DeviceGlyph({ device, product, px, selected }: { device: PlacedDevice; product?: Product; px: number; selected: boolean }) {
  const cat = product?.category ?? 'autre';
  const color = CATEGORY_COLORS[cat];
  const r = 11 / px;
  const suggested = device.origin === 'suggere';
  const fill = suggested && !device.validated ? '#ffffff' : color;
  const text = suggested && !device.validated ? color : '#ffffff';
  const rot = (device.rotation * Math.PI) / 180;
  return (
    <g>
      {cat === 'detecteur_mouvement' && (
        <line x1={device.x} y1={device.y} x2={device.x + Math.cos(rot) * r * 1.9} y2={device.y + Math.sin(rot) * r * 1.9} stroke={color} strokeWidth={2 / px} />
      )}
      <circle
        cx={device.x}
        cy={device.y}
        r={r}
        fill={fill}
        stroke={color}
        strokeWidth={(suggested ? 2.2 : 1.5) / px}
        strokeDasharray={suggested && !device.validated ? `${3 / px} ${2 / px}` : undefined}
      />
      {suggested && device.validated && <circle cx={device.x} cy={device.y} r={r + 3 / px} fill="none" stroke={color} strokeWidth={1 / px} />}
      <text
        x={device.x}
        y={device.y}
        fontSize={(CATEGORY_GLYPH[cat].length > 1 ? 8 : 10) / px}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
        fill={text}
        fontFamily="Inter, Helvetica, Arial, sans-serif"
        style={{ pointerEvents: 'none' }}
      >
        {CATEGORY_GLYPH[cat]}
      </text>
      {device.quantity > 1 && (
        <g>
          <rect x={device.x + r * 0.55} y={device.y - r * 1.55} width={18 / px} height={11 / px} rx={3 / px} fill="#0f172a" />
          <text x={device.x + r * 0.55 + 9 / px} y={device.y - r * 1.55 + 5.5 / px} fontSize={8 / px} fill="#fff" textAnchor="middle" dominantBaseline="central" fontFamily="Inter, Helvetica, Arial, sans-serif">
            ×{device.quantity}
          </text>
        </g>
      )}
      {selected && <circle cx={device.x} cy={device.y} r={r + 6 / px} fill="none" stroke="#2563eb" strokeWidth={2 / px} />}
    </g>
  );
}

function RoomDimensions({ room, px }: { room: Room; px: number }) {
  const off = 0.45;
  const fs = 11 / px;
  const lw = 1 / px;
  return (
    <g fill="#1e3a8a" stroke="#1e3a8a" fontFamily="Inter, Helvetica, Arial, sans-serif" style={{ pointerEvents: 'none' }}>
      <line x1={room.x} y1={room.y - off} x2={room.x + room.w} y2={room.y - off} strokeWidth={lw} />
      <line x1={room.x} y1={room.y - off - 0.1} x2={room.x} y2={room.y - off + 0.1} strokeWidth={lw} />
      <line x1={room.x + room.w} y1={room.y - off - 0.1} x2={room.x + room.w} y2={room.y - off + 0.1} strokeWidth={lw} />
      <text x={room.x + room.w / 2} y={room.y - off - 0.12} fontSize={fs} textAnchor="middle" stroke="none">
        {formatNumber(room.w)} m
      </text>
      <line x1={room.x - off} y1={room.y} x2={room.x - off} y2={room.y + room.h} strokeWidth={lw} />
      <line x1={room.x - off - 0.1} y1={room.y} x2={room.x - off + 0.1} y2={room.y} strokeWidth={lw} />
      <line x1={room.x - off - 0.1} y1={room.y + room.h} x2={room.x - off + 0.1} y2={room.y + room.h} strokeWidth={lw} />
      <text
        x={room.x - off - 0.12}
        y={room.y + room.h / 2}
        fontSize={fs}
        textAnchor="middle"
        stroke="none"
        transform={`rotate(-90 ${room.x - off - 0.12} ${room.y + room.h / 2})`}
      >
        {formatNumber(room.h)} m
      </text>
    </g>
  );
}

export function PlanDrawing({
  level,
  devices,
  products,
  backgroundUrl,
  selected,
  showDimensions = true,
  showCoverage = true,
  showLabels = true,
  pxPerMeter = 40,
  interactive = false,
  motionAngle = 110,
  motionRange = 10,
  onTargetDown,
}: PlanDrawingProps) {
  const px = pxPerMeter;
  const segments = buildWallSegments(level);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const isSel = (kind: string, id?: string) =>
    !!selected && selected.kind === kind && (!id || ('id' in selected && selected.id === id));
  const down = (t: PlanTarget) => (e: ReactPointerEvent) => {
    if (!interactive || !onTargetDown) return;
    onTargetDown(t, e);
  };
  const handle = 7 / px;
  const bg = level.background;

  return (
    <g>
      {bg && bg.visible && backgroundUrl && (
        <image
          href={backgroundUrl}
          x={bg.x}
          y={bg.y}
          width={bg.width}
          height={bg.width * bg.aspect}
          opacity={bg.opacity}
          preserveAspectRatio="none"
          transform={`rotate(${bg.rotation} ${bg.x + bg.width / 2} ${bg.y + (bg.width * bg.aspect) / 2})`}
          onPointerDown={down({ kind: 'background' })}
          style={{ cursor: interactive && !bg.locked ? 'move' : undefined, pointerEvents: interactive && !bg.locked ? 'auto' : 'none' }}
          data-testid="plan-background"
        />
      )}

      {/* Pièces */}
      {level.rooms.map((room) => (
        <rect
          key={room.id}
          x={room.x}
          y={room.y}
          width={room.w}
          height={room.h}
          fill={ROOM_COLORS[room.type]}
          fillOpacity={bg && bg.visible ? 0.55 : 1}
          stroke={isSel('room', room.id) ? '#2563eb' : '#cbd5e1'}
          strokeWidth={(isSel('room', room.id) ? 2 : 0.8) / px}
          onPointerDown={down({ kind: 'room', id: room.id, handle: 'move' })}
          style={{ cursor: interactive ? 'move' : undefined }}
          data-testid={`room-${room.name}`}
        />
      ))}

      {/* Zones de détection théoriques (indicatives) */}
      {showCoverage && (
        <g style={{ pointerEvents: 'none' }}>
          <defs>
            <pattern id={`hatch-${level.id}`} width={0.25} height={0.25} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={0.25} stroke="#d97706" strokeWidth={0.03} strokeOpacity={0.35} />
            </pattern>
            {devices
              .filter((d) => productMap.get(d.productId)?.category === 'detecteur_mouvement')
              .map((d) => {
                const room = level.rooms.find((r) => r.id === d.roomId) ?? level.rooms.find((r) => d.x >= r.x && d.x <= r.x + r.w && d.y >= r.y && d.y <= r.y + r.h);
                const rooms = room ? [room, ...(room.openPlan ? adjacentRooms(level, room).filter((r) => r.openPlan) : [])] : level.rooms;
                return (
                  <clipPath key={d.id} id={`clip-${d.id}`}>
                    {rooms.map((r) => (
                      <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} />
                    ))}
                  </clipPath>
                );
              })}
          </defs>
          {devices
            .filter((d) => productMap.get(d.productId)?.category === 'detecteur_mouvement')
            .map((d) => (
              <g key={d.id} clipPath={`url(#clip-${d.id})`}>
                <path d={sectorPath(d.x, d.y, motionRange, d.rotation, motionAngle)} fill="#f59e0b" fillOpacity={0.12} stroke="#d97706" strokeOpacity={0.5} strokeWidth={1 / px} strokeDasharray={`${4 / px} ${3 / px}`} />
                <path d={sectorPath(d.x, d.y, motionRange, d.rotation, motionAngle)} fill={`url(#hatch-${level.id})`} />
              </g>
            ))}
        </g>
      )}

      {/* Murs générés */}
      <g style={{ pointerEvents: 'none' }}>
        {segments
          .filter((s) => s.source === 'room')
          .flatMap((s) =>
            wallPieces(s).map((p, i) => (
              <line
                key={`${s.key}-${i}`}
                x1={p.a.x}
                y1={p.a.y}
                x2={p.b.x}
                y2={p.b.y}
                stroke={s.exterior ? '#1f2937' : '#475569'}
                strokeWidth={s.thickness}
                strokeLinecap="square"
              />
            )),
          )}
      </g>
      {/* Murs libres (cloisons) */}
      {level.walls.map((w) => {
        const seg = segments.find((s) => s.key === `w:${w.id}`);
        const pieces = seg ? wallPieces(seg) : [{ a: w.a, b: w.b }];
        const sel = isSel('wall', w.id);
        return (
          <g key={w.id}>
            <line
              x1={w.a.x}
              y1={w.a.y}
              x2={w.b.x}
              y2={w.b.y}
              stroke="transparent"
              strokeWidth={Math.max(w.thickness, 12 / px)}
              onPointerDown={down({ kind: 'wall', id: w.id, handle: 'move' })}
              style={{ cursor: interactive ? 'move' : undefined }}
            />
            {pieces.map((p, i) => (
              <line key={i} x1={p.a.x} y1={p.a.y} x2={p.b.x} y2={p.b.y} stroke={sel ? '#2563eb' : '#64748b'} strokeWidth={w.thickness} strokeLinecap="square" style={{ pointerEvents: 'none' }} />
            ))}
            {sel && interactive && (
              <>
                <circle cx={w.a.x} cy={w.a.y} r={handle} fill="#fff" stroke="#2563eb" strokeWidth={2 / px} onPointerDown={down({ kind: 'wall', id: w.id, handle: 'a' })} style={{ cursor: 'crosshair' }} />
                <circle cx={w.b.x} cy={w.b.y} r={handle} fill="#fff" stroke="#2563eb" strokeWidth={2 / px} onPointerDown={down({ kind: 'wall', id: w.id, handle: 'b' })} style={{ cursor: 'crosshair' }} />
              </>
            )}
          </g>
        );
      })}

      {/* Ouvertures */}
      {level.openings.map((o) => {
        const pl = openingPlacement(level, o);
        return (
          <g key={o.id} onPointerDown={down({ kind: 'opening', id: o.id })} style={{ cursor: interactive ? 'pointer' : undefined }} data-testid={`opening-${o.code}`}>
            <OpeningShape level={level} opening={o} selected={isSel('opening', o.id)} px={px} />
            {pl && (
              <rect x={pl.center.x - 0.3} y={pl.center.y - 0.3} width={0.6} height={0.6} fill="transparent" />
            )}
            {showLabels && pl && o.exterior && (
              <text x={pl.center.x} y={pl.center.y} dy={-14 / px} fontSize={9 / px} textAnchor="middle" fill="#0f766e" fontFamily="Inter, Helvetica, Arial, sans-serif" style={{ pointerEvents: 'none' }}>
                {o.code}
              </text>
            )}
          </g>
        );
      })}

      {/* Libellés des pièces */}
      {showLabels &&
        level.rooms.map((room) => {
          const dims = `${formatNumber(room.w)} × ${formatNumber(room.h)} m · ${formatNumber(roomArea(room), 1)} m²`;
          // taille de police adaptée à la largeur de la pièce (≈ 0,56 em par caractère)
          const nameFs = Math.min(12 / px, (room.w * 0.9) / Math.max(4, room.name.length * 0.58));
          const dimsFs = Math.min(10 / px, (room.w * 0.9) / (dims.length * 0.56));
          return (
            <g key={`lbl-${room.id}`} style={{ pointerEvents: 'none' }} fontFamily="Inter, Helvetica, Arial, sans-serif">
              <text x={room.x + room.w / 2} y={room.y + room.h / 2} fontSize={nameFs} fontWeight={600} textAnchor="middle" fill="#0f172a">
                {room.name}
              </text>
              <text x={room.x + room.w / 2} y={room.y + room.h / 2} dy={nameFs * 1.2} fontSize={dimsFs} textAnchor="middle" fill="#475569">
                {dims}
              </text>
            </g>
          );
        })}

      {/* Cotes de la pièce sélectionnée */}
      {showDimensions &&
        level.rooms
          .filter((r) => isSel('room', r.id))
          .map((r) => <RoomDimensions key={`dim-${r.id}`} room={r} px={px} />)}

      {/* Équipements */}
      {devices.map((d) => (
        <g key={d.id} onPointerDown={down({ kind: 'device', id: d.id })} style={{ cursor: interactive ? 'grab' : undefined }} data-testid={`device-${d.id}`}>
          <DeviceGlyph device={d} product={productMap.get(d.productId)} px={px} selected={isSel('device', d.id)} />
        </g>
      ))}

      {/* Poignées de redimensionnement */}
      {interactive &&
        level.rooms
          .filter((r) => isSel('room', r.id))
          .map((r) => {
            const hs: { h: NonNullable<Extract<PlanTarget, { kind: 'room' }>['handle']>; x: number; y: number; c: string }[] = [
              { h: 'nw', x: r.x, y: r.y, c: 'nwse-resize' },
              { h: 'ne', x: r.x + r.w, y: r.y, c: 'nesw-resize' },
              { h: 'sw', x: r.x, y: r.y + r.h, c: 'nesw-resize' },
              { h: 'se', x: r.x + r.w, y: r.y + r.h, c: 'nwse-resize' },
              { h: 'n', x: r.x + r.w / 2, y: r.y, c: 'ns-resize' },
              { h: 's', x: r.x + r.w / 2, y: r.y + r.h, c: 'ns-resize' },
              { h: 'w', x: r.x, y: r.y + r.h / 2, c: 'ew-resize' },
              { h: 'e', x: r.x + r.w, y: r.y + r.h / 2, c: 'ew-resize' },
            ];
            return hs.map((h) => (
              <rect
                key={`${r.id}-${h.h}`}
                x={h.x - handle}
                y={h.y - handle}
                width={handle * 2}
                height={handle * 2}
                fill="#ffffff"
                stroke="#2563eb"
                strokeWidth={2 / px}
                onPointerDown={down({ kind: 'room', id: r.id, handle: h.h })}
                style={{ cursor: h.c }}
                data-testid={`handle-${h.h}`}
              />
            ));
          })}
    </g>
  );
}
