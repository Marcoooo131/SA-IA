import type { FurnitureItem } from '@/domain/types';
import { getFurnitureModel, partColor, type FurnitureModel } from './models';

/** Assombrit une couleur hexadécimale (contours des symboles). */
export function darken(hex: string, k = 0.35): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#475569';
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - k)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Volumes triés du plus bas au plus haut (vue de dessus : le plus haut est dessiné en dernier). */
function topOrder(model: FurnitureModel) {
  return [...model.parts].sort((a, b) => a.z + a.h - (b.z + b.h));
}

/**
 * Symbole 2D (vue de dessus) d'un objet, dérivé des mêmes volumes que la géométrie 3D.
 * Coordonnées en mètres dans le repère du plan.
 */
export function FurnitureGlyph({ item, px, selected = false, faded = false }: { item: FurnitureItem; px: number; selected?: boolean; faded?: boolean }) {
  const model = getFurnitureModel(item.modelId);
  const { w, d } = item;
  const sw = 0.8 / px;
  if (!model) {
    return (
      <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
        <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={sw} strokeDasharray={`${3 / px} ${2 / px}`} />
      </g>
    );
  }
  const high = model.layer === 'haut';
  return (
    <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} opacity={faded ? 0.45 : high ? 0.6 : 1}>
      {/* zone de préhension (sélection) */}
      <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="transparent" />
      {topOrder(model).map((p, i) => {
        const x = -w / 2 + p.x * w;
        const y = -d / 2 + p.y * d;
        const pw = p.w * w;
        const pd = p.d * d;
        const fill = partColor(p, model, item.color);
        const common = { fill, stroke: darken(fill), strokeWidth: sw, fillOpacity: p.opacity ?? 1 };
        if (p.shape === 'cyl' || p.shape === 'sphere') return <ellipse key={i} cx={x + pw / 2} cy={y + pd / 2} rx={pw / 2} ry={pd / 2} {...common} />;
        const rx = p.shape === 'round' ? Math.min(0.08, pw / 4, pd / 4) : 0;
        return <rect key={i} x={x} y={y} width={pw} height={pd} rx={rx} {...common} />;
      })}
      {high && <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="none" stroke="#64748b" strokeWidth={sw} strokeDasharray={`${3 / px} ${2 / px}`} />}
      {selected && (
        <rect
          x={-w / 2 - 0.05}
          y={-d / 2 - 0.05}
          width={w + 0.1}
          height={d + 0.1}
          fill="none"
          stroke="#d7001e"
          strokeWidth={2 / px}
          strokeDasharray={`${5 / px} ${3 / px}`}
        />
      )}
    </g>
  );
}

/** Miniature autonome (bibliothèque) d'un modèle, à sa taille par défaut. */
export function FurnitureThumb({ modelId, size = 44 }: { modelId: string; size?: number }) {
  const model = getFurnitureModel(modelId);
  if (!model) return null;
  const m = Math.max(model.w, model.d) * 1.15;
  const item: FurnitureItem = { id: 'thumb', modelId, roomId: null, x: 0, y: 0, rotation: 0, w: model.w, d: model.d, h: model.h, origin: 'genere' };
  return (
    <svg width={size} height={size} viewBox={`${-m / 2} ${-m / 2} ${m} ${m}`} aria-hidden>
      <FurnitureGlyph item={item} px={size / m} />
    </svg>
  );
}
