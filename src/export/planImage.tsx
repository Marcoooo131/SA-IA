import { renderToStaticMarkup } from 'react-dom/server';
import type { Level, PlacedDevice, Product } from '@/domain/types';
import { PlanDrawing } from '@/plan/PlanDrawing';
import { levelBounds } from '@/plan/geometry';
import { formatNumber } from '@/lib/format';

/** Rendu SVG statique d'un niveau (même composant que l'éditeur). */
export function renderLevelSvg(
  level: Level,
  devices: PlacedDevice[],
  products: Product[],
  opts: { pxPerMeter?: number; motionAngle?: number; motionRange?: number; backgroundUrl?: string; showFurniture?: boolean } = {},
): { svg: string; width: number; height: number } {
  const px = opts.pxPerMeter ?? 60;
  const b = levelBounds(level) ?? { minX: 0, minY: 0, maxX: 10, maxY: 8 };
  const pad = 1.2;
  const vx = b.minX - pad;
  const vy = b.minY - pad;
  const vw = b.maxX - b.minX + pad * 2;
  const vh = b.maxY - b.minY + pad * 2 + 0.6;
  const width = Math.round(vw * px);
  const height = Math.round(vh * px);
  const scaleLen = vw > 12 ? 5 : 2;
  const inner = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${vx} ${vy} ${vw} ${vh}`} width={width} height={height}>
      <rect x={vx} y={vy} width={vw} height={vh} fill="#ffffff" />
      <PlanDrawing
        level={level}
        devices={devices}
        products={products}
        pxPerMeter={px}
        showDimensions={false}
        motionAngle={opts.motionAngle}
        motionRange={opts.motionRange}
        backgroundUrl={opts.backgroundUrl}
        showFurniture={opts.showFurniture ?? true}
        fadeFurniture
      />
      {/* Échelle graphique */}
      <g transform={`translate(${vx + 0.5} ${vy + vh - 0.5})`} fontFamily="Helvetica, Arial, sans-serif">
        <rect x={0} y={-0.12} width={scaleLen} height={0.12} fill="#0f172a" />
        <rect x={0} y={-0.12} width={scaleLen / 2} height={0.12} fill="#94a3b8" />
        <text x={scaleLen + 0.2} y={0} fontSize={12 / px} fill="#0f172a">
          {formatNumber(scaleLen, 0)} m
        </text>
      </g>
    </svg>,
  );
  return { svg: inner, width, height };
}

/** Convertit un SVG en image PNG (data URL) via un canvas. */
export function svgToPng(svg: string, width: number, height: number, maxWidth = 1600): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const scale = Math.min(1.5, maxWidth / width);
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      // canvas logiciel : rendu fiable des groupes semi-transparents (mobilier atténué),
      // indépendamment de l'accélération graphique du poste
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas indisponible'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: canvas.toDataURL('image/png'), width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de convertir le plan en image"));
    };
    img.src = url;
  });
}
