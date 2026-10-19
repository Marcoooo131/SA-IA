// Système de caméra cinématographique : trajectoires lissées (Catmull-Rom), visée, focale, roulis
// et « caméra portée » (micro-tremblement organique) pour éviter tout mouvement mécanique.
import * as THREE from 'three';
import { noise2 } from './math';

export interface CamKey {
  pos: THREE.Vector3Tuple;
  look: THREE.Vector3Tuple;
  fov?: number;
  roll?: number;
}

const _p = new THREE.Vector3();
const _l = new THREE.Vector3();

/** Trajectoire de caméra définie par des clés équidistantes en temps, interpolées en Catmull-Rom centripète. */
export class CamPath {
  private posCurve: THREE.CatmullRomCurve3;
  private lookCurve: THREE.CatmullRomCurve3;
  private fovs: number[];
  private rolls: number[];

  constructor(keys: CamKey[]) {
    const pts = keys.length === 1 ? [keys[0], keys[0]] : keys;
    this.posCurve = new THREE.CatmullRomCurve3(pts.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal');
    this.lookCurve = new THREE.CatmullRomCurve3(pts.map((k) => new THREE.Vector3(...k.look)), false, 'centripetal');
    this.fovs = pts.map((k) => k.fov ?? 40);
    this.rolls = pts.map((k) => k.roll ?? 0);
  }

  private scalar(arr: number[], u: number) {
    const f = u * (arr.length - 1);
    const i = Math.min(arr.length - 2, Math.floor(f));
    const x = f - i;
    const s = x * x * (3 - 2 * x);
    return arr[i] + (arr[i + 1] - arr[i]) * s;
  }

  apply(cam: THREE.PerspectiveCamera, u: number, shake = 0, time = 0) {
    u = Math.min(1, Math.max(0, u));
    this.posCurve.getPoint(u, _p);
    this.lookCurve.getPoint(u, _l);
    setCam(cam, _p, _l, this.scalar(this.fovs, u), this.scalar(this.rolls, u), shake, time);
  }
}

const _q = new THREE.Quaternion();
const _ax = new THREE.Vector3(0, 0, 1);

/** Place la caméra : position, cible, focale (fov vertical), roulis en radians, tremblement à la main. */
export function setCam(
  cam: THREE.PerspectiveCamera,
  pos: THREE.Vector3,
  look: THREE.Vector3,
  fov = 40,
  roll = 0,
  shake = 0,
  time = 0,
) {
  cam.position.copy(pos);
  if (shake > 0) {
    cam.position.x += noise2(time * 1.7, 3.1) * shake;
    cam.position.y += noise2(time * 1.9, 7.7) * shake;
  }
  cam.up.set(0, 1, 0);
  cam.lookAt(look);
  if (shake > 0) {
    cam.rotateX(noise2(time * 2.3, 11.3) * shake * 0.02);
    cam.rotateY(noise2(time * 2.1, 17.9) * shake * 0.02);
  }
  if (roll) cam.quaternion.multiply(_q.setFromAxisAngle(_ax, roll));
  if (cam.fov !== fov) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
}

/** Tremblement d'impact (secousse amortie) déclenché à des instants précis. */
export function impactShake(t: number, hits: number[], strength = 1, decay = 6): number {
  let s = 0;
  for (const h of hits) {
    const d = t - h;
    if (d >= 0 && d < 1.5) s += strength * Math.exp(-d * decay);
  }
  return s;
}

/** Trajectoire datée (acteur ou caméra) : points clés [temps, position] interpolés en Catmull-Rom. */
export class TimedPath {
  private curve: THREE.CatmullRomCurve3;
  private times: number[];
  constructor(keys: [number, THREE.Vector3Tuple][]) {
    this.times = keys.map((k) => k[0]);
    this.curve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k[1])), false, 'centripetal');
  }
  private u(t: number) {
    const ts = this.times;
    if (t <= ts[0]) return 0;
    if (t >= ts[ts.length - 1]) return 1;
    let i = 0;
    while (t > ts[i + 1]) i++;
    const f = (t - ts[i]) / (ts[i + 1] - ts[i]);
    return (i + f) / (ts.length - 1);
  }
  at(t: number, out = new THREE.Vector3()) {
    return this.curve.getPoint(this.u(t), out);
  }
  /** Vitesse approchée (unités/s) par différence finie. */
  velocity(t: number, out = new THREE.Vector3()) {
    const a = this.at(t - 0.05, new THREE.Vector3());
    return this.at(t + 0.05, out).sub(a).multiplyScalar(10);
  }
}
