// La Grande Prêtresse : robe noire déchirée, couronne d'épines de métal, regard luminescent,
// et d'immenses ailes noires dont les plumes semblent absorber la lumière.
import * as THREE from 'three';
import { Humanoid } from './rig';
import { featherTex } from './textures';

/** Matériau « absorbant » : presque noir, avec un liseré violet rasant (Fresnel) pour lire la silhouette. */
function voidMat(rim: THREE.ColorRepresentation, rimStrength = 1.2) {
  const m = new THREE.MeshStandardMaterial({ color: 0x010102, roughness: 1, metalness: 0, map: featherTex(), alphaTest: 0.45, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: new THREE.Color(rim) };
    sh.uniforms.uRimK = { value: rimStrength };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uRimK;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
        totalEmissiveRadiance += uRim * fr * uRimK;`,
      );
  };
  m.customProgramCacheKey = () => 'void-' + rimStrength;
  return m;
}

function featherGeo(len: number, width: number) {
  const g = new THREE.PlaneGeometry(width, len, 1, 3);
  g.translate(0, len / 2, 0);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    p.setY(i, -0.12 * (z * z) / len);
  }
  g.computeVertexNormals();
  return g;
}

export class DarkWing extends THREE.Group {
  arm = new THREE.Group();
  fore = new THREE.Group();
  hand = new THREE.Group();
  private fans: { g: THREE.Group; base: number; k: number; seg: number }[] = [];
  constructor(public s: 1 | -1, mat: THREE.Material) {
    super();
    this.add(this.arm);
    this.arm.add(this.fore);
    this.fore.position.x = s * 1.1;
    this.fore.add(this.hand);
    this.hand.position.x = s * 1.25;
    const bone = new THREE.MeshStandardMaterial({ color: 0x08070a, roughness: 0.9 });
    for (const [seg, len] of [[this.arm, 1.1], [this.fore, 1.25], [this.hand, 1.0]] as const) {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, len, 4, 8), bone);
      b.rotation.z = Math.PI / 2;
      b.position.x = (s * len) / 2;
      seg.add(b);
    }
    const row = (seg: THREE.Group, segI: number, n: number, x0: number, x1: number, len: (k: number) => number, fan: (k: number) => number, y: number, width: number) => {
      for (let i = 0; i < n; i++) {
        const k = n === 1 ? 0 : i / (n - 1);
        const piv = new THREE.Group();
        piv.position.set(s * (x0 + (x1 - x0) * k), y, 0.05);
        const f = new THREE.Mesh(featherGeo(len(k), width), mat);
        f.castShadow = true;
        piv.add(f);
        seg.add(piv);
        this.fans.push({ g: piv, base: fan(k), k, seg: segI });
      }
    };
    row(this.arm, 0, 9, 0.05, 1.05, (k) => 1.0 + k * 0.4, () => 0.08, 0, 0.32);
    row(this.fore, 1, 12, 0, 1.25, () => 1.45, (k) => 0.06 + k * 0.12, 0, 0.32);
    row(this.hand, 2, 11, 0, 0.95, (k) => 1.5 + Math.sin(k * Math.PI * 0.8) * 0.5, (k) => 0.15 + k * 1.15, 0.01, 0.3);
    // couvertures
    row(this.arm, 0, 9, 0, 1.05, () => 0.55, () => 0.15, 0.03, 0.26);
    row(this.fore, 1, 11, 0, 1.25, () => 0.6, () => 0.2, 0.03, 0.26);
    row(this.hand, 2, 9, 0, 0.9, () => 0.55, (k) => 0.3 + k * 0.8, 0.04, 0.24);
  }
  /** open : 0 replié dans le dos, 1 grand ouvert ; t : temps (frémissement). */
  set(open: number, t: number, tremble = 0) {
    const s = this.s;
    const f = 1 - open;
    // repli : le bras plonge vers le bas et l'arrière, l'avant-bras et la main se referment
    // ouvertes, les ailes s'élèvent en V au-dessus des épaules
    this.arm.rotation.set(0, s * (-0.5 * open + f * 1.0), s * (0.25 * open - f * 1.15));
    this.fore.rotation.set(0, s * 0.32 * open - s * f * 2.4, s * open * 0.12);
    this.hand.rotation.set(0, s * f * 2.2, s * open * 0.08);
    for (const fan of this.fans) {
      const segYaw = fan.seg === 0 ? this.arm.rotation.y : fan.seg === 1 ? this.arm.rotation.y + this.fore.rotation.y : this.arm.rotation.y + this.fore.rotation.y + this.hand.rotation.y;
      fan.g.rotation.y = s * fan.base * (0.25 + 0.75 * open) - segYaw * f * 0.9;
      fan.g.rotation.x = Math.sin(t * 7 + fan.k * 9 + fan.seg) * 0.04 * (tremble + 0.2 * open);
    }
  }
}

export function makePriestess() {
  const rig = new Humanoid({ height: 2.1, bulk: 0.78, skin: 0x2e2a34, cloth: 0x0b090e, female: true });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b090e, roughness: 0.65, metalness: 0.15 });
  const goldM = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 0.9, roughness: 0.4 });
  // robe : longue, évasée, ourlet déchiré, traîne
  const robeGeo = new THREE.CylinderGeometry(0.17, 0.75, 1.15, 40, 10, true);
  robeGeo.translate(0, -0.575, 0);
  const rp = robeGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const y = rp.getY(i);
    const a = Math.atan2(rp.getZ(i), rp.getX(i));
    if (y < -1.1) {
      const tear = Math.abs(Math.sin(a * 7.3) * Math.sin(a * 3.1 + 1)) * 0.22;
      rp.setY(i, y + tear);
    }
    // traîne vers l'arrière
    const back = Math.max(0, -Math.sin(a));
    rp.setZ(i, rp.getZ(i) - back * Math.pow(Math.max(0, -y - 0.6), 2) * 1.4);
  }
  robeGeo.computeVertexNormals();
  const robe = new THREE.Mesh(robeGeo, new THREE.MeshStandardMaterial({ color: 0x09070b, roughness: 0.8, side: THREE.DoubleSide }));
  rig.wear('hips', robe, [0, 0.06, 0]);
  const bodice = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), black);
  bodice.scale.set(1, 1.35, 0.72);
  rig.wear('chest', bodice, [0, 0.14, 0.01]);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 24), goldM);
  rig.wear('spine', belt, [0, 0.03, 0], [Math.PI / 2, 0, 0]);
  // manches amples
  for (const s of ['L', 'R'] as const) {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 0.42, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x09070b, roughness: 0.85, side: THREE.DoubleSide }));
    sleeve.position.y = -0.2;
    rig.wear(`foreArm${s}`, sleeve, [0, -0.06, 0]);
  }
  // couronne d'épines de métal
  const crown = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 6, 24), goldM);
  band.rotation.x = Math.PI / 2;
  crown.add(band);
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2;
    const h = 0.16 + (Math.cos(a) > 0.2 ? 0.26 * Math.cos(a) : 0.05);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.007, h, 5), black);
    spike.position.set(Math.sin(a) * 0.105, h / 2, Math.cos(a) * 0.105);
    spike.rotation.set(Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
    crown.add(spike);
  }
  rig.wear('head', crown, [0, 0.13, -0.005], [-0.12, 0, 0]);
  // haut col dressé derrière la nuque
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.13, 0.42, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: 0x07060a, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
  rig.wear('chest', collar, [0, 0.42, -0.02]);
  const collarRim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.006, 4, 32, Math.PI * 0.8), goldM);
  rig.wear('chest', collarRim, [0, 0.63, -0.02], [Math.PI / 2, 0, Math.PI * 1.1]);
  // chevelure noire tombant dans le dos
  const hair = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, 0.9, 20, 1, true, Math.PI * 0.55, Math.PI * 0.9), new THREE.MeshStandardMaterial({ color: 0x050406, roughness: 0.6, side: THREE.DoubleSide }));
  rig.wear('head', hair, [0, -0.25, -0.03]);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.118, 16, 12, Math.PI * 0.55, Math.PI * 0.9, 0, Math.PI * 0.75), new THREE.MeshStandardMaterial({ color: 0x050406, roughness: 0.6, side: THREE.DoubleSide }));
  rig.wear('head', hood, [0, 0.075, -0.005]);
  // voile noir sur le haut du visage : on ne devine que la bouche et le menton
  const veil = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 20, 14, -Math.PI * 0.05, Math.PI * 1.1, Math.PI * 0.1, Math.PI * 0.46),
    new THREE.MeshStandardMaterial({ color: 0x030204, roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.93, side: THREE.DoubleSide }),
  );
  veil.scale.set(0.9, 1.07, 0.98);
  rig.wear('head', veil, [0, 0.117, 0.004]);
  const lips = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 6), new THREE.MeshStandardMaterial({ color: 0x3a0e1c, roughness: 0.35 }));
  lips.scale.set(1.3, 0.35, 0.6);
  rig.wear('head', lips, [0, 0.0, 0.1]);
  // yeux
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8b8ff, toneMapped: false, transparent: true });
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), eyeMat);
    e.scale.set(1.4, 0.6, 0.6);
    rig.wear('head', e, [s * 0.032, 0.07, 0.124]);
    eyes.push(e);
  }
  // ailes
  const featherM = voidMat(0x7a3ad0, 2.2);
  const wings = [new DarkWing(1, featherM), new DarkWing(-1, featherM)];
  // plan de l'aile redressé à la verticale : vues de face, les ailes forment un éventail
  for (const w of wings) rig.wear('chest', w, [w.s * 0.1, 0.3, -0.13], [-1.25, 0, 0]);
  rig.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return { rig, wings, eyes, eyeMat, featherMat: featherM };
}
