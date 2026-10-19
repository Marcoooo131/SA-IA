// Système de particules GPU (Points) avec pool fixe : braises, étincelles, poussière, motes magiques, cendres.
import * as THREE from 'three';
import { softDot } from '../world/textures';

export interface EmitOpts {
  pos: THREE.Vector3;
  spread?: number | THREE.Vector3;
  vel?: THREE.Vector3;
  velSpread?: number;
  life?: [number, number];
  size?: [number, number];
  color?: THREE.ColorRepresentation;
  color2?: THREE.ColorRepresentation;
  gravity?: number;
  drag?: number;
  alpha?: number;
}

/** Uniforme partagé : focale en pixels (mise à jour au redimensionnement) pour des particules à taille physique. */
export const POINT_SCALE = { value: 900 };

const vtx = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.05, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor, t.a * vAlpha);
    if (gl_FragColor.a < 0.003) discard;
  }`;

export class Particles extends THREE.Points {
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseSize: Float32Array;
  private sizeAttr: Float32Array;
  private alphaAttr: Float32Array;
  private colAttr: Float32Array;
  private params: Float32Array; // gravity, drag, alpha
  private cursor = 0;
  readonly capacity: number;

  constructor(capacity: number, opts: { additive?: boolean; map?: THREE.Texture } = {}) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(capacity * 3).fill(0);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const size = new Float32Array(capacity);
    const alpha = new Float32Array(capacity);
    const col = new Float32Array(capacity * 3);
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: opts.map ?? softDot() }, uScale: POINT_SCALE },
      vertexShader: vtx,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    super(geo, mat);
    this.frustumCulled = false;
    this.capacity = capacity;
    this.pos = pos;
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.baseSize = new Float32Array(capacity);
    this.sizeAttr = size;
    this.alphaAttr = alpha;
    this.colAttr = col;
    this.params = new Float32Array(capacity * 3);
  }

  emit(n: number, o: EmitOpts) {
    const c1 = new THREE.Color(o.color ?? '#ffffff');
    const c2 = new THREE.Color(o.color2 ?? o.color ?? '#ffffff');
    const tmp = new THREE.Color();
    const life = o.life ?? [0.6, 1.4];
    const size = o.size ?? [0.1, 0.3];
    const vs = o.velSpread ?? 1;
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const sp = o.spread ?? 0;
      const sx = typeof sp === 'number' ? sp : sp.x, sy = typeof sp === 'number' ? sp : sp.y, sz = typeof sp === 'number' ? sp : sp.z;
      this.pos[i * 3] = o.pos.x + (Math.random() - 0.5) * 2 * sx;
      this.pos[i * 3 + 1] = o.pos.y + (Math.random() - 0.5) * 2 * sy;
      this.pos[i * 3 + 2] = o.pos.z + (Math.random() - 0.5) * 2 * sz;
      const v = o.vel ?? new THREE.Vector3();
      this.vel[i * 3] = v.x + (Math.random() - 0.5) * 2 * vs;
      this.vel[i * 3 + 1] = v.y + (Math.random() - 0.5) * 2 * vs;
      this.vel[i * 3 + 2] = v.z + (Math.random() - 0.5) * 2 * vs;
      const l = life[0] + Math.random() * (life[1] - life[0]);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.baseSize[i] = size[0] + Math.random() * (size[1] - size[0]);
      tmp.copy(c1).lerp(c2, Math.random());
      this.colAttr[i * 3] = tmp.r; this.colAttr[i * 3 + 1] = tmp.g; this.colAttr[i * 3 + 2] = tmp.b;
      this.params[i * 3] = o.gravity ?? 0;
      this.params[i * 3 + 1] = o.drag ?? 0.5;
      this.params[i * 3 + 2] = o.alpha ?? 1;
    }
  }

  update(dt: number) {
    dt = Math.min(dt, 0.1);
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) { this.alphaAttr[i] = 0; continue; }
      this.life[i] -= dt;
      const drag = Math.max(0, 1 - this.params[i * 3 + 1] * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - this.params[i * 3] * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      // apparition rapide, extinction douce
      this.alphaAttr[i] = Math.min(1, (1 - k) * 8) * k * this.params[i * 3 + 2];
      this.sizeAttr[i] = this.baseSize[i] * (0.6 + 0.4 * k);
    }
    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
  }

  reset() {
    this.life.fill(0);
    this.alphaAttr.fill(0);
  }
}

/** Nuage de particules ambiantes en boucle (poussière, cendres, motes) — positions animées dans le shader. */
export function ambientMotes(opts: {
  count: number;
  box: THREE.Vector3;
  center: THREE.Vector3;
  color: THREE.ColorRepresentation;
  size: number;
  speed?: THREE.Vector3;
  additive?: boolean;
  opacity?: number;
}) {
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(opts.count * 3);
  const seed = new Float32Array(opts.count);
  for (let i = 0; i < opts.count; i++) {
    p[i * 3] = (Math.random() - 0.5) * opts.box.x;
    p[i * 3 + 1] = (Math.random() - 0.5) * opts.box.y;
    p[i * 3 + 2] = (Math.random() - 0.5) * opts.box.z;
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: softDot() },
      uColor: { value: new THREE.Color(opts.color) },
      uSize: { value: opts.size },
      uBox: { value: opts.box },
      uSpeed: { value: opts.speed ?? new THREE.Vector3(0, 0.2, 0) },
      uOpacity: { value: opts.opacity ?? 1 },
      uScale: POINT_SCALE,
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uSize, uScale;
      uniform vec3 uBox, uSpeed;
      varying float vA;
      void main() {
        vec3 p = position + uSpeed * uTime * (0.5 + aSeed);
        p += vec3(sin(uTime * 0.7 + aSeed * 40.0), sin(uTime * 0.9 + aSeed * 17.0), cos(uTime * 0.6 + aSeed * 23.0)) * 0.6;
        p = mod(p + uBox * 0.5, uBox) - uBox * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = 0.4 + 0.6 * sin(uTime * 1.3 + aSeed * 60.0) * 0.5 + 0.3;
        gl_PointSize = uSize * (0.5 + aSeed) * uScale / max(0.05, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
      varying float vA;
      void main() { vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uColor, t.a * vA * uOpacity); }`,
    transparent: true,
    depthWrite: false,
    blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.position.copy(opts.center);
  pts.frustumCulled = false;
  return pts;
}
