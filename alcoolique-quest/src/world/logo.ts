// Logo original du jeu, gravé sur canevas : lettres de métal ancien biseautées, gravures, fissures lumineuses,
// blason à la bouteille. Rendu par un shader (apparition par dissolution brûlante, reflet qui balaie le métal,
// pulsation des fissures).
import * as THREE from 'three';
import { rng } from '../core/math';

const W = 2048, H = 1024;
const TITLE_FONT = (size: number, weight = 900) => `${weight} ${size}px "Cinzel", "Cinzel Decorative", "Trajan Pro", Georgia, serif`;

function metalGradient(g: CanvasRenderingContext2D, y0: number, y1: number) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0.0, '#4a4440');
  gr.addColorStop(0.18, '#d8d2c4');
  gr.addColorStop(0.36, '#8a7a5c');
  gr.addColorStop(0.5, '#3a3026');
  gr.addColorStop(0.56, '#c9a24a');
  gr.addColorStop(0.75, '#f3e2b0');
  gr.addColorStop(0.9, '#8a6a2a');
  gr.addColorStop(1.0, '#3a2a14');
  return gr;
}

/** Texte métallique en relief : extrusion sombre, remplissage dégradé, biseau clair/sombre. */
function metalText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, weight: number, spacing: number) {
  g.font = TITLE_FONT(size, weight);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
  const top = y - size * 0.75, bottom = y + size * 0.05;
  // ombre portée et extrusion
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.9)';
  g.shadowBlur = size * 0.12;
  g.shadowOffsetY = size * 0.04;
  g.fillStyle = '#120e0a';
  for (let k = 6; k >= 1; k--) g.fillText(text, x, y + k * size * 0.006);
  g.restore();
  // corps métallique
  g.fillStyle = metalGradient(g, top, bottom);
  g.fillText(text, x, y);
  // biseau : arête claire en haut à gauche, sombre en bas à droite
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.lineWidth = size * 0.018;
  g.strokeStyle = 'rgba(255,240,210,0.55)';
  g.strokeText(text, x - size * 0.006, y - size * 0.008);
  g.strokeStyle = 'rgba(20,10,0,0.7)';
  g.strokeText(text, x + size * 0.008, y + size * 0.01);
  g.restore();
  // contour fin
  g.lineWidth = Math.max(1.5, size * 0.008);
  g.strokeStyle = 'rgba(30,20,10,0.9)';
  g.strokeText(text, x, y);
  (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  return { top, bottom };
}

