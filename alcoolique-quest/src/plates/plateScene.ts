// Plans « images de fond animées » (matte paintings) : une image par plan, animée en 2,5D
// (cadrage qui glisse, profondeur/parallaxe, brume, rayons de soleil, eau qui scintille, ombres de nuages,
// particules), avec l'aigle 3D intégré au premier plan. Les plans sans image gardent la scène 3D.
//
// Les plans sont décrits dans public/plates/manifest.json (voir PLATES.md).
import * as THREE from 'three';
import type { CineScene, PostParams } from '../core/director';
import { SHOTS } from '../core/timeline';
import { clamp, ease, lerp } from '../core/math';
import { Eagle } from '../world/eagle';
import { Particles } from '../fx/particles';
import { cloudPuff } from '../world/textures';
import { ASSETS } from '../world/assets';

export interface PlateMove { x?: number; y?: number; zoom?: number; rot?: number }
export interface PlateDef {
  /** Identifiant de plan de la timeline (ex. « 2a ») ou intervalle explicite. */
  shot?: string;
  start?: number;
  end?: number;
  image: string;
  /** Recadrage de l'image source [x, y, largeur, hauteur] en fractions (ex. pour retirer des bandes noires). */
  crop?: [number, number, number, number];
  /** Carte de profondeur facultative (blanc = proche). Sinon : estimation (bas de l'image = proche, brume = loin). */
  depth?: string;
  from?: PlateMove;
  to?: PlateMove;
  /** Amplitude de parallaxe (en fraction d'image) pendant le plan. */
  parallax?: [number, number];
  easing?: 'linear' | 'inOut' | 'out';
  mist?: { color?: string; amount?: number; height?: number; speed?: number };
  rays?: { x: number; y: number; strength?: number; color?: string };
  /** Zone d'eau (au-dessous de y, en coordonnées image 0 = haut, 1 = bas) : scintillement et ondulation. */
  water?: { y: number; strength?: number };
  cloudShadows?: number;
  particles?: 'dust' | 'embers' | 'ash' | 'snow' | 'feathers' | 'none';
  /** Aigle 3D : position écran (x, y en -1..1), taille relative, cap (radians) au début et à la fin. */
  eagle?: { from: [number, number, number]; to: [number, number, number]; heading?: number; bank?: number; flap?: number };
  grade?: Partial<PostParams>;
  fadeIn?: number;
  fadeOut?: number;
}

const DEPTH_FROM_IMAGE = /* glsl */ `
  // estimation de profondeur sans carte : le bas de l'image est proche, les zones claires et peu contrastées
  // (brume atmosphérique, ciel) sont lointaines.
  float estDepth(vec2 uv) {
    vec3 c = img(uv, 4.0).rgb;
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    float d = smoothstep(0.25, 1.0, uv.y);
    d = mix(d, d * 0.5, smoothstep(0.55, 0.95, lum) * (1.0 - sat * 2.0));
    return clamp(d, 0.0, 1.0);
  }`;

function plateMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null as THREE.Texture | null },
      uDepth: { value: null as THREE.Texture | null },
      uHasDepth: { value: 0 },
      uPan: { value: new THREE.Vector2() },
      uZoom: { value: 1 },
      uRot: { value: 0 },
      uPar: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uAspect: { value: 16 / 9 },
      uImgAspect: { value: 16 / 9 },
      uMist: { value: new THREE.Vector4(1, 1, 1, 0) },
      uMistH: { value: 0.6 },
      uMistSpeed: { value: 1 },
      uRays: { value: new THREE.Vector4(0.5, 0.2, 0, 0) },
      uRayCol: { value: new THREE.Color(1, 0.95, 0.85) },
      uWater: { value: new THREE.Vector2(2, 0) },
      uCloudSh: { value: 0 },
      uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap, uDepth;
      uniform float uHasDepth, uZoom, uRot, uTime, uAspect, uImgAspect, uMistH, uMistSpeed, uCloudSh;
      uniform vec2 uPan, uPar, uWater;
      uniform vec4 uMist, uRays, uCrop;
      uniform vec3 uRayCol;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
      vec4 img(vec2 uv) { return texture2D(uMap, uCrop.xy + clamp(uv, 0.0, 1.0) * uCrop.zw); }
      vec4 img(vec2 uv, float bias) { return texture2D(uMap, uCrop.xy + clamp(uv, 0.0, 1.0) * uCrop.zw, bias); }
      ${DEPTH_FROM_IMAGE}
      vec2 frame(vec2 uv) {
        // recadrage « cover » : l'image remplit l'écran quel que soit son format
        vec2 c = uv - 0.5;
        c.x *= uAspect;
        float cr = cos(uRot), sr = sin(uRot);
        c = mat2(cr, -sr, sr, cr) * c;
        c /= uZoom;
        c.x /= uAspect;
        float s = uAspect / uImgAspect;
        if (s < 1.0) c.x *= s; else c.y /= s;
        return c + 0.5 + uPan;
      }
      void main() {
        vec2 uv = frame(vUv);
        uv.y = 1.0 - uv.y; // écran (0 = bas) → image (0 = haut)
        float d = uHasDepth > 0.5 ? texture2D(uDepth, uv).r : estDepth(vec2(uv.x, uv.y));
        // parallaxe : les plans proches glissent davantage que les lointains (deux itérations pour l'occlusion)
        vec2 off = uPar * (d - 0.35);
        float d2 = uHasDepth > 0.5 ? texture2D(uDepth, uv + off).r : estDepth(uv + off);
        uv += uPar * (mix(d, d2, 0.5) - 0.35);
        // eau : ondulation et scintillement sous la ligne d'horizon de la zone d'eau
        float wk = smoothstep(uWater.x, uWater.x + 0.04, uv.y) * uWater.y;
        if (wk > 0.0) {
          float persp = 0.4 + (uv.y - uWater.x) * 3.0;
          uv.x += (n(vec2(uv.x * 40.0, uv.y * 160.0 * persp + uTime * 1.5)) - 0.5) * 0.004 * wk;
          uv.y += (n(vec2(uv.x * 30.0 + uTime * 0.7, uv.y * 120.0 * persp)) - 0.5) * 0.003 * wk;
        }
        vec3 col = img(uv).rgb;
        if (wk > 0.0) {
          float glint = pow(n(vec2(uv.x * 260.0 + uTime * 0.8, uv.y * 900.0 - uTime * 1.6)), 14.0);
          float lum = dot(col, vec3(0.333));
          col += vec3(1.0, 0.97, 0.9) * glint * smoothstep(0.35, 0.8, lum) * 1.4 * wk;
        }
        // ombres de nuages qui défilent sur le paysage (surtout les plans proches)
        if (uCloudSh > 0.0) {
          float cs = smoothstep(0.45, 0.75, fbm(uv * vec2(3.0, 6.0) + vec2(uTime * 0.025, uTime * 0.01)));
          col *= 1.0 - cs * uCloudSh * smoothstep(0.3, 0.8, d);
        }
        // brume qui dérive, plus dense au loin et vers le bas
        if (uMist.a > 0.0) {
          float m = fbm(vec2(uv.x * 3.0 - uTime * 0.02 * uMistSpeed, uv.y * 7.0) + fbm(uv * 5.0 + uTime * 0.01 * uMistSpeed));
          float band = smoothstep(uMistH - 0.25, uMistH + 0.2, uv.y) * (1.0 - smoothstep(0.92, 1.0, uv.y) * 0.5);
          float k = smoothstep(0.35, 0.85, m) * band * uMist.a * (1.0 - smoothstep(0.2, 0.8, d));
          col = mix(col, uMist.rgb, clamp(k, 0.0, 1.0));
        }
        // rayons de soleil (diffusion radiale depuis la source)
        if (uRays.z > 0.0) {
          vec2 s = uRays.xy;
          vec2 dir = uv - s;
          float acc = 0.0;
          for (int i = 0; i < 24; i++) {
            vec2 p = s + dir * (float(i) / 24.0);
            vec3 c2 = img(p, 3.0).rgb;
            acc += smoothstep(0.7, 1.0, dot(c2, vec3(0.333)));
          }
          acc /= 24.0;
          float fall = 1.0 - smoothstep(0.0, 0.6, length(dir * vec2(uImgAspect, 1.0)));
          float flick = 0.85 + 0.15 * fbm(vec2(atan(dir.y, dir.x) * 8.0, uTime * 0.2));
          col += uRayCol * acc * fall * uRays.z * flick;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthWrite: false,
    depthTest: false,
  });
}

