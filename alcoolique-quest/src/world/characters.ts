// Les héros, leurs ennemis et leur équipement. Silhouettes immédiatement identifiables,
// avec quelques détails absurdes discrets (bouchon de liège, maillet-tonneau, emblème « goutte d'eau »).
import * as THREE from 'three';
import { Humanoid } from './rig';
import { dropEmblemTex } from './textures';

const M = (color: THREE.ColorRepresentation, metal = 0, rough = 0.8, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...extra });
const steel = () => M(0x8a8f96, 0.85, 0.35);
const darkSteel = () => M(0x2b2e33, 0.8, 0.45);
const gold = () => M(0xb08a3a, 0.9, 0.35);
const leather = () => M(0x3a2618, 0, 0.85);

/** Jupe / robe : cône évasé attaché au bassin. */
function robe(top: number, bottom: number, len: number, m: THREE.Material, tattered = false) {
  const g = new THREE.CylinderGeometry(top, bottom, len, 24, 6, true);
  g.translate(0, -len / 2, 0);
  if (tattered) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < -len * 0.95) p.setY(i, p.getY(i) + Math.abs(Math.sin(i * 1.7)) * len * 0.12);
  }
  const mesh = new THREE.Mesh(g, m);
  (mesh.material as THREE.Material).side = THREE.DoubleSide;
  return mesh;
}

/** Cape : plan subdivisé dont on anime l'ondulation. */
export class Cape extends THREE.Mesh {
  private rest: Float32Array;
  constructor(w: number, h: number, m: THREE.Material) {
    const g = new THREE.PlaneGeometry(w, h, 6, 10);
    g.translate(0, -h / 2, 0);
    super(g, m);
    (m as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    this.rest = (g.attributes.position.array as Float32Array).slice();
  }
  /** wind : force du vent ; lift : soulèvement (course, saut). */
  sway(t: number, wind = 1, lift = 0) {
    const p = this.geometry.attributes.position;
    const h = -this.rest[(p.count - 1) * 3 + 1];
    for (let i = 0; i < p.count; i++) {
      const x = this.rest[i * 3], y = this.rest[i * 3 + 1];
      const k = -y / h;
      p.setZ(i, -k * k * (0.25 * wind + lift) - Math.sin(t * 3 + x * 2 + k * 4) * 0.06 * wind * k);
      p.setY(i, y + k * k * lift * 0.3);
    }
    p.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

export function sword(len = 1.0) {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, len, 0.012), M(0xc9ced6, 1, 0.18));
  blade.position.y = len / 2 + 0.1;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), M(0xc9ced6, 1, 0.18));
  tip.scale.z = 0.3;
  tip.position.y = len + 0.16;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.04), gold());
  guard.position.y = 0.1;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 8), leather());
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), gold());
  pommel.position.y = -0.1;
  g.add(blade, tip, guard, grip, pommel);
  g.userData.tip = new THREE.Vector3(0, len + 0.2, 0);
  g.userData.base = new THREE.Vector3(0, 0.15, 0);
  return g;
}

export function staff() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 1.9, 8), M(0x3a2a1c));
  shaft.position.y = 0.45;
  const claw = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI * 1.4), M(0x3a2a1c));
  claw.position.y = 1.43;
  claw.rotation.z = -Math.PI * 0.2;
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshStandardMaterial({ color: 0x9fd0ff, emissive: 0x6fb8ff, emissiveIntensity: 2.5, toneMapped: false }));
  crystal.position.y = 1.45;
  crystal.scale.y = 1.6;
  g.add(shaft, claw, crystal);
  g.userData.crystal = crystal;
  return g;
}

export function axe() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.0, 8), M(0x4a3020));
  shaft.position.y = 0.35;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.12); shape.quadraticCurveTo(0.28, 0.2, 0.3, -0.05); shape.quadraticCurveTo(0.2, -0.22, 0, -0.12); shape.lineTo(0, 0.12);
  const head = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1 }), steel());
  head.position.set(0.02, 0.75, -0.012);
  g.add(shaft, head);
  g.userData.head = head;
  g.userData.shaft = shaft;
  return g;
}

/** Le « maillet-tonneau » : un tonneau cerclé de fer au bout d'un manche. Arme très sérieuse. */
export function barrelMaul() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.0, 8), M(0x3a2618));
  shaft.position.y = 0.6;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 16, 4), M(0x5a3a20, 0, 0.8));
  const bp = barrel.geometry.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i) / 0.475;
    const k = 1 + (1 - y * y) * 0.18;
    bp.setX(i, bp.getX(i) * k);
    bp.setZ(i, bp.getZ(i) * k);
  }
  barrel.geometry.computeVertexNormals();
  barrel.rotation.z = Math.PI / 2;
  barrel.position.y = 1.7;
  g.add(shaft, barrel);
  for (const x of [-0.38, -0.12, 0.12, 0.38]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.46 + (Math.abs(x) < 0.2 ? 0.05 : 0.02), 0.022, 6, 24), darkSteel());
    hoop.rotation.y = Math.PI / 2;
    hoop.position.set(x, 1.7, 0);
    g.add(hoop);
  }
  const bung = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), M(0x2a1a10));
  bung.position.set(0, 2.18, 0);
  g.add(bung);
  return g;
}

