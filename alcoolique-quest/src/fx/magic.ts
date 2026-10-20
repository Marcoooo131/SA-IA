// Effets visuels : cercles runiques, halos, ondes de choc, traînées de lame, éclairs, rayons divins, brume au sol.
import * as THREE from 'three';
import { cracksTex, runeCircleTex, softDot } from '../world/textures';
import { rng } from '../core/math';

const additive = (map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });

/** Halo lumineux toujours face caméra. */
export function glow(color: THREE.ColorRepresentation, size: number, opacity = 1) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: softDot(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
  );
  s.scale.setScalar(size);
  return s;
}

/** Cercle runique plat (au sol ou dans les airs). */
export function runeCircle(color: THREE.ColorRepresentation, radius: number, seed = 3) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), additive(runeCircleTex(seed), color, 1));
  m.renderOrder = 5;
  return m;
}

/** Fissures lumineuses au sol. */
export function groundCracks(color: THREE.ColorRepresentation, radius: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), additive(cracksTex(9), color, 1));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  return m;
}

/** Anneau d'onde de choc (s'étend puis disparaît). */
export class Shockwave extends THREE.Mesh {
  constructor(color: THREE.ColorRepresentation) {
    const geo = new THREE.RingGeometry(0.85, 1, 64);
    super(geo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.visible = false;
  }
  /** u : progression 0→1 de l'onde ; radius : rayon final. */
  set(u: number, radius: number) {
    this.visible = u > 0 && u < 1;
    const r = 0.2 + radius * (1 - Math.pow(1 - u, 3));
    this.scale.setScalar(r);
    (this.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 1.4;
  }
}

/** Traînée lumineuse d'une lame : ruban construit à partir de l'historique base/pointe de l'arme. */
export class BladeTrail extends THREE.Mesh {
  private n: number;
  private base: THREE.Vector3[] = [];
  private tip: THREE.Vector3[] = [];
  private positions: Float32Array;

  constructor(color: THREE.ColorRepresentation, segments = 24) {
    const geo = new THREE.BufferGeometry();
    const n = segments;
    const pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      uv[i * 4] = i / (n - 1); uv[i * 4 + 1] = 0;
      uv[i * 4 + 2] = i / (n - 1); uv[i * 4 + 3] = 1;
      if (i < n - 1) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
        void main(){ float a = pow(1.0 - vUv.x, 2.0) * smoothstep(0.2, 1.0, vUv.y) * uOpacity * 0.75; gl_FragColor = vec4(uColor * (0.6 + vUv.y * 1.2), a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    super(geo, mat);
    this.n = n;
    this.positions = pos;
    this.frustumCulled = false;
  }
  reset() {
    this.base.length = 0;
    this.tip.length = 0;
  }
  push(base: THREE.Vector3, tip: THREE.Vector3) {
    this.base.unshift(base.clone());
    this.tip.unshift(tip.clone());
    if (this.base.length > this.n) { this.base.pop(); this.tip.pop(); }
    for (let i = 0; i < this.n; i++) {
      const b = this.base[Math.min(i, this.base.length - 1)] ?? base;
      const t = this.tip[Math.min(i, this.tip.length - 1)] ?? tip;
      this.positions.set([b.x, b.y, b.z], i * 6);
      this.positions.set([t.x, t.y, t.z], i * 6 + 3);
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
  set opacity(v: number) {
    (this.material as THREE.ShaderMaterial).uniforms.uOpacity.value = v;
  }
}

/** Éclair : polyligne fractale épaissie en ruban (cœur + halo). `dark` pour l'éclair noir de la prêtresse. */
export function lightningBolt(from: THREE.Vector3, to: THREE.Vector3, seed: number, opts: { dark?: boolean; width?: number; color?: THREE.ColorRepresentation } = {}) {
  const r = rng(seed);
  let pts = [from.clone(), to.clone()];
  let disp = from.distanceTo(to) * 0.18;
  for (let gen = 0; gen < 6; gen++) {
    const next: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const mid = a.clone().lerp(b, 0.5);
      mid.x += r.range(-disp, disp);
      mid.y += r.range(-disp, disp);
      mid.z += r.range(-disp, disp) * 0.5;
      next.push(a, mid);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
    disp *= 0.55;
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const w = opts.width ?? 0.15;
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.TubeGeometry(curve, pts.length * 2, w, 5, false),
    opts.dark
      ? new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })
      : new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }),
  );
  const halo = new THREE.Mesh(
    new THREE.TubeGeometry(curve, pts.length * 2, w * (opts.dark ? 3.2 : 4), 6, false),
    new THREE.MeshBasicMaterial({ color: opts.color ?? (opts.dark ? 0x8a3cff : 0x9fc4ff), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
  );
  g.add(halo, core);
  return g;
}

/** Rayon de lumière volumétrique (cône additif avec atténuation sur les bords). */
export function godRay(opts: { length: number; radiusTop: number; radiusBottom: number; color: THREE.ColorRepresentation; opacity?: number }) {
  const geo = new THREE.CylinderGeometry(opts.radiusTop, opts.radiusBottom, opts.length, 32, 1, true);
  geo.translate(0, -opts.length / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(opts.color) }, uOpacity: { value: opts.opacity ?? 0.4 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        vY = uv.y;
        vec4 wp = modelMatrix * vec4(position,1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
        float fall = smoothstep(0.0, 0.35, vY) * smoothstep(1.0, 0.85, vY);
        float flick = 0.9 + 0.1 * sin(uTime * 2.0 + vY * 6.0);
        gl_FragColor = vec4(uColor, edge * fall * uOpacity * flick);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geo, mat);
}

/** Nappe de brume rampante (plan avec bruit animé). */
export function groundMist(size: number, color: THREE.ColorRepresentation, opacity = 0.5, scale = 0.05, soft: [number, number] = [0.3, 0.8]) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uScale: { value: scale }, uSoft: { value: new THREE.Vector2(...soft) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity, uScale; uniform vec2 uSoft; uniform vec3 uColor; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        vec2 p = vW.xz * uScale;
        float f = fbm(p + vec2(uTime*0.05, uTime*0.02));
        f = fbm(p + f * 2.0 - vec2(uTime*0.03, 0.0));
        float a = smoothstep(uSoft.x, uSoft.y, f) * uOpacity;
        vec3 col = uColor * (0.82 + 0.25 * f);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  return m;
}

/** Cercle runique « tracé » progressivement : uReveal (0→1) balaie l'angle, uIntensity le fait flamboyer. */
export function drawnRuneCircle(color: THREE.ColorRepresentation, radius: number, seed = 3) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: runeCircleTex(seed) }, uColor: { value: new THREE.Color(color) }, uReveal: { value: 0 }, uIntensity: { value: 1 }, uOpacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uReveal, uIntensity, uOpacity;
      varying vec2 vUv;
      void main(){
        vec2 c = vUv - 0.5;
        float ang = (atan(c.y, c.x) + 3.14159265) / 6.2831853;
        float edge = smoothstep(uReveal, uReveal - 0.03, ang);
        float a = texture2D(uMap, vUv).a * edge * uOpacity;
        // la pointe du tracé brille plus fort
        float tip = smoothstep(0.04, 0.0, abs(ang - uReveal)) * step(0.001, uReveal) * step(uReveal, 0.999);
        gl_FragColor = vec4(uColor * (uIntensity + tip * 4.0), a + tip * texture2D(uMap, vUv).a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  m.renderOrder = 5;
  return m;
}

/** Disque de portail : tourbillon de lumière en coordonnées polaires. */
export function portalDisc(color: THREE.ColorRepresentation, radius: number) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity; uniform vec3 uColor; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 c = (vUv - 0.5) * 2.0;
        float r = length(c);
        float a = atan(c.y, c.x);
        float sw = n(vec2(a * 3.0 + r * 6.0 - uTime * 3.0, r * 4.0 - uTime)) * 0.7 + n(vec2(a * 7.0 - r * 9.0 + uTime * 2.0, r * 8.0)) * 0.3;
        float core = smoothstep(1.0, 0.0, r);
        float rim = smoothstep(0.75, 0.95, r) * smoothstep(1.0, 0.95, r);
        float alpha = (sw * core * 0.9 + rim * 1.5) * smoothstep(1.0, 0.97, r) * uOpacity;
        vec3 col = mix(uColor, vec3(1.0), smoothstep(0.4, 0.0, r) * 0.6);
        gl_FragColor = vec4(col * (0.6 + sw), alpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(new THREE.CircleGeometry(radius, 48), mat);
}
