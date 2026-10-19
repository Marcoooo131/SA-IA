// Créatures : la bête spectrale de l'invocateur (quadrupède articulé) et le Colosse.
import * as THREE from 'three';
import { Humanoid } from './rig';
import { rockify } from './terrain';

const glowMat = (c: THREE.ColorRepresentation) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });

/** Bête spectrale : corps sombre veiné de lumière, crinière d'épines, mâchoire articulée. */
export class SpectralBeast extends THREE.Group {
  body = new THREE.Group();
  neck = new THREE.Group();
  head = new THREE.Group();
  jaw = new THREE.Group();
  legs: { hip: THREE.Group; knee: THREE.Group; front: boolean; side: number }[] = [];
  tail = new THREE.Group();
  constructor() {
    super();
    const skin = new THREE.MeshStandardMaterial({ color: 0x0d1416, roughness: 0.55, metalness: 0.2, emissive: 0x0a3a30, emissiveIntensity: 0.6 });
    const vein = glowMat(0x3affc8);
    this.add(this.body);
    this.body.position.y = 1.35;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.6, 6, 14), skin);
    torso.rotation.x = Math.PI / 2;
    torso.scale.set(1, 1, 0.85);
    this.body.add(torso);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), skin);
    chest.position.set(0, 0.1, 0.7);
    this.body.add(chest);
    // épines dorsales lumineuses
    for (let i = 0; i < 9; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5 + Math.sin((i / 8) * Math.PI) * 0.5, 5), vein);
      sp.position.set(0, 0.55, 0.9 - i * 0.24);
      sp.rotation.x = -0.6;
      this.body.add(sp);
    }
    this.neck.position.set(0, 0.25, 1.15);
    this.body.add(this.neck);
    const neckM = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.6, 4, 10), skin);
    neckM.rotation.x = Math.PI / 2 - 0.6;
    neckM.position.set(0, 0.2, 0.3);
    this.neck.add(neckM);
    this.head.position.set(0, 0.45, 0.65);
    this.neck.add(this.head);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.9), skin);
    skull.position.z = 0.25;
    this.head.add(skull);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.25, 0.5), skin);
    snout.position.set(0, -0.05, 0.85);
    this.head.add(snout);
    this.jaw.position.set(0, -0.2, 0.3);
    this.head.add(this.jaw);
    const jawM = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.95), skin);
    jawM.position.set(0, -0.04, 0.42);
    this.jaw.add(jawM);
    for (let i = 0; i < 6; i++) {
      for (const s of [-1, 1]) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), new THREE.MeshStandardMaterial({ color: 0xd8d8cc }));
        tooth.position.set(s * 0.16, 0.06, 0.2 + i * 0.12);
        this.jaw.add(tooth);
        const up = tooth.clone();
        up.rotation.x = Math.PI;
        up.position.set(s * 0.18, -0.2, 0.55 + i * 0.1);
        this.head.add(up);
      }
    }
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), vein);
      eye.position.set(s * 0.2, 0.1, 0.62);
      this.head.add(eye);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.8, 6), skin);
      horn.position.set(s * 0.22, 0.35, -0.1);
      horn.rotation.set(-1.0, 0, s * -0.3);
      this.head.add(horn);
    }
    // pattes
    for (const [z, front] of [[0.85, true], [-0.85, false]] as const) {
      for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * 0.45, -0.1, z);
        this.body.add(hip);
        const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 4, 8), skin);
        thigh.position.y = -0.35;
        hip.add(thigh);
        const knee = new THREE.Group();
        knee.position.y = -0.7;
        hip.add(knee);
        const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 4, 8), skin);
        shin.position.y = -0.3;
        knee.add(shin);
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 5), vein);
        claw.position.set(0, -0.62, 0.1);
        claw.rotation.x = Math.PI / 2;
        knee.add(claw);
        this.legs.push({ hip, knee, front, side });
      }
    }
    this.tail.position.set(0, 0.1, -1.3);
    this.body.add(this.tail);
    const tailM = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.6, 8), skin);
    tailM.rotation.x = -Math.PI / 2 - 0.4;
    tailM.position.z = -0.7;
    this.tail.add(tailM);
    this.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  }
  /** phase : cycle de course ; run : 0 marche → 1 galop ; roar : ouverture de gueule 0→1. */
  pose(t: number, run: number, roar: number, crouch = 0) {
    const ph = t * (4 + run * 6);
    this.legs.forEach((l, i) => {
      const off = (l.front ? 0 : Math.PI) + (l.side > 0 ? 0 : run > 0.5 ? 0.4 : Math.PI / 2);
      const s = Math.sin(ph + off);
      l.hip.rotation.x = s * (0.35 + run * 0.45) - crouch * (l.front ? -0.6 : 0.6);
      l.knee.rotation.x = Math.max(0, -Math.cos(ph + off)) * (0.6 + run * 0.5) + crouch * 0.9;
      void i;
    });
    this.body.position.y = 1.35 + Math.abs(Math.sin(ph)) * 0.12 * run - crouch * 0.45;
    this.body.rotation.x = Math.sin(ph * 2) * 0.03 * run - roar * 0.25;
    this.neck.rotation.x = -roar * 0.5 + crouch * 0.3;
    this.head.rotation.x = -roar * 0.35;
    this.jaw.rotation.x = roar * 0.75;
    this.tail.rotation.y = Math.sin(t * 3) * 0.4;
  }
}

/** Le Colosse : titan de pierre veiné de magma, cornes, cœur incandescent. */
export function makeColossus() {
  const rig = new Humanoid({ height: 44, bulk: 1.5, skin: 0x2a2420, cloth: 0x221c18 });
  const rock = rockify(new THREE.MeshStandardMaterial({ color: 0x3a322c, roughness: 0.95, emissive: 0xff3a10, emissiveIntensity: 0.0 }), 0.35, 0.8, 0.12, 2);
  rig.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = rock; });
  const lava = glowMat(0xff5a1a);
  const core = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), lava);
  rig.wear('chest', core, [0, 4.5, 4.2]);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), glowMat(0xffc040));
    rig.wear('head', eye, [s * 1.0, 3.0, 2.4]);
    const horn = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(s * 2, 4, 0), new THREE.Vector3(s * 5, 7, -1), new THREE.Vector3(s * 7, 12, 1), new THREE.Vector3(s * 6, 16, 3)]), 16, 0.9, 8),
      rock,
    );
    rig.wear('head', horn, [0, 0, 0]);
  }
  // crevasses incandescentes : fines plaques émissives sur le torse et les bras
  for (let i = 0; i < 14; i++) {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.5 + Math.random() * 3, 0.3), lava);
    const j = (['chest', 'spine', 'upperArmL', 'upperArmR', 'thighL', 'thighR'] as const)[i % 6];
    rig.wear(j, crack, [(Math.random() - 0.5) * 4, -Math.random() * 5 + (j === 'chest' ? 5 : 0), 3.2], [0, 0, (Math.random() - 0.5) * 1.2]);
  }
  // mâchoire
  const jaw = new THREE.Group();
  const jawM = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 2.6), rock);
  jawM.position.set(0, -0.4, 1.0);
  jaw.add(jawM);
  const maw = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 0.2), lava);
  maw.position.set(0, 0.2, 2.2);
  jaw.add(maw);
  rig.wear('head', jaw, [0, 0.8, 1.2]);
  return { rig, core, jaw, material: rock };
}
