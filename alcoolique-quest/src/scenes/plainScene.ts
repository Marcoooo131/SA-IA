// SCÈNE 3 — LA PLAINE OUBLIÉE (30 → 42 s)
// Plans de coupe lents, profondeur de champ, brume : herbes au vent, arbre mort et pierre runique,
// squelette colossal et machines de guerre, route de pierre vers la cité. L'aigle traverse le cadre.
import * as THREE from 'three';
import type { CineScene, PostParams, Quality } from '../core/director';
import { inShot, prog } from '../core/timeline';
import { TimedPath, setCam } from '../core/camera';
import { ease, fbm2, lerp, rng, smoothstep } from '../core/math';
import { Eagle } from '../world/eagle';
import { skyDome, sunlight } from '../world/sky';
import { deadTree, heightfield, rock, ruins } from '../world/terrain';
import { WIND, citySilhouette, giantSkeleton, grassField, runestone, siegeTowerWreck, trebuchetWreck } from '../world/props';
import { ambientMotes } from '../fx/particles';
import { groundMist, godRay } from '../fx/magic';

const roadX = (z: number) => 18 * Math.sin(z * 0.006) + 6 * Math.sin(z * 0.023);
const ground = (x: number, z: number) => {
  const d = Math.abs(x - roadX(z));
  return fbm2(x * 0.004, z * 0.004, 4) * 14 + fbm2(x * 0.03, z * 0.03, 3) * 1.2 - (d < 6 ? (6 - d) * 0.08 : 0);
};