export function bow() {
  const g = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.75, 0), new THREE.Vector3(0, 0, 0.35), new THREE.Vector3(0, 0.75, 0));
  const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.018, 6), M(0x3a2414));
  const stringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.74, 0.0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.74, 0)]);
  const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xd8d0c0 }));
  g.add(limb, string);
  g.userData.string = string;
  return g;
}

export function arrow() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.8, 6), M(0x6a5030));
  shaft.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 4), steel());
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.44;
  g.add(shaft, head);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.1), M(0x8a1a1a, 0, 0.8, { side: THREE.DoubleSide }));
    f.position.z = -0.34;
    f.rotation.set(Math.PI / 2, (i / 3) * Math.PI * 2, 0);
    f.translateX(0.02);
    g.add(f);
  }
  return g;
}

export function towerShield() {
  const g = new THREE.Group();
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.06), M(0xffffff, 0.3, 0.6, { map: dropEmblemTex() }));
  g.add(s);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.1, 0.04), darkSteel());
  rim.position.z = -0.02;
  g.add(rim);
  return g;
}

// ------------------------------------------------------------------------------------------------ héros

export function makeMage() {
  const r = new Humanoid({ height: 1.85, bulk: 0.9, skin: 0xc9a58a, cloth: 0x1c2240 });
  const robeMat = M(0x1c2240, 0, 0.9);
  r.wear('hips', robe(0.17, 0.42, 1.0, robeMat, true), [0, 0.05, 0]);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.015, 4, 24), gold());
  r.wear('hips', trim, [0, -0.9, 0], [Math.PI / 2, 0, 0]);
  // chapeau pointu, cassé au sommet
  const hat = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.02, 24), robeMat);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.45, 16), robeMat);
  cone.position.y = 0.22;
  const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 10), robeMat);
  tipCone.position.set(-0.07, 0.48, 0);
  tipCone.rotation.z = 0.9;
  // détail absurde : un bouchon de liège pend au bord du chapeau
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 4), M(0x8a7a60));
  cord.position.set(0.2, -0.06, 0.1);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.04, 10), M(0xb08a5a, 0, 0.95));
  cork.position.set(0.2, -0.13, 0.1);
  hat.add(brim, cone, tipCone, cord, cork);
  r.wear('head', hat, [0, 0.15, 0], [-0.1, 0, 0.05]);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 10), M(0xd8d4cc, 0, 1));
  beard.rotation.x = Math.PI;
  r.wear('head', beard, [0, -0.04, 0.07], [0.15, 0, 0]);
  const st = staff();
  r.wear('handR', st, [0, -0.05, 0.02], [0, 0, 0]);
  const mantle = new Cape(0.5, 1.3, M(0x14182e, 0, 0.9));
  r.wear('chest', mantle, [0, 0.3, -0.12], [0.08, 0, 0]);
  return { rig: r, staff: st, cape: mantle };
}

export function makeSwordsman() {
  const r = new Humanoid({ height: 1.82, bulk: 1.05, skin: 0xc49a7c, cloth: 0x2a2c30 });
  const st = steel();
  // armure : plastron, épaulières, casque à bassinet
  const plate = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), st);
  plate.scale.set(1, 1.2, 0.75);
  r.wear('chest', plate, [0, 0.12, 0.02], [0.1, 0, 0]);
  for (const s of ['L', 'R'] as const) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), st);
    r.wear(`shoulder${s}`, pad, [0, 0.02, 0], [0, 0, s === 'L' ? -0.4 : 0.4]);
    const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.32, 10), st);
    r.wear(`shin${s}`, greave, [0, -0.2, 0.01]);
  }
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), st);
  helm.scale.set(1, 1.15, 1.1);
  r.wear('head', helm, [0, 0.07, 0]);
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.35, 6), M(0x8a1414));
  r.wear('head', plume, [0, 0.27, -0.06], [-1.1, 0, 0]);
  const cape = new Cape(0.62, 1.25, M(0x6a0f12, 0, 0.9));
  r.wear('chest', cape, [0, 0.28, -0.13], [0.05, 0, 0]);
  const sw = sword(1.0);
  r.wear('handR', sw, [0, -0.06, 0.02], [Math.PI / 2, 0, 0]);
  return { rig: r, sword: sw, cape };
}

