// Squelette humanoïde articulé + système de poses clés (interpolation par quaternions) :
// chaque personnage a ses proportions, son costume, ses armes et ses animations.
import * as THREE from 'three';

export const JOINTS = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'upperArmL', 'foreArmL', 'handL',
  'shoulderR', 'upperArmR', 'foreArmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
] as const;
export type Joint = (typeof JOINTS)[number];
export type Pose = Partial<Record<Joint, [number, number, number]>> & { root?: [number, number, number]; rootRot?: [number, number, number] };

export interface Proportions {
  height: number;
  bulk: number; // carrure
  skin: THREE.ColorRepresentation;
  cloth: THREE.ColorRepresentation;
  female?: boolean;
}

const mat = (color: THREE.ColorRepresentation, metal = 0, rough = 0.8) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });

export class Humanoid extends THREE.Group {
  j = {} as Record<Joint, THREE.Group>;
  base = {} as Record<Joint, THREE.Quaternion>;
  root = new THREE.Group();
  dims: { hipY: number; upper: number; fore: number; thigh: number; shin: number; shoulder: number; head: number; chest: number; spine: number };
  skinMat: THREE.MeshStandardMaterial;
  clothMat: THREE.MeshStandardMaterial;

  constructor(public p: Proportions) {
    super();
    const h = p.height, b = p.bulk;
    this.dims = { hipY: 0.52 * h, upper: 0.17 * h, fore: 0.155 * h, thigh: 0.245 * h, shin: 0.245 * h, shoulder: (p.female ? 0.085 : 0.1) * h * b, head: 0.062 * h, chest: 0.17 * h, spine: 0.11 * h };
    const d = this.dims;
    this.skinMat = mat(p.skin, 0, 0.65);
    this.clothMat = mat(p.cloth, 0, 0.9);
    this.add(this.root);
    const J = (name: Joint, parent: THREE.Object3D, pos: [number, number, number]) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(...pos);
      parent.add(g);
      this.j[name] = g;
      return g;
    };
    const hips = J('hips', this.root, [0, d.hipY, 0]);
    const spine = J('spine', hips, [0, 0.04 * h, 0]);
    const chest = J('chest', spine, [0, d.spine, 0]);
    const neck = J('neck', chest, [0, d.chest, 0]);
    J('head', neck, [0, 0.045 * h, 0]);
    for (const s of [1, -1] as const) {
      const L = s === 1 ? 'L' : 'R';
      const sh = J(`shoulder${L}` as Joint, chest, [s * d.shoulder, d.chest * 0.88, 0]);
      const ua = J(`upperArm${L}` as Joint, sh, [s * 0.03 * h * b, 0, 0]);
      const fa = J(`foreArm${L}` as Joint, ua, [0, -d.upper, 0]);
      J(`hand${L}` as Joint, fa, [0, -d.fore, 0]);
      const th = J(`thigh${L}` as Joint, hips, [s * 0.055 * h * b, -0.02 * h, 0]);
      const sn = J(`shin${L}` as Joint, th, [0, -d.thigh, 0]);
      J(`foot${L}` as Joint, sn, [0, -d.shin, 0]);
    }
    this.buildBody();
    for (const k of JOINTS) this.base[k] = this.j[k].quaternion.clone();
    this.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  }

  /** Volumes du corps : capsules attachées aux articulations. */
  private buildBody() {
    const { height: h, bulk: b, female } = this.p;
    const d = this.dims;
    const cap = (r: number, len: number, m: THREE.Material) => {
      const g = new THREE.CapsuleGeometry(r, len, 4, 10);
      g.translate(0, -len / 2, 0);
      return new THREE.Mesh(g, m);
    };
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.1 * h * b * (female ? 0.85 : 1), d.chest * 0.75, 6, 12), this.clothMat);
    torso.scale.set(1, 1, 0.62);
    torso.position.y = d.chest * 0.45;
    this.j.chest.add(torso);
    const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.085 * h * b * (female ? 0.8 : 1), d.spine * 0.6, 6, 12), this.clothMat);
    belly.scale.set(1, 1, 0.65);
    belly.position.y = d.spine * 0.4;
    this.j.spine.add(belly);
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.09 * h * b, 12, 10), this.clothMat);
    pelvis.scale.set(1.1, 0.7, 0.75);
    this.j.hips.add(pelvis);
    const neck = cap(0.03 * h * b, 0.03 * h, this.skinMat);
    neck.position.y = 0.04 * h;
    this.j.neck.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(d.head, 18, 14), this.skinMat);
    head.scale.set(0.88, 1.05, 0.95);
    head.position.y = d.head * 0.9;
    this.j.head.add(head);
    this.j.head.userData.headMesh = head;
    for (const s of ['L', 'R'] as const) {
      this.j[`upperArm${s}`].add(cap(0.033 * h * b, d.upper * 0.9, this.clothMat));
      this.j[`foreArm${s}`].add(cap(0.028 * h * b, d.fore * 0.85, this.skinMat));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.03 * h, 8, 6), this.skinMat);
      hand.scale.set(0.8, 1.2, 0.5);
      hand.position.y = -0.03 * h;
      this.j[`hand${s}`].add(hand);
      this.j[`thigh${s}`].add(cap(0.045 * h * b, d.thigh * 0.9, this.clothMat));
      this.j[`shin${s}`].add(cap(0.036 * h * b, d.shin * 0.9, this.clothMat));
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06 * h, 0.04 * h, 0.13 * h), mat(0x1c1612));
      foot.position.set(0, -0.02 * h, 0.03 * h);
      this.j[`foot${s}`].add(foot);
    }
  }

  /** Attache un objet à une articulation (arme, accessoire, vêtement). */
  wear(joint: Joint, obj: THREE.Object3D, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) {
    obj.position.set(...pos);
    obj.rotation.set(...rot);
    this.j[joint].add(obj);
    obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    return obj;
  }

  private static _q = new THREE.Quaternion();
  private static _e = new THREE.Euler();
  /** Applique une pose (angles d'Euler relatifs à la pose de repos). */
  apply(p: Pose) {
    for (const k of JOINTS) {
      const a = p[k];
      const q = this.j[k].quaternion.copy(this.base[k]);
      if (a) q.multiply(Humanoid._q.setFromEuler(Humanoid._e.set(a[0], a[1], a[2])));
    }
    this.root.position.set(...(p.root ?? [0, 0, 0]));
    this.root.rotation.set(...(p.rootRot ?? [0, 0, 0]));
  }
}

