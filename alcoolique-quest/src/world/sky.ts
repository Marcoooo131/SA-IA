// Voûte céleste : dégradé atmosphérique, disque solaire et halo, voile nuageux procédural.
import * as THREE from 'three';

export interface SkyOpts {
  top: THREE.ColorRepresentation;
  horizon: THREE.ColorRepresentation;
  bottom: THREE.ColorRepresentation;
  sunDir: THREE.Vector3;
  sunColor: THREE.ColorRepresentation;
  sunSize?: number;
  glow?: number;
  clouds?: number;
  cloudColor?: THREE.ColorRepresentation;
  radius?: number;
}

export function skyDome(o: SkyOpts) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(o.top) },
      uHorizon: { value: new THREE.Color(o.horizon) },
      uBottom: { value: new THREE.Color(o.bottom) },
      uSunDir: { value: o.sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(o.sunColor) },
      uSunSize: { value: o.sunSize ?? 0.9993 },
      uGlow: { value: o.glow ?? 1 },
      uClouds: { value: o.clouds ?? 0.5 },
      uCloudColor: { value: new THREE.Color(o.cloudColor ?? '#2a2a35') },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
        gl_Position.z = p.w * 0.99995; // juste devant le plan lointain : jamais rogné
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uBottom, uSunColor, uCloudColor;
      uniform vec3 uSunDir;
      uniform float uSunSize, uGlow, uClouds, uTime;
      varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=a*n(p); p*=2.1; a*=0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(y, 0.75)) : mix(uHorizon, uBottom, pow(-y, 0.4));
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        // halo solaire large + serré
        col += uSunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 64.0) * 0.8) * uGlow;
        col += uSunColor * smoothstep(uSunSize, uSunSize + 0.0004, sd) * 8.0;
        // voile nuageux stratifié (bandes étirées près de l'horizon)
        if (y > -0.02 && uClouds > 0.0) {
          vec2 uv = d.xz / (y + 0.12);
          float c = fbm(uv * vec2(1.2, 3.0) + vec2(uTime * 0.01, 0.0));
          c = smoothstep(0.45, 0.85, c) * uClouds * smoothstep(-0.02, 0.15, y);
          vec3 cc = mix(uCloudColor, uSunColor * 1.2, pow(sd, 8.0) * 0.8);
          col = mix(col, cc, c);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(o.radius ?? 9000, 48, 24), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

/** Éclairage standard : soleil directionnel (ombres optionnelles) + ciel hémisphérique. */
export function sunlight(scene: THREE.Scene, opts: { dir: THREE.Vector3; color: THREE.ColorRepresentation; intensity: number; sky: THREE.ColorRepresentation; ground: THREE.ColorRepresentation; hemi: number }) {
  const sun = new THREE.DirectionalLight(opts.color, opts.intensity);
  sun.position.copy(opts.dir).normalize().multiplyScalar(100);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(opts.sky, opts.ground, opts.hemi);
  scene.add(hemi);
  return { sun, hemi };
}

/**
 * Lumière d'appoint attachée à la caméra (comme un réflecteur de plateau) : détache les sujets à contre-jour.
 * À mettre à jour chaque image avec `follow`.
 */
export function cameraFill(scene: THREE.Scene, color: THREE.ColorRepresentation, intensity: number) {
  const l = new THREE.DirectionalLight(color, intensity);
  scene.add(l, l.target);
  return {
    light: l,
    follow(cam: THREE.Camera, look: THREE.Vector3) {
      l.position.copy(cam.position).add(new THREE.Vector3(0, 2, 0));
      l.target.position.copy(look);
    },
  };
}
