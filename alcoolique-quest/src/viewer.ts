// Visionneuse de développement (non incluse dans le build) : inspecte un modèle procédural sous tous les angles.
// /viewer.html?model=eagle&yaw=0.6&pitch=0.3&dist=3&fold=0&flap=0.5
import * as THREE from 'three';
import { Eagle } from './world/eagle';
import { makeBerserker, makeGuard, makeMage, makeRanger, makeSummoner, makeSwordsman } from './world/characters';
import { idle } from './world/rig';
import { makePriestess } from './world/priestess';
import { waterBottle } from './world/bottle';

const p = new URLSearchParams(location.search);
const num = (k: string, d: number) => (p.has(k) ? parseFloat(p.get(k)!) : d);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x30343c);
scene.add(new THREE.HemisphereLight(0xbcc8ff, 0x302820, 1.2));
const sun = new THREE.DirectionalLight(0xffe0c0, 3);
sun.position.set(3, 5, 4);
scene.add(sun);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 100);

const builders: Record<string, () => THREE.Object3D> = {
  eagle: () => {
    const e = new Eagle();
    e.fold = num('fold', 0);
    e.flapAmp = num('flap', 0);
    e.flapPhase = num('phase', 0);
    e.legsTuck = num('tuck', 0);
    e.eyeOpen = num('eye', 1);
    e.update(0);
    return e;
  },
};
const lineup = () => {
  const g = new THREE.Group();
  [makeMage, makeSwordsman, makeSummoner, makeBerserker, makeRanger, makeGuard].forEach((mk, i) => {
    const c = mk();
    c.rig.apply(idle(1, i));
    if ('cape' in c) (c as { cape: { sway: (t: number) => void } }).cape.sway(1);
    c.rig.position.x = (i - 2.5) * 1.1;
    g.add(c.rig);
  });
  return g;
};
builders.heroes = lineup;
builders.priestess = () => {
  const p = makePriestess();
  p.wings.forEach((w) => w.set(num('open', 1), 1));
  p.rig.apply({});
  return p.rig;
};
builders.bottle = () => waterBottle();
export function register(name: string, b: () => THREE.Object3D) { builders[name] = b; }
if (p.get('model') === 'hdri') {
  const { loadAssets, ASSETS } = await import('./world/assets');
  await loadAssets(renderer);
  scene.background = ASSETS.hdri[(p.get('name') ?? 'park') as 'park']!;
  scene.backgroundBlurriness = 0;
  cam.fov = 90; cam.updateProjectionMatrix();
  cam.position.set(0, 0, 0);
  cam.lookAt(Math.sin(num('yaw', 0)), num('pitch', 0), Math.cos(num('yaw', 0)));
  renderer.render(scene, cam);
  (window as unknown as { __ready: boolean }).__ready = true;
  throw new Error('fin');
}
if (['house', 'tree', 'villager', 'spheres'].includes(p.get('model') ?? '')) {
  const { loadAssets } = await import('./world/assets');
  await loadAssets(renderer);
}
const { makeHouse, HouseSet } = await import('./world/houses');
const { forest } = await import('./world/vegetation');
builders.spheres = () => { const g = new THREE.Group(); [[0xffffff, 1, 0], [0xffffff, 0.05, 1], [0x808080, 0.5, 0]].forEach(([c, ro, me], i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ color: c, roughness: ro, metalness: me })); m.position.x = (i - 1) * 2.4; g.add(m); }); return g; };
builders.house = () => { const hs = new HouseSet([makeHouse(num('seed', 1), (p.get('style') ?? 'village') as 'village')]); hs.add2(0, new THREE.Vector3(), 0); return hs.build(); };
builders.tree = () => forest({ species: (p.get('sp') ?? 'oak') as 'oak', points: [new THREE.Vector4(0, 0, 0, 1)], seed: num('seed', 1) });
if (p.get('env')) { const { applyEnvironment } = await import('./world/assets'); applyEnvironment(scene, p.get('env') as 'park', num('envI', 0.55)); }
const model = (builders[p.get('model') ?? 'eagle'] ?? builders.eagle)();
scene.add(model);
const box = new THREE.Box3().setFromObject(model);
const c = box.getCenter(new THREE.Vector3());
const dist = num('dist', box.getSize(new THREE.Vector3()).length() * 1.2);
const yaw = num('yaw', 0.7), pitch = num('pitch', 0.25);
cam.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * dist, c.y + Math.sin(pitch) * dist, c.z + Math.cos(yaw) * Math.cos(pitch) * dist);
cam.lookAt(c);
renderer.render(scene, cam);
(window as unknown as { __ready: boolean }).__ready = true;
