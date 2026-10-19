// L'aigle : modèle procédural articulé (squelette hiérarchique tête / ailes à trois segments / queue / pattes)
// avec plumes texturées, paupières animées, battement d'ailes ondulant et repli des ailes.
import * as THREE from 'three';
import { featherTex, irisTex } from './textures';
import { rng } from '../core/math';

const std = (color: THREE.ColorRepresentation, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra });

function featherMat(color: THREE.ColorRepresentation) {
  return new THREE.MeshStandardMaterial({
    color,
    map: featherTex(),
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.75,
  });
}

/** Géométrie de plume posée à plat, base à l'origine, s'étendant vers -Z. */
function featherGeo(len: number, width: number) {
  const g = new THREE.PlaneGeometry(width, len, 1, 3);
  g.translate(0, len / 2, 0);
  g.rotateX(-Math.PI / 2);
  // légère courbure de la plume
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    p.setY(i, -0.15 * (z * z) / len);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Manteau de plumes : cartes de plumes instanciées, posées sur un ellipsoïde, orientées vers l'arrière
 * et légèrement soulevées pour se chevaucher comme des écailles.
 */
function featherCoat(opts: {
  center: THREE.Vector3Tuple;
  radii: THREE.Vector3Tuple;
  count: number;
  len: number;
  width: number;
  colors: THREE.ColorRepresentation[];
  seed: number;
  skip?: (n: THREE.Vector3) => boolean;
  flow?: THREE.Vector3Tuple;
}) {
  const r = rng(opts.seed);
  const mat = new THREE.MeshStandardMaterial({ map: featherTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(featherGeo(opts.len, opts.width), mat, opts.count);
  const [a, b, c] = opts.radii;
  const flow = new THREE.Vector3(...(opts.flow ?? [0, -0.25, -1])).normalize();
  const m = new THREE.Matrix4(), lift = new THREE.Matrix4().makeRotationX(0.22);
  const col = new THREE.Color();
  let k = 0;
  let guard = 0;
  while (k < opts.count && guard++ < opts.count * 20) {
    const u = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1));
    if (u.lengthSq() > 1 || u.lengthSq() < 0.01) continue;
    u.normalize();
    if (opts.skip?.(u)) continue;
    const p = new THREE.Vector3(u.x * a, u.y * b, u.z * c);
    const n = new THREE.Vector3(p.x / (a * a), p.y / (b * b), p.z / (c * c)).normalize();
    const d = flow.clone().addScaledVector(n, -flow.dot(n));
    if (d.lengthSq() < 1e-4) d.set(0, -1, 0).addScaledVector(n, -n.y);
    d.normalize();
    const Z = d.clone().negate();
    const X = new THREE.Vector3().crossVectors(n, Z).normalize();
    m.makeBasis(X, n, Z).multiply(lift);
    const sc = r.range(0.75, 1.2);
    m.scale(new THREE.Vector3(sc, sc, sc));
    m.setPosition(p.addScaledVector(n, 0.002).add(new THREE.Vector3(...opts.center)));
    mesh.setMatrixAt(k, m);
    mesh.setColorAt(k, col.set(r.pick(opts.colors)).multiplyScalar(r.range(0.8, 1.15)));
    k++;
  }
  mesh.count = k;
  mesh.castShadow = true;
  return mesh;
}

interface WingSeg {
  bone: THREE.Group;
  feathers: THREE.Group; // pivot qui contre-tourne les plumes quand l'aile se replie
}

export class Eagle extends THREE.Group {
  body = new THREE.Group();
  head = new THREE.Group();
  private lids: THREE.Group[] = [];
  private wings: { s: number; arm: WingSeg; fore: WingSeg; hand: WingSeg; primaries: THREE.Group[] }[] = [];
  private shoulders: THREE.Group[] = [];
  private tail = new THREE.Group();
  private tailFeathers: THREE.Group[] = [];
  private legs: THREE.Group[] = [];
  private toes: THREE.Group[] = [];

  // Paramètres d'animation (pilotés par la mise en scène)
  flapPhase = 0;
  flapFreq = 2.6;
  flapAmp = 0;
  fold = 1;
  eyeOpen = 1;
  legsTuck = 0;
  tailSpread = 0.3;
  grip = 1;
  headYaw = 0;
  headPitch = 0;
  ruffle = 0;
  /** Ailes levées en V (posture d'intimidation / préparation à l'envol). */
  raise = 0;
  private time = 0;

  constructor() {
    super();
    this.add(this.body);
    const dark = std(0x2b1d13, { roughness: 0.9 });
    const nape = std(0x8a5a2b, { roughness: 0.85 });
    const beakMat = std(0x4a423a, { roughness: 0.3 });
    const beakTip = std(0x2a2520, { roughness: 0.3 });
    const yellow = std(0xb88a34, { roughness: 0.6 });
    const claw = std(0x0d0b0a, { roughness: 0.25 });

    // Torse, poitrail, cou : volumes de base recouverts d'un manteau de plumes
    const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), dark);
    torso.scale.set(0.15, 0.14, 0.4);
    this.body.add(torso);
    this.body.add(featherCoat({ center: [0, 0, 0], radii: [0.155, 0.145, 0.4], count: 360, len: 0.13, width: 0.075, colors: [0x2b1d13, 0x3a2717, 0x24180f, 0x4a321c], seed: 1 }));
    this.body.add(featherCoat({ center: [0, -0.03, 0.2], radii: [0.135, 0.125, 0.21], count: 160, len: 0.09, width: 0.06, colors: [0x3d2a1a, 0x4b331d, 0x33231a], seed: 2, skip: (n) => n.y > 0.3 }));
    const neck = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), nape);
    neck.scale.set(0.1, 0.115, 0.14);
    neck.position.set(0, 0.06, 0.33);
    this.body.add(neck);
    this.body.add(featherCoat({ center: [0, 0.06, 0.33], radii: [0.105, 0.12, 0.145], count: 220, len: 0.07, width: 0.045, colors: [0x9a6a35, 0x8a5a2b, 0xb07b3c, 0x6e4a28], seed: 3, flow: [0, -0.5, -1] }));

    // Tête
    this.head.position.set(0, 0.1, 0.43);
    this.body.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.088, 24, 18), std(0x2e1d10, { roughness: 0.95 }));
    skull.scale.set(1, 0.95, 1.15);
    this.head.add(skull);
    this.head.add(featherCoat({
      center: [0, 0, 0], radii: [0.09, 0.087, 0.102], count: 380, len: 0.04, width: 0.03, seed: 4,
      colors: [0x9a6a35, 0x7a5028, 0xa8763a, 0x5a3a1c], flow: [0, -0.1, -1],
      skip: (n) => n.z > 0.66 || (Math.abs(n.x) > 0.66 && n.z > 0.25 && n.y > -0.22 && n.y < 0.32),
    }));
    // Bec crochu
    const cere = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.045, 16), yellow);
    cere.rotation.x = Math.PI / 2;
    cere.position.set(0, -0.012, 0.098);
    this.head.add(cere);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.1, 16), beakMat);
    beak.rotation.x = Math.PI / 2 + 0.25;
    beak.position.set(0, -0.022, 0.155);
    beak.scale.set(0.8, 1, 1.15);
    this.head.add(beak);
    const hook = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 10), beakTip);
    hook.position.set(0, -0.05, 0.2);
    hook.rotation.x = Math.PI - 0.5;
    this.head.add(hook);
    // Yeux : iris texturé sous une cornée brillante, arcade sourcilière, paupière animée
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 0.06, 0.018, 0.055);
      eye.lookAt(eye.position.clone().add(new THREE.Vector3(s * 0.75, 0.05, 0.65)));
      this.head.add(eye);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.018, 20, 14), std(0x120a04, { roughness: 0.4 }));
      eye.add(ball);
      const iris = new THREE.Mesh(
        new THREE.CircleGeometry(0.0158, 32),
        new THREE.MeshStandardMaterial({ map: irisTex(), emissive: 0xffffff, emissiveMap: irisTex(), emissiveIntensity: 0.18, roughness: 0.5 }),
      );
      iris.position.z = 0.0158;
      eye.add(iris);
      const cornea = new THREE.Mesh(
        new THREE.SphereGeometry(0.0205, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2.4),
        new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0, specularIntensity: 1 }),
      );
      cornea.rotation.x = Math.PI / 2;
      eye.add(cornea);
      const lid = new THREE.Group();
      eye.add(lid);
      const lidMesh = new THREE.Mesh(new THREE.SphereGeometry(0.0225, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), nape);
      lid.add(lidMesh);
      this.lids.push(lid);
      // arcade sourcilière : donne au rapace son regard sévère
      const brow = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), std(0x2a1a0e, { roughness: 0.9 }));
      brow.scale.set(0.02, 0.007, 0.036);
      brow.position.set(s * 0.06, 0.03, 0.058);
      brow.rotation.set(0.15, s * 0.6, s * -0.3);
      this.head.add(brow);
    }

    // Ailes
    const mPrim = featherMat(0x231710);
    const mSec = featherMat(0x33231a);
    const mCov = featherMat(0x6e4a28);
    const mCov2 = featherMat(0x4a3220);
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.11, 0.07, 0.14);
      this.body.add(shoulder);
      this.shoulders.push(shoulder);
      const mkSeg = (parent: THREE.Object3D, x: number, len: number): WingSeg => {
        const bone = new THREE.Group();
        bone.position.x = x;
        parent.add(bone);
        const limb = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), dark);
        limb.scale.set(len / 2, 0.02, 0.04);
        limb.position.x = (s * len) / 2;
        bone.add(limb);
        const feathers = new THREE.Group();
        bone.add(feathers);
        return { bone, feathers };
      };
      const arm = mkSeg(shoulder, 0, 0.36);
      const fore = mkSeg(arm.bone, s * 0.36, 0.4);
      const hand = mkSeg(fore.bone, s * 0.4, 0.3);

      const addRow = (seg: WingSeg, n: number, x0: number, x1: number, len: (k: number) => number, mat: THREE.Material, y: number, fan: (k: number) => number, width = 0.075, zOff = 0.02) => {
        const out: THREE.Group[] = [];
        for (let i = 0; i < n; i++) {
          const k = n === 1 ? 0 : i / (n - 1);
          const piv = new THREE.Group();
          piv.position.set(s * (x0 + (x1 - x0) * k), y, zOff);
          piv.rotation.y = s * fan(k);
          const f = new THREE.Mesh(featherGeo(len(k), width), mat);
          f.castShadow = true;
          piv.add(f);
          seg.feathers.add(piv);
          out.push(piv);
        }
        return out;
      };
      // rémiges tertiaires et secondaires
      addRow(arm, 7, 0.02, 0.34, (k) => 0.3 + k * 0.06, mSec, 0, () => 0.05, 0.11);
      addRow(fore, 11, 0.0, 0.4, () => 0.38, mSec, 0, (k) => 0.04 + k * 0.08, 0.11);
      // couvertures (rangées supérieures, plus claires)
      addRow(arm, 7, 0.0, 0.34, () => 0.2, mCov, 0.022, () => 0.1, 0.1, 0.05);
      addRow(fore, 10, 0.0, 0.4, () => 0.22, mCov2, 0.014, () => 0.12, 0.1, 0.03);
      addRow(fore, 10, 0.0, 0.4, () => 0.13, mCov, 0.024, () => 0.2, 0.08, 0.05);
      // rémiges primaires : les « doigts » de l'aigle, en éventail
      const primaries = addRow(hand, 9, 0.0, 0.29, (k) => 0.4 + Math.sin(k * Math.PI * 0.8) * 0.12, mPrim, 0.004, (k) => 0.12 + k * 1.05, 0.085);
      addRow(hand, 7, 0.0, 0.26, () => 0.17, mCov2, 0.014, (k) => 0.2 + k * 0.7, 0.08, 0.03);
      this.wings.push({ s, arm, fore, hand, primaries });
    }

    // Queue en éventail
    this.tail.position.set(0, 0.03, -0.36);
    this.body.add(this.tail);
    const tailMat = featherMat(0x2e2016);
    for (let i = 0; i < 10; i++) {
      const piv = new THREE.Group();
      const f = new THREE.Mesh(featherGeo(0.34, 0.08), tailMat);
      piv.add(f);
      piv.position.y = i * 0.001;
      this.tail.add(piv);
      this.tailFeathers.push(piv);
    }

    // Pattes emplumées et serres
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.07, -0.08, 0.06);
      this.body.add(leg);
      const trousers = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), std(0x3a2717, { roughness: 1 }));
      trousers.scale.set(0.055, 0.1, 0.06);
      trousers.position.y = -0.06;
      leg.add(trousers);
      const tarsus = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.1, 10), yellow);
      tarsus.position.y = -0.18;
      leg.add(tarsus);
      const foot = new THREE.Group();
      foot.position.y = -0.23;
      leg.add(foot);
      const toeDirs = [-0.45, 0, 0.45, Math.PI];
      for (const a of toeDirs) {
        const toe = new THREE.Group();
        toe.rotation.y = a;
        foot.add(toe);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.075, 8), yellow);
        seg.rotation.x = Math.PI / 2;
        seg.position.z = 0.035;
        toe.add(seg);
        const tip = new THREE.Group();
        tip.position.z = 0.07;
        toe.add(tip);
        const cg = new THREE.TorusGeometry(0.03, 0.007, 6, 14, Math.PI * 0.8);
        // griffe effilée : le tube s'amincit vers la pointe
        const cp = cg.attributes.position;
        for (let i = 0; i < cp.count; i++) {
          const a = Math.atan2(cp.getY(i), cp.getX(i));
          const k = Math.max(0.1, 1 - Math.max(0, a) / (Math.PI * 0.8));
          const cx = Math.cos(a) * 0.03, cy = Math.sin(a) * 0.03;
          cp.setXYZ(i, cx + (cp.getX(i) - cx) * k, cy + (cp.getY(i) - cy) * k, cp.getZ(i) * k);
        }
        cg.computeVertexNormals();
        const c = new THREE.Mesh(cg, claw);
        c.rotation.set(0, Math.PI / 2, Math.PI);
        c.position.set(0, -0.03, 0.0);
        tip.add(c);
        this.toes.push(tip);
      }
      this.legs.push(leg);
    }
    this.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  update(dt: number) {
    this.time += dt;
    this.flapPhase += dt * this.flapFreq * Math.PI * 2;
    const ph = this.flapPhase;
    const A = this.flapAmp * (1 - this.fold);
    const fold = this.fold;

    for (const [i, w] of this.wings.entries()) {
      const s = w.s;
      // aile repliée : le plan de l'aile pivote à la verticale, le long du flanc
      const sh = this.shoulders[i];
      sh.rotation.set(0, 0, -s * fold * 1.42);
      sh.position.set(s * (0.11 + fold * 0.05), 0.07 + fold * 0.07, 0.14 - fold * 0.02);
      for (const seg of [w.arm, w.fore, w.hand]) seg.bone.children[0].scale.y = 0.02 * (1 - fold * 0.8);
      // battement ondulant : chaque segment est en retard sur le précédent
      const f1 = Math.sin(ph) * A;
      const f2 = Math.sin(ph - 0.6) * A;
      const f3 = Math.sin(ph - 1.1) * A;
      const dihedral = 0.08 * (1 - fold);
      // repli : bras vers l'arrière, avant-bras vers l'avant, main vers l'arrière
      const ya = s * (0.05 + fold * 1.45) + s * Math.max(0, -Math.sin(ph)) * A * 0.25;
      const yf = -s * fold * 2.9;
      const yh = s * fold * 2.85;
      w.arm.bone.rotation.set(0, ya, s * (f1 + dihedral + this.raise * 0.75 * (1 - fold)));
      w.fore.bone.rotation.set(Math.cos(ph) * A * 0.25, yf, s * (f2 * 0.55 - this.raise * 0.35 * (1 - fold)));
      w.hand.bone.rotation.set(Math.cos(ph - 0.6) * A * 0.35, yh, s * f3 * 0.7);
      // contre-rotation des plumes : elles restent orientées vers l'arrière, aile repliée
      w.arm.feathers.rotation.y = -ya * fold * 0.95;
      w.fore.feathers.rotation.y = -(ya + yf) * fold * 0.95;
      w.hand.feathers.rotation.y = -(ya + yf + yh) * fold * 0.97;
      w.fore.feathers.scale.setScalar(1 - fold * 0.1);
      // les primaires se resserrent quand l'aile se replie
      w.primaries.forEach((p, i) => {
        const k = i / (w.primaries.length - 1);
        p.rotation.y = s * (0.12 + k * 1.05) * (1 - fold * 0.92) + s * Math.sin(this.time * 9 + i) * 0.015 * this.ruffle;
        p.rotation.x = Math.sin(this.time * 13 + i * 1.7) * 0.03 * this.ruffle;
      });
    }
    this.tailFeathers.forEach((p, i) => {
      const k = i / (this.tailFeathers.length - 1) - 0.5;
      p.rotation.y = k * (0.25 + this.tailSpread * 0.9);
      p.rotation.x = 0.05 + Math.sin(this.time * 7 + i) * 0.02 * this.ruffle;
    });
    // paupières : ouverte = la paupière recule, fermée = elle couvre le globe
    for (const lid of this.lids) lid.rotation.x = 1.25 - this.eyeOpen * 2.15;
    this.head.rotation.set(this.headPitch, this.headYaw, 0);
    for (const l of this.legs) l.rotation.x = this.legsTuck * 1.35;
    for (const t of this.toes) t.rotation.x = 0.2 + this.grip * 0.9 + this.legsTuck * 0.4;
  }
}