export class PlateScene implements CineScene {
  key = 'world' as const;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  private quad: THREE.Mesh;
  private mat = plateMaterial();
  private eagle = new Eagle();
  private particles: Particles;
  private sun = new THREE.DirectionalLight(0xfff0d8, 3);
  private defs: (PlateDef & { s: number; e: number; tex?: THREE.Texture; dtex?: THREE.Texture })[] = [];
  private current: (typeof this.defs)[number] | null = null;
  private lastT = 0;

  constructor() {
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.quad.renderOrder = -100;
    this.scene.add(this.quad);
    this.scene.add(this.sun, this.sun.target, new THREE.HemisphereLight(0xcfe0ff, 0x6a6a50, 1.0));
    this.eagle.visible = false;
    this.scene.add(this.eagle);
    this.particles = new Particles(1200, { additive: false, map: ASSETS.cloud ?? cloudPuff() });
    this.scene.add(this.particles);
    this.camera.position.set(0, 0, 0);
  }

  get count() {
    return this.defs.length;
  }

  /** Charge le manifeste et les images. Les plans dont l'image est introuvable sont ignorés. */
  async load(base: string) {
    let list: PlateDef[] = [];
    try {
      const res = await fetch(base + 'plates/manifest.json', { cache: 'no-cache' });
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return;
      list = (await res.json()).plates ?? [];
    } catch {
      return;
    }
    const tl = new THREE.TextureLoader();
    for (const p of list) {
      const shot = p.shot ? SHOTS.find((s) => s.id === p.shot) : null;
      const s = p.start ?? shot?.start, e = p.end ?? shot?.end;
      if (s === undefined || e === undefined) continue;
      try {
        const tex = await tl.loadAsync(base + p.image);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false; // v = 0 en haut de l'image : mêmes coordonnées que le manifeste
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.anisotropy = 8;
        let dtex: THREE.Texture | undefined;
        if (p.depth) dtex = await tl.loadAsync(base + p.depth).catch(() => undefined);
        if (dtex) dtex.flipY = false;
        this.defs.push({ ...p, s, e, tex, dtex });
      } catch (err) {
        console.warn('Image de plan introuvable', p.image, err);
      }
    }
  }

  /** Vrai si l'intervalle [a, b[ est entièrement couvert par des images. */
  coversRange(a: number, b: number) {
    let t = a;
    for (let guard = 0; t < b - 1e-3 && guard < 100; guard++) {
      const d = this.defs.find((x) => t >= x.s - 1e-3 && t < x.e);
      if (!d) return false;
      t = d.e;
    }
    return t >= b - 1e-3;
  }

  covers(t: number) {
    return this.defs.some((d) => t >= d.s && t < d.e);
  }

