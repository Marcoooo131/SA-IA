// Le « réalisateur » : rendu WebGL, chaîne de post-production (bloom, profondeur de champ, étalonnage,
// grain, vignettage, aberration, flashs) et aiguillage vers la scène active selon la timeline.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SCENE_RANGES, fadeAt, type SceneKey } from './timeline';
import { POINT_SCALE } from '../fx/particles';

export type Quality = 'low' | 'high';

export interface PostParams {
  exposure: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  dof: { focus: number; aperture: number; maxblur: number } | null;
  flash: number;
  flashColor: THREE.ColorRepresentation;
  invert: number;
  aberration: number;
  grain: number;
  vignette: number;
  saturation: number;
  contrast: number;
  lift: THREE.Vector3Tuple;
  gain: THREE.Vector3Tuple;
  fade: number;
}

export const DEFAULT_POST: PostParams = {
  exposure: 1,
  bloomStrength: 0.55,
  bloomRadius: 0.55,
  bloomThreshold: 0.82,
  dof: null,
  flash: 0,
  flashColor: '#ffffff',
  invert: 0,
  aberration: 0.006,
  grain: 0.045,
  vignette: 1,
  saturation: 0.92,
  contrast: 1.06,
  // Étalonnage « dark fantasy » : ombres bleu nuit, hautes lumières dorées.
  lift: [0.012, 0.018, 0.035],
  gain: [1.03, 1.0, 0.95],
  fade: 1,
};