export function makeSummoner() {
  const r = new Humanoid({ height: 1.75, bulk: 0.85, skin: 0x8f7f86, cloth: 0x2a1530 });
  const robeMat = M(0x2a1530, 0, 0.92);
  r.wear('hips', robe(0.16, 0.48, 0.98, robeMat, true), [0, 0.05, 0]);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.7), robeMat);
  hood.scale.set(1, 1.15, 1.2);
  r.wear('head', hood, [0, 0.07, -0.02], [-0.2, 0, 0]);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), M(0x050306));
  r.wear('head', face, [0, 0.05, 0.035]);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: 0x7affc8, toneMapped: false }));
    r.wear('head', eye, [s * 0.025, 0.06, 0.1]);
  }
  // grimoire flottant
  const book = new THREE.Group();
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.3), M(0x3a1010));
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.28), M(0xd8ccb0));
  pages.position.y = 0.01;
  book.add(cover, pages);
  r.wear('chest', book, [0.35, -0.05, 0.3], [0.5, 0.3, 0]);
  const handGlow: THREE.Mesh[] = [];
  for (const s of ['L', 'R'] as const) {
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4affb0, toneMapped: false, transparent: true, opacity: 0.9 }));
    r.wear(`hand${s}`, g, [0, -0.05, 0]);
    handGlow.push(g);
  }
  const cape = new Cape(0.55, 1.35, M(0x1a0c20, 0, 0.9));
  r.wear('chest', cape, [0, 0.3, -0.12]);
  return { rig: r, book, handGlow, cape };
}

export function makeBerserker() {
  const r = new Humanoid({ height: 2.05, bulk: 1.3, skin: 0xb98a6a, cloth: 0x3a2a1e });
  const fur = M(0x4a3a2a, 0, 1);
  for (const s of ['L', 'R'] as const) {
    const pelt = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), fur);
    pelt.scale.set(1.2, 0.8, 1.1);
    r.wear(`shoulder${s}`, pelt, [0, 0.04, 0]);
  }
  // bras nus
  r.j.upperArmL.children[0] && ((r.j.upperArmL.children[0] as THREE.Mesh).material = r.skinMat);
  r.j.upperArmR.children[0] && ((r.j.upperArmR.children[0] as THREE.Mesh).material = r.skinMat);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), darkSteel());
  r.wear('head', helm, [0, 0.08, 0]);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.12, 0.1, 0), new THREE.Vector3(s * 0.26, 0.18, 0.02), new THREE.Vector3(s * 0.3, 0.36, 0.06)]), 10, 0.03, 6),
      M(0xd8ccb0, 0, 0.6),
    );
    r.wear('head', horn, [0, 0, 0]);
  }
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 10), M(0x8a3a1a, 0, 1));
  beard.rotation.x = Math.PI;
  r.wear('head', beard, [0, -0.03, 0.08], [0.25, 0, 0]);
  const kilt = robe(0.2, 0.3, 0.42, M(0x2a1e14, 0, 1), true);
  r.wear('hips', kilt, [0, 0.03, 0]);
  const ax = axe();
  r.wear('handR', ax, [0, -0.06, 0.02], [Math.PI / 2, 0, 0]);
  const maul = barrelMaul();
  maul.visible = false;
  return { rig: r, axe: ax, maul };
}

export function makeRanger() {
  const r = new Humanoid({ height: 1.78, bulk: 0.9, skin: 0xc8a284, cloth: 0x26301e });
  const cloakMat = M(0x1e2818, 0, 0.95);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.68), cloakMat);
  hood.scale.set(1, 1.2, 1.15);
  r.wear('head', hood, [0, 0.07, -0.025], [-0.25, 0, 0]);
  const hoodTip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), cloakMat);
  r.wear('head', hoodTip, [0, 0.12, -0.14], [-1.9, 0, 0]);
  const cloak = new Cape(0.6, 1.25, cloakMat);
  r.wear('chest', cloak, [0, 0.3, -0.12]);
  const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.6, 10), leather());
  r.wear('chest', quiver, [0.1, 0.15, -0.16], [0.3, 0, 0.3]);
  for (let i = 0; i < 4; i++) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), M(0x6a5030));
    a.position.set(0.1 + (i - 1.5) * 0.02, 0.5, -0.06);
    quiver.add(a);
  }
  const bw = bow();
  r.wear('handL', bw, [0, -0.05, 0.03], [0, 0, 0]);
  const ar = arrow();
  r.wear('handR', ar, [0, -0.05, 0.25], [0, 0, 0]);
  return { rig: r, bow: bw, arrow: ar, cloak };
}

/** Garde de la Tempérance : armure noire, heaume à fente lumineuse, bouclier à la goutte d'eau. */
export function makeGuard(seed = 0) {
  const r = new Humanoid({ height: 1.9 + (seed % 3) * 0.04, bulk: 1.1, skin: 0x22252a, cloth: 0x1a1c20 });
  const ds = darkSteel();
  const plate = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), ds);
  plate.scale.set(1, 1.2, 0.8);
  r.wear('chest', plate, [0, 0.12, 0.02]);
  const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.3, 12), ds);
  r.wear('head', helm, [0, 0.07, 0]);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.015, 0.02), new THREE.MeshBasicMaterial({ color: 0x6ad8ff, toneMapped: false }));
  r.wear('head', slit, [0, 0.1, 0.115]);
  const sh = towerShield();
  r.wear('foreArmL', sh, [0.08, -0.12, 0.12], [0, -0.3, 0]);
  const sp = sword(0.8);
  r.wear('handR', sp, [0, -0.06, 0.02], [Math.PI / 2, 0, 0]);
  return { rig: r, shield: sh, sword: sp };
}