  update(t: number, dt: number) {
    const d = this.defs.find((x) => t >= x.s && t < x.e) ?? this.defs[0];
    if (!d) return;
    if (d !== this.current) {
      this.current = d;
      this.particles.reset();
    }
    const u0 = clamp((t - d.s) / (d.e - d.s));
    const u = d.easing === 'linear' ? u0 : d.easing === 'out' ? ease.outCubic(u0) : ease.inOutSine(u0);
    const f = d.from ?? {}, g = d.to ?? {};
    const U = this.mat.uniforms;
    U.uMap.value = d.tex;
    U.uDepth.value = d.dtex ?? null;
    U.uHasDepth.value = d.dtex ? 1 : 0;
    const cr = d.crop ?? [0, 0, 1, 1];
    (U.uCrop.value as THREE.Vector4).set(...cr);
    const im = d.tex?.image as HTMLImageElement | undefined;
    U.uImgAspect.value = im ? (im.width * cr[2]) / (im.height * cr[3]) : 16 / 9;
    U.uAspect.value = this.camera.aspect;
    U.uZoom.value = lerp(f.zoom ?? 1.08, g.zoom ?? 1.18, u);
    U.uRot.value = lerp(f.rot ?? 0, g.rot ?? 0, u);
    (U.uPan.value as THREE.Vector2).set(lerp(f.x ?? 0, g.x ?? 0, u), -lerp(f.y ?? 0, g.y ?? 0, u));
    const par = d.parallax ?? [0.02, 0.006];
    (U.uPar.value as THREE.Vector2).set((u - 0.5) * par[0], (u - 0.5) * par[1]);
    U.uTime.value = t;
    const mist = d.mist;
    (U.uMist.value as THREE.Vector4).set(...(new THREE.Color(mist?.color ?? '#e8eef4').toArray() as [number, number, number]), mist ? mist.amount ?? 0.35 : 0);
    U.uMistH.value = mist?.height ?? 0.6;
    U.uMistSpeed.value = mist?.speed ?? 1;
    (U.uRays.value as THREE.Vector4).set(d.rays?.x ?? 0.5, d.rays?.y ?? 0.2, d.rays ? d.rays.strength ?? 0.35 : 0, 0);
    (U.uRayCol.value as THREE.Color).set(d.rays?.color ?? '#fff2d8');
    (U.uWater.value as THREE.Vector2).set(d.water?.y ?? 2, d.water ? d.water.strength ?? 1 : 0);
    U.uCloudSh.value = d.cloudShadows ?? 0;

    // l'aigle 3D, composé devant l'image
    const e = d.eagle;
    this.eagle.visible = !!e;
    if (e) {
      const a = e.from, b = e.to;
      const sx = lerp(a[0], b[0], u), sy = lerp(a[1], b[1], u), sc = lerp(a[2], b[2], u);
      const dist = 6;
      const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist;
      this.eagle.position.set(sx * halfH * this.camera.aspect, sy * halfH, -dist);
      this.eagle.scale.setScalar(sc);
      this.eagle.rotation.set(0.25, (e.heading ?? Math.PI) + Math.atan2(b[0] - a[0], 1) * 0.3, (e.bank ?? 0) + Math.sin(t * 0.8) * 0.06);
      this.eagle.legsTuck = 1;
      this.eagle.fold = 0;
      this.eagle.flapAmp = e.flap ?? (Math.sin(t * 0.5) > 0.6 ? 0.6 : 0.05);
      this.eagle.flapFreq = 2.2;
      this.eagle.tailSpread = 0.5;
      this.eagle.ruffle = 1;
      this.eagle.update(dt);
      // la lumière vient du soleil de l'image (rayons) si elle est indiquée
      const sxs = d.rays ? (d.rays.x - 0.5) * 2 : 0.4, sys = d.rays ? (0.5 - d.rays.y) * 2 : 0.6;
      this.sun.position.set(sxs * 10, sys * 10 + 2, -8);
      this.sun.target.position.copy(this.eagle.position);
    }

    // particules d'ambiance
    const step = clamp(t - this.lastT, 0, 0.1);
    this.lastT = t;
    const kind = d.particles ?? 'none';
    if (kind !== 'none' && step > 0) {
      const conf = {
        dust: { c: 0xfff0d0, s: [0.02, 0.05], v: [0.3, 0.05, 0], g: -0.01, add: true },
        embers: { c: 0xff9a40, s: [0.03, 0.07], v: [0.2, 0.6, 0], g: -0.2, add: true },
        ash: { c: 0x1a1414, s: [0.04, 0.09], v: [0.3, -0.2, 0], g: 0.05, add: false },
        snow: { c: 0xffffff, s: [0.03, 0.06], v: [0.2, -0.5, 0], g: 0.1, add: false },
        feathers: { c: 0x0a0808, s: [0.06, 0.12], v: [0.1, -0.15, 0], g: 0.05, add: false },
      }[kind];
      this.particles.emit(Math.ceil(step * 40), {
        pos: new THREE.Vector3(0, 0, -5), spread: new THREE.Vector3(5, 3, 2),
        vel: new THREE.Vector3(...(conf.v as [number, number, number])), velSpread: 0.15,
        life: [2, 5], size: conf.s as [number, number], color: conf.c, gravity: conf.g, drag: 0.1, alpha: 0.8,
      });
    }
    this.particles.update(step);
  }

  post(t: number): Partial<PostParams> {
    const d = this.defs.find((x) => t >= x.s && t < x.e);
    if (!d) return {};
    let fade = 1;
    if (d.fadeIn) fade = Math.min(fade, clamp((t - d.s) / d.fadeIn));
    if (d.fadeOut) fade = Math.min(fade, clamp((d.e - t) / d.fadeOut));
    return { bloomStrength: 0.35, bloomThreshold: 0.88, grain: 0.035, aberration: 0.003, saturation: 1.02, contrast: 1.04, vignette: 0.9, lift: [0, 0, 0], gain: [1, 1, 1], ...d.grade, fade };
  }
}