export function createPlainScene(quality: Quality): CineScene {
  const hi = quality === 'high';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 9000);
  const fogColor = new THREE.Color(0x8c7c6c);
  scene.fog = new THREE.FogExp2(fogColor, 0.0007);
  // soleil bas derrière la cité : silhouettes à contre-jour
  const sunDir = new THREE.Vector3(-0.35, 0.13, -0.93).normalize();
  const sky = skyDome({ top: 0x46557a, horizon: 0xe8a868, bottom: 0x4a3c34, sunDir, sunColor: 0xffb070, sunSize: 0.9993, glow: 1.4, clouds: 0.8, cloudColor: 0x5a4650 });
  scene.add(sky);
  const { sun } = sunlight(scene, { dir: sunDir, color: 0xffc080, intensity: 3.4, sky: 0x7a86a8, ground: 0x3a2e22, hemi: 0.8 });
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;

  const terrain = heightfield({
    width: 2600, depth: 2600, segX: hi ? 260 : 160, segZ: hi ? 260 : 160, center: [0, -900],
    height: ground,
    color: (x, y, z, slope, c) => {
      const n = fbm2(x * 0.02, z * 0.02);
      c.setRGB(0.085 + n * 0.03, 0.07 + n * 0.025, 0.035);
      if (slope > 0.2) c.lerp(new THREE.Color(0x3a3630), 0.6);
      const d = Math.abs(x - roadX(z));
      if (d < 4.2) c.lerp(new THREE.Color(0x3e3a35), 0.8 * (1 - d / 4.2));
      void y;
    },
    rockScale: 0.25,
    rockStrength: 0.3,
    rockBump: 0.12,
  });
  scene.add(terrain);

  // route de pierre : dalles posées le long du tracé, certaines manquantes ou basculées
  const r = rng(8);
  const slabGeo = new THREE.BoxGeometry(1.6, 0.3, 1.1);
  const slabs = new THREE.InstancedMesh(slabGeo, new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.95 }), 2600);
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let k = 0;
    for (let z = 60; z > -1200 && k < 2600; z -= 1.2) {
      for (let j = -1; j <= 1; j++) {
        if (r.next() < 0.12 || k >= 2600) continue;
        const x = roadX(z) + j * 1.7 + r.range(-0.15, 0.15);
        e.set(r.range(-0.08, 0.08), r.range(-0.1, 0.1), r.range(-0.08, 0.08));
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(x, ground(x, z) - 0.08, z), q, new THREE.Vector3(r.range(0.85, 1.05), 1, r.range(0.85, 1.05)));
        slabs.setMatrixAt(k++, m);
      }
    }
    slabs.count = k;
    slabs.receiveShadow = true;
  }
  scene.add(slabs);

  // herbes : denses autour de chaque plan
  const grass = grassField({
    count: hi ? 60000 : 20000,
    height: ground,
    bladeH: 0.55,
    patches: [
      { x: 30, z: 18, r: 14, w: 6 },
      { x: -22, z: -38, r: 22, w: 4 },
      { x: 32, z: -112, r: 34, w: 5 },
      { x: 6, z: 18, r: 40, w: 6 },
      { x: 0, z: -60, r: 90, w: 5 },
    ],
  });
  scene.add(grass);

  // plan 3b : l'arbre mort et la pierre runique
  const tree = deadTree(rng(5), 11);
  tree.position.set(-27, ground(-27, -44), -44);
  tree.castShadow = true;
  scene.add(tree);
  const stone = runestone(3);
  stone.position.set(-20, ground(-20, -37) - 0.3, -37);
  scene.add(stone);
  for (let i = 0; i < 9; i++) {
    const b = rock(r, r.range(0.4, 1.4), 0x58544e);
    const x = -22 + r.range(-12, 12), z = -40 + r.range(-10, 10);
    b.position.set(x, ground(x, z) - 0.2, z);
    scene.add(b);
  }
  // autres arbres morts au loin
  for (let i = 0; i < 14; i++) {
    const t2 = deadTree(rng(20 + i), r.range(6, 12));
    const x = r.range(-200, 200), z = r.range(-80, -500);
    if (Math.abs(x - roadX(z)) < 12) continue;
    t2.position.set(x, ground(x, z), z);
    scene.add(t2);
  }

  // plan 3c : squelette colossal et machines de guerre
  const skel = giantSkeleton(4);
  skel.position.set(42, ground(42, -122) - 1, -122);
  skel.rotation.y = 0.5;
  scene.add(skel);
  const treb = trebuchetWreck(r);
  treb.position.set(25, ground(25, -97), -97);
  treb.rotation.y = 1.1;
  scene.add(treb);
  const tower = siegeTowerWreck();
  tower.position.set(64, ground(64, -150), -150);
  tower.rotation.y = 0.4;
  scene.add(tower);
  // ruines envahies par la végétation
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0x6e6a5e, roughness: 1 });
  for (const [x, z, s] of [[-48, -170, 1.4], [62, -260, 1.8], [-30, -420, 2.2], [40, -600, 2.4]] as const) {
    const rr = ruins(Math.round(x * 3), s, ruinMat);
    rr.position.set(x, ground(x, z) - 0.4, z);
    rr.rotation.y = r.range(0, 3);
    rr.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    scene.add(rr);
  }

  // la cité, à l'horizon
  const city = citySilhouette(2);
  city.position.set(0, ground(0, -1500) - 5, -1500);
  scene.add(city);

  // atmosphère : brume rampante, motes dorées, rais de lumière
  const mist = groundMist(1600, 0xc8b49a, 0.45, 0.02, [0.35, 0.9]);
  mist.position.set(0, 1.2, -400);
  scene.add(mist);
  const mist2 = groundMist(1600, 0xd8c0a0, 0.3, 0.012, [0.4, 0.95]);
  mist2.position.set(0, 4.5, -500);
  scene.add(mist2);
  const motes = ambientMotes({ count: hi ? 900 : 400, box: new THREE.Vector3(120, 20, 220), center: new THREE.Vector3(10, 6, -60), color: 0xffd090, size: 0.05, speed: new THREE.Vector3(0.8, 0.15, 0.2), opacity: 0.8 });
  scene.add(motes);
  const rays: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const ray = godRay({ length: 160, radiusTop: 4, radiusBottom: 22, color: 0xffcf90, opacity: 0.08 });
    ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), sunDir.clone().negate());
    ray.position.set(r.range(-40, 50), 0, r.range(-60, -160)).addScaledVector(sunDir, 120);
    scene.add(ray);
    rays.push(ray);
  }

  // l'aigle traverse le cadre vers la cité
  const eagle = new Eagle();
  scene.add(eagle);
  const ePath = new TimedPath([
    [37.6, [70, 26, -10]],
    [39, [40, 24, -40]],
    [40.5, [12, 23, -80]],
    [42, [-12, 24, -130]],
  ]);
  const ePos = new THREE.Vector3(), eVel = new THREE.Vector3();
  const look = new THREE.Vector3(), pos = new THREE.Vector3();
  let focus = 10;

  const hide = new URLSearchParams(location.search).get('hide') ?? '';
  if (hide.includes('mist')) { mist.visible = false; mist2.visible = false; }
  if (hide.includes('rays')) rays.forEach((x) => (x.visible = false));
  if (hide.includes('sky')) sky.visible = false;
  if (hide.includes('terrain')) terrain.visible = false;

  return {
    key: 'plain',
    scene,
    camera,
    update(t, dt) {
      WIND.uTime.value = t;
      WIND.uStrength.value = 1;
      (sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      for (const m of [mist, mist2]) (m.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      for (const ray of rays) (ray.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      // les runes respirent
      (stone.userData.mat as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + Math.sin(t * 2.2) * 0.8;

      eagle.visible = t > 37.6;
      if (eagle.visible) {
        ePath.at(t, ePos);
        ePath.velocity(t, eVel);
        eagle.position.copy(ePos);
        eagle.lookAt(look.copy(ePos).add(eVel));
        eagle.rotateZ(0.25);
        eagle.fold = 0; eagle.legsTuck = 1; eagle.flapFreq = 2.2;
        eagle.flapAmp = t < 39.2 ? 0.7 : 0.08;
        eagle.update(dt);
      }

      let fov = 35, shake = 0.004;
      if (inShot('3a', t)) {
        // macro au ras des herbes, travelling latéral lent
        const u = ease.inOutSine(prog('3a', t));
        const px = lerp(24, 31, u);
        pos.set(px, ground(px, 26) + 0.75, 26);
        look.set(px - 4, ground(px - 4, 10) + 1.2, 10);
        fov = 32; focus = 4.5;
      } else if (inShot('3b', t)) {
        // l'arbre mort et la pierre runique, poussée lente
        const u = ease.inOutSine(prog('3b', t));
        pos.set(lerp(-6, -9, u), ground(-6, -20) + lerp(1.4, 1.7, u), lerp(-18, -23, u));
        look.set(-22, ground(-22, -40) + 3.2, -40);
        fov = 38; focus = pos.distanceTo(look);
      } else if (inShot('3c', t)) {
        // travelling latéral devant le squelette, la carcasse du trébuchet au premier plan
        const u = ease.inOutSine(prog('3c', t));
        const px = lerp(6, 16, u);
        pos.set(px, ground(px, -80) + 2.3, -80);
        look.set(lerp(38, 44, u), ground(40, -120) + 5, -120);
        fov = 44; focus = pos.distanceTo(look);
      } else {
        // plan large : la route de pierre file vers la cité ; panoramique sur l'aigle
        const u = ease.inOutSine(prog('3d', t));
        pos.set(lerp(10, 6, u), ground(8, 34) + lerp(2.2, 3.5, u), lerp(36, 30, u));
        const toCity = new THREE.Vector3(roadX(-400), 40, -900);
        look.copy(toCity).lerp(ePos, eagle.visible ? 0.55 * (1 - smoothstep(40.2, 42, t)) : 0);
        fov = 40; focus = 60; shake = 0.006;
      }
      setCam(camera, pos, look, fov, 0, shake, t);
      sky.position.copy(camera.position);
      // ombres : la zone d'ombre suit le plan en cours
      sun.target.position.copy(look).lerp(pos, 0.5);
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 200);
    },
    post(t): Partial<PostParams> {
      const d = inShot('3d', t) ? null : { focus, aperture: inShot('3a', t) ? 0.004 : 0.0012, maxblur: 0.007 };
      return { dof: d, exposure: 1.0, bloomStrength: 0.65, bloomThreshold: 0.75, saturation: 0.88, contrast: 1.08, gain: [1.05, 1.0, 0.92] };
    },
  };
}