/** Rayures, piqûres et usure, limitées au métal déjà dessiné. */
function weather(g: CanvasRenderingContext2D, seed: number, area: [number, number, number, number]) {
  const r = rng(seed);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = r.next() < 0.5 ? `rgba(0,0,0,${r.range(0.08, 0.3)})` : `rgba(255,240,200,${r.range(0.05, 0.18)})`;
    g.lineWidth = r.range(0.5, 1.6);
    const x = r.range(area[0], area[2]), y = r.range(area[1], area[3]);
    const a = r.range(-0.4, 0.4) + (r.next() < 0.5 ? 0 : Math.PI / 2);
    const l = r.range(4, 30);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(0,0,0,${r.range(0.1, 0.4)})`;
    g.beginPath();
    g.arc(r.range(area[0], area[2]), r.range(area[1], area[3]), r.range(0.8, 3), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** Fissures : tracées sur la couleur (sombres) et sur le masque d'émission (lumineuses). */
function cracks(gc: CanvasRenderingContext2D, ge: CanvasRenderingContext2D, seed: number, starts: [number, number][], len: number) {
  const r = rng(seed);
  const path: [number, number][][] = [];
  const grow = (x: number, y: number, a: number, l: number, depth: number) => {
    const pts: [number, number][] = [[x, y]];
    for (let i = 0; i < 6; i++) {
      a += r.range(-0.6, 0.6);
      x += Math.cos(a) * l / 6;
      y += Math.sin(a) * l / 6;
      pts.push([x, y]);
    }
    path.push(pts);
    if (depth > 0) {
      grow(x, y, a + r.range(-0.8, 0.8), l * 0.6, depth - 1);
      if (r.next() < 0.5) grow(pts[3][0], pts[3][1], a + r.sign() * r.range(0.7, 1.3), l * 0.45, depth - 1);
    }
  };
  for (const [x, y] of starts) grow(x, y, r.range(0, Math.PI * 2), len, 3);
  const draw = (g: CanvasRenderingContext2D, color: string, w: number, blur: number) => {
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = color;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.shadowColor = color;
    g.shadowBlur = blur;
    for (const pts of path) {
      g.lineWidth = w;
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.stroke();
    }
    g.restore();
  };
  draw(gc, 'rgba(25,8,0,0.95)', 3.2, 0);
  draw(ge, 'rgba(255,255,255,1)', 2.2, 6);
}

/** Blason : une bouteille stylisée sous un arc gothique, entourée de rayons. Le sacré absolu. */
function crest(g: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = metalGradient(g, -s, s);
  g.fillStyle = metalGradient(g, -s, s);
  g.lineWidth = s * 0.06;
  // rayons
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const l = i % 2 ? 0.95 : 1.25;
    g.beginPath();
    g.moveTo(Math.cos(a) * s * 0.72, Math.sin(a) * s * 0.72);
    g.lineTo(Math.cos(a) * s * l, Math.sin(a) * s * l);
    g.lineWidth = s * (i % 2 ? 0.025 : 0.045);
    g.stroke();
  }
  // arc brisé
  g.lineWidth = s * 0.07;
  g.beginPath();
  g.moveTo(-s * 0.5, s * 0.62);
  g.lineTo(-s * 0.5, -s * 0.05);
  g.quadraticCurveTo(-s * 0.5, -s * 0.55, 0, -s * 0.78);
  g.quadraticCurveTo(s * 0.5, -s * 0.55, s * 0.5, -s * 0.05);
  g.lineTo(s * 0.5, s * 0.62);
  g.closePath();
  g.stroke();
  // la bouteille (silhouette)
  g.beginPath();
  g.moveTo(-s * 0.06, -s * 0.52);
  g.lineTo(s * 0.06, -s * 0.52);
  g.lineTo(s * 0.06, -s * 0.38);
  g.quadraticCurveTo(s * 0.17, -s * 0.28, s * 0.17, -s * 0.12);
  g.lineTo(s * 0.17, s * 0.45);
  g.quadraticCurveTo(s * 0.17, s * 0.52, s * 0.1, s * 0.52);
  g.lineTo(-s * 0.1, s * 0.52);
  g.quadraticCurveTo(-s * 0.17, s * 0.52, -s * 0.17, s * 0.45);
  g.lineTo(-s * 0.17, -s * 0.12);
  g.quadraticCurveTo(-s * 0.17, -s * 0.28, -s * 0.06, -s * 0.38);
  g.closePath();
  g.fill();
  g.strokeStyle = '#1a120a';
  g.lineWidth = s * 0.015;
  g.stroke();
  // étiquette
  g.fillStyle = '#1a120a';
  g.fillRect(-s * 0.17, s * 0.05, s * 0.34, s * 0.12);
  g.restore();
}

function ornamentBar(g: CanvasRenderingContext2D, x0: number, x1: number, y: number) {
  g.save();
  g.fillStyle = metalGradient(g, y - 10, y + 10);
  g.strokeStyle = '#1a120a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x0, y);
  g.lineTo((x0 + x1) / 2, y - 6);
  g.lineTo(x1, y);
  g.lineTo((x0 + x1) / 2, y + 6);
  g.closePath();
  g.fill();
  g.stroke();
  for (const x of [x0, x1]) {
    g.beginPath();
    g.moveTo(x, y - 16); g.lineTo(x + 16, y); g.lineTo(x, y + 16); g.lineTo(x - 16, y);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();
}

export interface LogoTextures {
  color: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
  subColor: THREE.CanvasTexture;
  /** Position (UV) du blason sur la texture principale, pour le dernier scintillement. */
  crestUV: THREE.Vector2;
}

export function buildLogoTextures(): LogoTextures {
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return [c, c.getContext('2d')!] as const;
  };
  const [cc, gc] = mk();
  const [ce, ge] = mk();

  const crestY = 205;
  crest(gc, W / 2, crestY, 120);
  const a = metalText(gc, 'ALCOOLIQUE', W / 2, 560, 236, 900, 10);
  const q = metalText(gc, 'QUEST', W / 2, 760, 150, 700, 46);
  ornamentBar(gc, 330, 720, 712);
  ornamentBar(gc, W - 720, W - 330, 712);
  weather(gc, 4, [100, a.top - 20, W - 100, q.bottom + 20]);
  // copie du métal dans le masque d'émission pour y limiter les fissures
  ge.drawImage(cc, 0, 0);
  ge.globalCompositeOperation = 'source-in';
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  ge.globalCompositeOperation = 'source-over';
  cracks(gc, ge, 9, [[560, 470], [900, 520], [1230, 450], [1560, 500], [930, 700], [1130, 735]], 120);
  // halo doré très léger sur le contour (aura)
  const glow = document.createElement('canvas');
  glow.width = W;
  glow.height = H;
  const gg = glow.getContext('2d')!;
  gg.filter = 'blur(18px)';
  gg.drawImage(cc, 0, 0);
  ge.save();
  ge.globalAlpha = 0.18;
  ge.globalCompositeOperation = 'lighter';
  ge.drawImage(glow, 0, 0);
  ge.restore();

  const [cs, gs] = mk();
  metalText(gs, 'LA SOBRIÉTÉ PERDUE', W / 2, 560, 92, 400, 34);
  ornamentBar(gs, 520, 760, 610);
  ornamentBar(gs, W - 760, W - 520, 610);

  const t = (c: HTMLCanvasElement) => {
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = 8;
    return tx;
  };
  const emissive = new THREE.CanvasTexture(ce);
  return { color: t(cc), emissive, subColor: t(cs), crestUV: new THREE.Vector2(0.5, 1 - crestY / H) };
}

/** Matériau du logo : dissolution brûlante, reflet balayant, fissures pulsées. */
export function logoMaterial(map: THREE.Texture, emissive: THREE.Texture | null, glowColor: THREE.ColorRepresentation) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uEmissive: { value: emissive },
      uHasEmissive: { value: emissive ? 1 : 0 },
      uReveal: { value: 0 },
      uShimmer: { value: -1 },
      uGlow: { value: 1 },
      uTime: { value: 0 },
      uGlowColor: { value: new THREE.Color(glowColor) },
      uOpacity: { value: 1 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap, uEmissive;
      uniform float uReveal, uShimmer, uGlow, uTime, uHasEmissive, uOpacity;
      uniform vec3 uGlowColor;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.1; a*=0.5; } return s; }
      void main(){
        vec4 c = texture2D(uMap, vUv);
        // dissolution depuis le centre, bord incandescent
        float d = length((vUv - vec2(0.5, 0.52)) * vec2(1.6, 1.0));
        float field = d * 1.25 + fbm(vUv * 9.0) * 0.45;
        float th = uReveal * 1.6;
        float m = smoothstep(th, th - 0.05, field);
        float edge = smoothstep(th - 0.09, th - 0.02, field) * m;
        vec3 col = c.rgb;
        // reflet métallique qui balaie le logo en diagonale
        float band = exp(-pow((vUv.x + vUv.y * 0.35 - uShimmer) * 18.0, 2.0));
        col += vec3(1.0, 0.92, 0.75) * band * 0.55 * c.a;
        // fissures lumineuses
        float e = uHasEmissive > 0.5 ? texture2D(uEmissive, vUv).r : 0.0;
        float pulse = 0.65 + 0.35 * sin(uTime * 2.2 + vUv.x * 6.0);
        col += uGlowColor * e * uGlow * pulse * 2.2;
        col += vec3(1.0, 0.55, 0.15) * edge * 3.0 * c.a;
        gl_FragColor = vec4(col, c.a * m * uOpacity);
        if (gl_FragColor.a < 0.004) discard;
      }`,
    transparent: true,
    depthWrite: false,
  });
}