export interface CineScene {
  key: SceneKey;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(t: number, dt: number): void;
  post(t: number): Partial<PostParams>;
  /** Mode « accueil » : la scène du titre tourne en boucle derrière le menu provisoire. */
  setMode?(mode: 'cinematic' | 'home'): void;
}

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uGrain: { value: 0.04 },
    uVignette: { value: 1 },
    uAberration: { value: 0.01 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color() },
    uInvert: { value: 0 },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uLift: { value: new THREE.Vector3() },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uFade, uGrain, uVignette, uAberration, uFlash, uInvert, uSaturation, uContrast, uAspect;
    uniform vec3 uFlashColor, uLift, uGain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float ab = uAberration * dot(c, c) * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - c * ab).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + c * ab).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      col = max(col, 0.0) * uGain + uLift * (1.0 - col);
      vec2 vc = c * vec2(uAspect / 1.6, 1.0);
      float vig = smoothstep(0.95, 0.18, length(vc) * 1.05);
      col *= mix(1.0, vig, 0.75 * uVignette);
      float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime * 7.13) * 100.0) - 0.5;
      col += g * uGrain * (0.6 + 0.4 * (1.0 - l));
      col = mix(col, 1.0 - col, uInvert);
      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
      col *= uFade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Director {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private bokeh: BokehPass | null = null;
  private final: ShaderPass;
  private scenes = new Map<SceneKey, CineScene>();
  private pixelRatio: number;
  private maxPixelRatio: number;
  private frameTimes: number[] = [];
  width = 1280;
  height = 720;
  activeKey: SceneKey | null = null;

  constructor(public canvas: HTMLCanvasElement, public quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.5 : 1);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);

    const rt = new THREE.WebGLRenderTarget(this.width, this.height, {
      type: THREE.HalfFloatType,
      samples: quality === 'high' ? 4 : 0,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    const dummyScene = new THREE.Scene();
    const dummyCam = new THREE.PerspectiveCamera();
    this.renderPass = new RenderPass(dummyScene, dummyCam);
    this.composer.addPass(this.renderPass);
    if (quality === 'high') {
      this.bokeh = new BokehPass(dummyScene, dummyCam, { focus: 10, aperture: 0.002, maxblur: 0.008 });
      this.bokeh.enabled = false;
      this.composer.addPass(this.bokeh);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.6, 0.5, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
  }

  add(s: CineScene) {
    this.scenes.set(s.key, s);
  }
  get(key: SceneKey) {
    return this.scenes.get(key)!;
  }

  /** Le canevas occupe une boîte 16:9 centrée (bandes noires si l'écran a un autre ratio). */
  resize(viewW: number, viewH: number) {
    const target = 16 / 9;
    let w = viewW, h = viewW / target;
    if (h > viewH) { h = viewH; w = viewH * target; }
    this.width = Math.max(2, Math.round(w));
    this.height = Math.max(2, Math.round(h));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.applySize();
  }

  private applySize() {
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);
    this.final.uniforms.uAspect.value = this.width / this.height;
    POINT_SCALE.value = this.height * this.pixelRatio * 1.37;
    for (const s of this.scenes.values()) {
      s.camera.aspect = this.width / this.height;
      s.camera.updateProjectionMatrix();
    }
  }

  /** Résolution dynamique : on baisse la définition si l'appareil peine, pour garder un mouvement fluide. */
  adapt(dtMs: number) {
    this.frameTimes.push(dtMs);
    if (this.frameTimes.length < 45) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    let next = this.pixelRatio;
    if (avg > 30) next = Math.max(0.55, this.pixelRatio - 0.15);
    else if (avg < 15) next = Math.min(this.maxPixelRatio, this.pixelRatio + 0.1);
    if (Math.abs(next - this.pixelRatio) > 0.01) {
      this.pixelRatio = next;
      this.applySize();
    }
  }

  sceneKeyAt(t: number): SceneKey {
    for (const [k, [a, b]] of Object.entries(SCENE_RANGES) as [SceneKey, [number, number]][]) {
      if (t >= a && t < b) return k;
    }
    return 'title';
  }

  /** Compile les shaders de toutes les scènes en amont pour éviter les à-coups lors des changements de plan. */
  warmup() {
    for (const s of this.scenes.values()) {
      this.renderer.compile(s.scene, s.camera);
    }
  }

  /** Fait avancer la scène sans la dessiner (préparation des captures). */
  simulate(t: number, dt: number) {
    this.scenes.get(this.sceneKeyAt(t))?.update(t, dt);
  }

  render(t: number, dt: number, opts: { key?: SceneKey; fade?: number } = {}) {
    const key = opts.key ?? this.sceneKeyAt(t);
    const s = this.scenes.get(key);
    if (!s) return;
    this.activeKey = key;
    s.update(t, dt);
    const p: PostParams = { ...DEFAULT_POST, ...s.post(t) };
    p.fade = (opts.fade ?? fadeAt(t)) * (s.post(t).fade ?? 1);

    this.renderer.toneMappingExposure = p.exposure;
    this.renderPass.scene = s.scene;
    this.renderPass.camera = s.camera;
    this.bloom.strength = p.bloomStrength;
    this.bloom.radius = p.bloomRadius;
    this.bloom.threshold = p.bloomThreshold;
    if (this.bokeh) {
      this.bokeh.enabled = !!p.dof;
      if (p.dof) {
        (this.bokeh as unknown as { scene: THREE.Scene }).scene = s.scene;
        (this.bokeh as unknown as { camera: THREE.Camera }).camera = s.camera;
        const u = this.bokeh.uniforms as Record<string, THREE.IUniform>;
        u.focus.value = p.dof.focus;
        u.aperture.value = p.dof.aperture;
        u.maxblur.value = p.dof.maxblur;
        u.nearClip.value = s.camera.near;
        u.farClip.value = s.camera.far;
        u.aspect.value = s.camera.aspect;
      }
    }
    const u = this.final.uniforms;
    u.uTime.value = t;
    u.uFade.value = p.fade;
    u.uGrain.value = p.grain;
    u.uVignette.value = p.vignette;
    u.uAberration.value = p.aberration;
    u.uFlash.value = p.flash;
    (u.uFlashColor.value as THREE.Color).set(p.flashColor);
    u.uInvert.value = p.invert;
    u.uSaturation.value = p.saturation;
    u.uContrast.value = p.contrast;
    (u.uLift.value as THREE.Vector3).set(...p.lift);
    (u.uGain.value as THREE.Vector3).set(...p.gain);

    if (p.fade <= 0.001) {
      // Écran noir : inutile de rendre la scène.
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
    } else {
      this.composer.render(dt);
    }
  }
}
