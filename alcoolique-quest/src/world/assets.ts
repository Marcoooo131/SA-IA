// Ressources externes réellement intégrées : paquet npm @pmndrs/assets (licence CC0 1.0).
// - HDRI Poly Haven (512×256, EXR) : éclairage par l'image (lumière du ciel + reflets) des matériaux PBR.
// - Normal maps tuilables (512², webp) : relief de la pierre, du bois, des pavés, de l'enduit…
// - Texture de nuage (webp) : cumulus.
// Les fichiers sont chargés au démarrage (import dynamique → fichiers séparés du bundle principal).
// En cas d'échec, les matériaux retombent sur le relief procédural existant.
import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

export type HdriName = 'park' | 'sunset' | 'dawn' | 'forest' | 'night' | 'sky';
export type NormalName = 'rock' | 'rockFine' | 'cracked' | 'plaster' | 'cobble' | 'planks' | 'bark' | 'tiles' | 'cloth' | 'earth' | 'water';

type Mod = () => Promise<{ default: string }>;
const NORMAL_FILES: Record<NormalName, Mod> = {
  rock: () => import('@pmndrs/assets/normals/0002.webp'),
  rockFine: () => import('@pmndrs/assets/normals/0017.webp'),
  cracked: () => import('@pmndrs/assets/normals/0024.webp'),
  plaster: () => import('@pmndrs/assets/normals/0006.webp'),
  cobble: () => import('@pmndrs/assets/normals/0026.webp'),
  planks: () => import('@pmndrs/assets/normals/0023.webp'),
  bark: () => import('@pmndrs/assets/normals/0011.webp'),
  tiles: () => import('@pmndrs/assets/normals/0025.webp'),
  cloth: () => import('@pmndrs/assets/normals/0022.webp'),
  earth: () => import('@pmndrs/assets/normals/0028.webp'),
  water: () => import('@pmndrs/assets/normals/0007.webp'),
};

const hdriImports: Record<HdriName, Mod> = {
  park: () => import('@pmndrs/assets/hdri/park.exr'),
  sunset: () => import('@pmndrs/assets/hdri/sunset.exr'),
  dawn: () => import('@pmndrs/assets/hdri/dawn.exr'),
  forest: () => import('@pmndrs/assets/hdri/forest.exr'),
  night: () => import('@pmndrs/assets/hdri/night.exr'),
  sky: () => import('@pmndrs/assets/hdri/sky.exr'),
};

export const ASSETS = {
  hdri: {} as Partial<Record<HdriName, THREE.Texture>>,
  normals: {} as Partial<Record<NormalName, THREE.Texture>>,
  cloud: null as THREE.Texture | null,
  ok: false,
};

let pmrem: THREE.PMREMGenerator | null = null;

/** Charge toutes les ressources ; `renderer` sert à préfiltrer les HDRI (PMREM). */
export async function loadAssets(renderer: THREE.WebGLRenderer, onProgress?: (k: number) => void) {
  pmrem = new THREE.PMREMGenerator(renderer);
  const tl = new THREE.TextureLoader();
  const jobs: Promise<void>[] = [];
  let done = 0;
  const total = Object.keys(hdriImports).length + Object.keys(NORMAL_FILES).length + 1;
  const tick = () => onProgress?.(++done / total);
  for (const [name, imp] of Object.entries(hdriImports) as [HdriName, Mod][]) {
    jobs.push(
      imp()
        .then((m) => new EXRLoader().loadAsync(m.default))
        .then((tex) => {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          ASSETS.hdri[name] = pmrem!.fromEquirectangular(tex).texture;
          tex.dispose();
        })
        .catch((e) => console.warn('HDRI indisponible', name, e))
        .finally(tick),
    );
  }
  for (const [name, imp] of Object.entries(NORMAL_FILES) as [NormalName, Mod][]) {
    jobs.push(
      imp()
        .then((m) => tl.loadAsync(m.default))
        .then((tex) => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.anisotropy = 8;
          tex.colorSpace = THREE.NoColorSpace;
          ASSETS.normals[name] = tex;
        })
        .catch((e) => console.warn('Normal map indisponible', name, e))
        .finally(tick),
    );
  }
  jobs.push(
    import('@pmndrs/assets/textures/cloud.webp')
      .then((m) => tl.loadAsync(m.default))
      .then((tex) => { tex.colorSpace = THREE.SRGBColorSpace; ASSETS.cloud = tex; })
      .catch((e) => console.warn('Texture de nuage indisponible', e))
      .finally(tick),
  );
  await Promise.all(jobs);
  ASSETS.ok = true;
}

/** Normal map tuilée (clone indépendant pour régler la répétition). */
export function normalTex(name: NormalName, repeat = 1): THREE.Texture | null {
  const t = ASSETS.normals[name];
  if (!t) return null;
  const c = t.clone();
  c.repeat.set(repeat, repeat);
  c.needsUpdate = true;
  return c;
}

/** Éclairage par l'image : la scène est éclairée et reflète une HDRI réelle. */
export function applyEnvironment(scene: THREE.Scene, name: HdriName, intensity = 1, rotationY = 0) {
  const env = ASSETS.hdri[name];
  if (!env) return;
  scene.environment = env;
  scene.environmentIntensity = intensity;
  scene.environmentRotation.set(0, rotationY, 0);
}