/** Mélange linéaire de deux poses (angles), avec facteur k. */
export function mixPose(a: Pose, b: Pose, k: number): Pose {
  const out: Pose = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Pose>;
  for (const key of keys) {
    const va = (a[key] ?? [0, 0, 0]) as [number, number, number];
    const vb = (b[key] ?? [0, 0, 0]) as [number, number, number];
    (out as Record<string, [number, number, number]>)[key] = [va[0] + (vb[0] - va[0]) * k, va[1] + (vb[1] - va[1]) * k, va[2] + (vb[2] - va[2]) * k];
  }
  return out;
}

/** Clip d'animation : poses clés datées (secondes locales), interpolation adoucie. */
export class Clip {
  constructor(public keys: { t: number; pose: Pose; ease?: (x: number) => number }[]) {}
  sample(t: number): Pose {
    const k = this.keys;
    if (t <= k[0].t) return k[0].pose;
    for (let i = 1; i < k.length; i++) {
      if (t <= k[i].t) {
        const x = (t - k[i - 1].t) / (k[i].t - k[i - 1].t);
        const e = k[i].ease ?? ((v: number) => v * v * (3 - 2 * v));
        return mixPose(k[i - 1].pose, k[i].pose, e(x));
      }
    }
    return k[k.length - 1].pose;
  }
}

/** Respiration / balancement de garde, à superposer aux poses. */
export function idle(t: number, seed = 0, amp = 1): Pose {
  const s = Math.sin(t * 1.6 + seed), c = Math.sin(t * 0.9 + seed * 2);
  return {
    spine: [0.03 * s * amp, 0.02 * c * amp, 0],
    chest: [0.02 * s * amp, 0, 0],
    head: [0.03 * c * amp, 0.05 * Math.sin(t * 0.5 + seed) * amp, 0],
    upperArmL: [0, 0, 0.12 + 0.02 * s * amp],
    upperArmR: [0, 0, -0.12 - 0.02 * s * amp],
    foreArmL: [-0.15, 0, 0],
    foreArmR: [-0.15, 0, 0],
  };
}

/** Cycle de marche / course paramétré par la phase. */
export function walk(phase: number, run = 0): Pose {
  const s = Math.sin(phase), c = Math.cos(phase);
  const A = 0.45 + run * 0.4;
  return {
    root: [0, Math.abs(c) * (0.03 + run * 0.06), 0],
    spine: [0.05 + run * 0.25, s * 0.06, 0],
    thighL: [-s * A, 0, 0], shinL: [Math.max(0, s) * (0.6 + run * 0.6), 0, 0],
    thighR: [s * A, 0, 0], shinR: [Math.max(0, -s) * (0.6 + run * 0.6), 0, 0],
    upperArmL: [s * A * 0.8, 0, 0.1], foreArmL: [-0.3 - run * 0.8, 0, 0],
    upperArmR: [-s * A * 0.8, 0, -0.1], foreArmR: [-0.3 - run * 0.8, 0, 0],
  };
}

/** Somme de poses (pour superposer une couche additive). */
export function addPose(a: Pose, b: Pose): Pose {
  const out: Pose = { ...a };
  for (const key of Object.keys(b) as (keyof Pose)[]) {
    const va = (a[key] ?? [0, 0, 0]) as [number, number, number];
    const vb = b[key] as [number, number, number];
    (out as Record<string, [number, number, number]>)[key] = [va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]];
  }
  return out;
}
