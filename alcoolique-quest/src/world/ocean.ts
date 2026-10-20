// Mer agitée : vagues de Gerstner calculées dans le shader (espace monde), reflet du ciel par Fresnel,
// reflets du soleil, écume sur les crêtes, brouillard atmosphérique. Le maillage suit la caméra.
import * as THREE from 'three';
import { ASSETS } from './assets';

const WAVES = [
  // direction x, z, longueur d'onde, raideur
  [1.0, 0.3, 90, 0.16],
  [0.6, -0.8, 57, 0.14],
  [-0.4, 1.0, 37, 0.13],
  [0.9, 0.7, 23, 0.11],
  [-0.9, 0.35, 15, 0.09],
  [0.2, -1.0, 9.5, 0.08],
  [0.75, -0.25, 6.3, 0.06],
  [-0.6, -0.7, 4.1, 0.05],
];

export class Ocean extends THREE.Mesh {
  declare material: THREE.ShaderMaterial;
  constructor(opts: { size?: number; segments?: number; deep: THREE.ColorRepresentation; shallow: THREE.ColorRepresentation; sky: THREE.ColorRepresentation; sunDir: THREE.Vector3; sunColor: THREE.ColorRepresentation; fogColor: THREE.ColorRepresentation; fogDensity: number; amp?: number }) {
    const size = opts.size ?? 3000;
    const seg = opts.segments ?? 320;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    // densifier près du centre (caméra) : redistribution radiale des sommets
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (size / 2), z = p.getZ(i) / (size / 2);
      const r = Math.max(Math.abs(x), Math.abs(z));
      const k = r > 0 ? Math.pow(r, 2.2) / r : 0;
      p.setXYZ(i, x * k * (size / 2), 0, z * k * (size / 2));
    }
    const waves = WAVES.map((w) => new THREE.Vector4(w[0], w[1], w[2], w[3]));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWaves: { value: waves },
        uAmp: { value: opts.amp ?? 1 },
        uDeep: { value: new THREE.Color(opts.deep) },
        uShallow: { value: new THREE.Color(opts.shallow) },
        uSky: { value: new THREE.Color(opts.sky) },
        uSunDir: { value: opts.sunDir.clone().normalize() },
        uSunColor: { value: new THREE.Color(opts.sunColor) },
        uFogColor: { value: new THREE.Color(opts.fogColor) },
        uFogDensity: { value: opts.fogDensity },
        uRipple: { value: ASSETS.normals.water ?? null },
        uHasRipple: { value: ASSETS.normals.water ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime, uAmp;
        uniform vec4 uWaves[8];
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vCrest;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 p = wp.xyz;
          vec3 tangent = vec3(1.0, 0.0, 0.0), binormal = vec3(0.0, 0.0, 1.0);
          vec3 disp = vec3(0.0);
          float crest = 0.0;
          for (int i = 0; i < 8; i++) {
            vec4 w = uWaves[i];
            vec2 d = normalize(w.xy);
            float k = 6.28318 / w.z;
            float c = sqrt(9.8 / k);
            float a = w.w / k * uAmp;
            float f = k * (dot(d, wp.xz) - c * uTime);
            float steep = w.w * uAmp;
            disp.x += d.x * a * cos(f);
            disp.y += a * sin(f);
            disp.z += d.y * a * cos(f);
            tangent += vec3(-d.x * d.x * steep * sin(f), d.x * steep * cos(f), -d.x * d.y * steep * sin(f));
            binormal += vec3(-d.x * d.y * steep * sin(f), d.y * steep * cos(f), -d.y * d.y * steep * sin(f));
            crest += max(0.0, sin(f)) * steep;
          }
          p += disp;
          vWorld = p;
          vNormal = normalize(cross(binormal, tangent));
          vCrest = crest;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep, uShallow, uSky, uSunColor, uFogColor;
        uniform vec3 uSunDir;
        uniform float uFogDensity, uTime, uHasRipple;
        uniform sampler2D uRipple;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vCrest;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          float dist = length(cameraPosition - vWorld);
          // micro-vagues
          vec2 q = vWorld.xz * 0.35;
          float e = 0.6;
          float n0 = n(q + uTime * 0.6), nx = n(q + vec2(e, 0.0) + uTime * 0.6), nz = n(q + vec2(0.0, e) + uTime * 0.6);
          float detail = 0.35 / (1.0 + dist * 0.01);
          vec3 N = normalize(vNormal + vec3(n0 - nx, 0.0, n0 - nz) * detail * 2.0);
          if (uHasRipple > 0.5) {
            // ridules : deux couches de normal map CC0 qui défilent en sens contraires
            vec3 r1 = texture2D(uRipple, vWorld.xz * 0.045 + vec2(uTime * 0.02, uTime * 0.013)).xzy * 2.0 - 1.0;
            vec3 r2 = texture2D(uRipple, vWorld.xz * 0.11 - vec2(uTime * 0.017, -uTime * 0.025)).xzy * 2.0 - 1.0;
            float fade = 1.0 / (1.0 + dist * 0.004);
            N = normalize(N + vec3(r1.x + r2.x, 0.0, r1.z + r2.z) * 0.35 * fade);
          }
          float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.85 + 0.05;
          vec3 water = mix(uDeep, uShallow, clamp(vCrest * 0.8 + vWorld.y * 0.05, 0.0, 1.0));
          vec3 col = mix(water, uSky, fres);
          vec3 Hh = normalize(normalize(uSunDir) + V);
          float spec = pow(max(dot(N, Hh), 0.0), 220.0) * 6.0 + pow(max(dot(N, Hh), 0.0), 18.0) * 0.25;
          col += uSunColor * spec;
          // écume sur les crêtes
          float foam = smoothstep(0.55, 0.95, vCrest + n(vWorld.xz * 0.8 + uTime) * 0.35);
          col = mix(col, vec3(0.75, 0.78, 0.8), foam * 0.55);
          float fog = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
          col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    super(geo, mat);
    this.frustumCulled = false;
  }
  update(t: number, camera: THREE.Camera) {
    this.material.uniforms.uTime.value = t;
    // le maillage suit la caméra par pas réguliers (pas de glissement visible des sommets)
    const step = 40;
    this.position.set(Math.round(camera.position.x / step) * step, this.position.y, Math.round(camera.position.z / step) * step);
  }
}
