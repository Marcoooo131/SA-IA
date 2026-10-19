// SCÈNE 7 — LE TITRE (108 → 120 s) et fond animé de l'écran d'accueil provisoire.
import * as THREE from 'three';
import type { CineScene, PostParams, Quality } from '../core/director';
import { HITS } from '../core/timeline';
import { setCam } from '../core/camera';
import { clamp, ease, lerp, smoothstep } from '../core/math';
import { buildLogoTextures, logoMaterial } from '../world/logo';
import { makePriestess } from '../world/priestess';
import { softDot, starFlareTex } from '../world/textures';
import { Particles } from '../fx/particles';

export function createTitleScene(quality: Quality): CineScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 200);
  let mode: 'cinematic' | 'home' = 'cinematic';

  // fumée rougeâtre très sombre en fond
  const smoke = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 45),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uIntensity; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          vec2 p = vUv * vec2(6.0, 3.4);
          float f = fbm(p + vec2(uTime * 0.03, -uTime * 0.05));
          f = fbm(p + f * 1.8 + vec2(-uTime * 0.02, uTime * 0.01));
          float v = smoothstep(0.35, 1.0, f) * smoothstep(0.95, 0.2, length(vUv - vec2(0.5, 0.45)) * 1.4);
          vec3 col = mix(vec3(0.0), vec3(0.22, 0.05, 0.03), v) + vec3(0.08, 0.03, 0.1) * v * v;
          gl_FragColor = vec4(col * uIntensity, 1.0);
        }`,
      depthWrite: false,
    }),
  );
  smoke.position.z = -14;
  scene.add(smoke);

  // la prêtresse, en silhouette derrière le logo
  const pr = makePriestess();
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  pr.rig.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material !== pr.eyeMat) m.material = m.material === pr.featherMat ? new THREE.MeshBasicMaterial({ color: 0x000000, map: (pr.featherMat as THREE.MeshStandardMaterial).map, alphaTest: 0.45, side: THREE.DoubleSide }) : black;
  });
  pr.wings.forEach((w) => w.set(1, 0, 0));
  pr.rig.apply({ upperArmR: [-2.75, 0, -0.15], foreArmR: [-0.15, 0, 0], head: [-0.1, 0, 0] });
  pr.rig.scale.setScalar(3.4);
  pr.rig.position.set(0, -6.2, -9);
  scene.add(pr.rig);
  const backGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0x7a2aff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  backGlow.scale.set(26, 18, 1);
  backGlow.position.set(0, 0.5, -11);
  scene.add(backGlow);

  // le logo
  const tex = buildLogoTextures();
  const logoMat = logoMaterial(tex.color, tex.emissive, 0xff7a20);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), logoMat);
  logo.position.set(0, 0.35, 0);
  scene.add(logo);
  const subMat = logoMaterial(tex.subColor, null, 0xffffff);
  const sub = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), subMat);
  sub.position.set(0, -2.15, 0.01);
  sub.scale.setScalar(0.92);
  scene.add(sub);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xc98a3a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  aura.scale.set(16, 6, 1);
  aura.position.set(0, 0.4, -0.5);
  scene.add(aura);
  // le blason : dernier scintillement de la bouteille
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: starFlareTex(), color: 0xfff6e0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }));
  glint.position.set((tex.crestUV.x - 0.5) * 12, logo.position.y + (tex.crestUV.y - 0.5) * 6, 0.05);
  scene.add(glint);

  // particules noires et dorées
  const gold = new Particles(quality === 'high' ? 1600 : 800);
  const ash = new Particles(quality === 'high' ? 900 : 450, { additive: false });
  scene.add(gold, ash);
  let lastT = 0;

  const pos = new THREE.Vector3(), look = new THREE.Vector3();

  return {
    key: 'title',
    scene,
    camera,
    setMode(m) {
      mode = m;
    },
    update(t, dt) {
      // en mode accueil, t est une horloge libre : on fige le logo révélé
      const home = mode === 'home';
      const reveal = home ? 1 : ease.inOutSine(clamp((t - (HITS.titleBoom + 0.15)) / 3.2));
      logoMat.uniforms.uReveal.value = reveal;
      logoMat.uniforms.uTime.value = t;
      logoMat.uniforms.uGlow.value = home ? 0.9 : smoothstep(HITS.titleBoom + 1.5, HITS.titleBoom + 3.5, t);
      // reflet qui balaie le métal
      const sweep = home ? ((t * 0.12) % 1.6) - 0.3 : lerp(-0.3, 1.5, clamp((t - 112.4) / 2.2));
      logoMat.uniforms.uShimmer.value = sweep;
      subMat.uniforms.uReveal.value = home ? 1 : ease.outCubic(clamp((t - HITS.subtitleIn) / 1.6));
      subMat.uniforms.uShimmer.value = home ? -1 : lerp(-0.3, 1.5, clamp((t - 113.5) / 2));
      subMat.uniforms.uTime.value = t;
      (aura.material as THREE.SpriteMaterial).opacity = home ? 0.18 : smoothstep(HITS.titleBoom, HITS.titleBoom + 2, t) * 0.22;
      (smoke.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      (smoke.material as THREE.ShaderMaterial).uniforms.uIntensity.value = home ? 1 : smoothstep(HITS.titleBoom, HITS.titleBoom + 3, t);
      // silhouette de la prêtresse : brève apparition
      const sil = home ? 0.35 : smoothstep(HITS.silhouette, HITS.silhouette + 0.8, t) * (1 - smoothstep(HITS.silhouette + 2.0, HITS.silhouette + 3.2, t));
      (backGlow.material as THREE.SpriteMaterial).opacity = sil * 0.55;
      pr.rig.visible = sil > 0.01;
      pr.eyeMat.opacity = sil;
      pr.wings.forEach((w) => w.set(1, t, 0.3));
      // la bouteille brille une dernière fois
      const g = home ? 0.25 + 0.25 * Math.max(0, Math.sin(t * 0.8)) : Math.max(0, 1 - Math.abs(t - HITS.bottleGlint - 0.25) / 0.6);
      (glint.material as THREE.SpriteMaterial).opacity = g;
      glint.scale.setScalar(0.4 + g * 1.6);
      glint.material.rotation = t * 0.3;

      // particules : poussière d'or montante, cendres noires
      const step = Math.min(0.1, Math.max(0, t - lastT));
      if (step > 0 && (home || t > HITS.titleBoom)) {
        const n = Math.ceil(step * (t < HITS.titleBoom + 0.3 && !home ? 900 : 60));
        gold.emit(n, { pos: new THREE.Vector3(0, -2.5, -1), spread: new THREE.Vector3(9, 2.5, 3), vel: new THREE.Vector3(0, 0.6, 0.2), velSpread: t < HITS.titleBoom + 0.3 && !home ? 3 : 0.4, life: [2, 5], size: [0.02, 0.06], color: 0xffc060, color2: 0xff7a20, gravity: -0.05, drag: 0.3 });
        ash.emit(Math.ceil(n * 0.6), { pos: new THREE.Vector3(0, 3, -1.5), spread: new THREE.Vector3(10, 3, 3), vel: new THREE.Vector3(0.2, -0.3, 0.1), velSpread: 0.3, life: [3, 6], size: [0.04, 0.1], color: 0x0a0806, drag: 0.2, alpha: 0.9 });
      }
      gold.update(home ? dt : dt);
      ash.update(dt);
      lastT = t;

      // caméra : lente poussée (cinématique) ou dérive (accueil)
      if (home) {
        // le logo occupe le haut de l'écran, le menu le bas
        pos.set(Math.sin(t * 0.1) * 0.25, -1.15 + Math.sin(t * 0.13) * 0.1, 14.5);
        look.set(0, -1.15, 0);
        setCam(camera, pos, look, 35, 0, 0, t);
      } else {
        const u = ease.outCubic(clamp((t - 108) / 12));
        pos.set(0, 0.1, lerp(15.5, 12.8, u));
        look.set(0, -0.2, 0);
        setCam(camera, pos, look, 35, 0, 0.004 + (t > HITS.titleBoom ? 0.04 * Math.exp(-(t - HITS.titleBoom) * 3) : 0), t);
      }
    },
    post(t): Partial<PostParams> {
      const boom = mode === 'cinematic' && t >= HITS.titleBoom && t < HITS.titleBoom + 0.4 ? (1 - (t - HITS.titleBoom) / 0.4) * 0.25 : 0;
      return { exposure: 1.1, bloomStrength: 0.9, bloomThreshold: 0.6, bloomRadius: 0.75, flash: boom, flashColor: '#ffcf80', vignette: 1.4, grain: 0.05, saturation: 1, contrast: 1.08, aberration: 0.004 };
    },
  };
}
