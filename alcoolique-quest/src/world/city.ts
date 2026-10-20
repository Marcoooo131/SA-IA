// Générateur de la grande cité médiévale : remparts et tours, porte monumentale, statues de héros oubliés,
// avenue marchande, forges, canal et ponts, cathédrales, tour centrale, foule instanciée.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/math';
import { rockify } from './terrain';
import { bannerTex, facadeEmissiveTex, facadeTex, flagstoneTex, roseWindowTex } from './textures';
import { makeMage, makeSwordsman } from './characters';
import type { Humanoid } from './rig';

export const CITY = { R: 300, gateZ: 300, plaza: new THREE.Vector3(0, 0, 20), tower: new THREE.Vector3(0, 0, -90), canalZ: 160 };

const stoneMat = (color = 0x7a746c, scale = 0.35) => rockify(new THREE.MeshStandardMaterial({ color, roughness: 0.92 }), scale, 0.5, 0.06, 0.6);
const slate = () => new THREE.MeshStandardMaterial({ color: 0x2e3038, roughness: 0.75, metalness: 0.1 });

function merge(parts: THREE.BufferGeometry[]) {
  return mergeGeometries(parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  }))!;
}

/** Statue colossale : un héros figé dans la pierre (le second lève une chope… de pierre). */
function heroStatue(kind: 'sword' | 'goblet', scale: number) {
  const stone = stoneMat(0x8a857c, 2.2);
  const c = kind === 'sword' ? makeSwordsman() : makeMage();
  const rig: Humanoid = c.rig;
  rig.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.material = stone;
  });
  if (kind === 'sword') {
    // épée plantée devant lui, mains sur le pommeau
    rig.apply({ upperArmL: [-0.5, 0, -0.35], foreArmL: [-0.9, 0, 0], upperArmR: [-0.5, 0, 0.35], foreArmR: [-0.9, 0, 0], head: [0.15, 0, 0] });
    const sw = (c as ReturnType<typeof makeSwordsman>).sword;
    sw.rotation.set(Math.PI, 0, 0);
    sw.position.set(-0.05, 0.05, 0.05);
  } else {
    // le bras levé, il porte un toast éternel
    rig.apply({ upperArmR: [-2.6, 0, 0.2], foreArmR: [-0.4, 0, 0], head: [-0.2, 0, 0] });
    const goblet = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.16, 12), stone);
    cup.position.y = 0.1;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10), stone);
    handle.position.set(0.1, 0.1, 0);
    goblet.add(cup, handle);
    rig.wear('handR', goblet, [0, -0.08, 0.05], [Math.PI, 0, 0]);
    (c as ReturnType<typeof makeMage>).staff.visible = false;
  }
  if ('cape' in c) (c.cape as { sway: (t: number, w: number) => void }).sway(0, 0.2);
  const g = new THREE.Group();
  rig.scale.setScalar(scale);
  g.add(rig);
  const ped = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 14), stoneMat(0x6a655e, 0.8));
  ped.position.y = -4.5;
  g.add(ped);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = o.receiveShadow = true; } });
  return g;
}

/** Façade de maison : boîte texturée (colombages, fenêtres éclairées) + toit à deux pans. */
function houseGeometry() {
  const body = new THREE.BoxGeometry(1, 1, 1);
  body.translate(0, 0.5, 0);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.56, 0); roofShape.lineTo(0, 0.55); roofShape.lineTo(0.56, 0); roofShape.lineTo(-0.56, 0);
  const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 1.08, bevelEnabled: false });
  roof.translate(0, 0, -0.54);
  return { body, roof };
}

export function buildCity(quality: 'low' | 'high') {
  const hi = quality === 'high';
  const r = rng(77);
  const g = new THREE.Group();
  const wallMat = stoneMat(0x6f6960, 0.25);
  const roofMat = slate();

  // ------------------------------------------------------------------ sol
  const flag = flagstoneTex().clone();
  flag.repeat.set(90, 90);
  flag.needsUpdate = true;
  // sol pavé en deux moitiés : le canal reste à ciel ouvert
  const groundMat = rockify(new THREE.MeshStandardMaterial({ color: 0x6a645c, map: flag, roughness: 0.95 }), 0.3, 0.3, 0, 0.2);
  for (const sgn of [-1, 1]) {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      const x = Math.cos(a) * CITY.R, z = Math.sin(a) * CITY.R;
      // on écrase le cercle sur la berge : le contour suit le rempart puis longe le canal
      const zc = sgn < 0 ? Math.min(z, CITY.canalZ - 11) : Math.max(z, CITY.canalZ + 11);
      const half = Math.sqrt(Math.max(0, CITY.R * CITY.R - zc * zc));
      pts.push(new THREE.Vector2(THREE.MathUtils.clamp(x, -half, half), -zc));
    }
    const part = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts), 1), groundMat);
    part.geometry.rotateX(-Math.PI / 2);
    // UV planaires à l'échelle des dalles
    const uv = part.geometry.attributes.uv, pp = part.geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / (CITY.R * 2) + 0.5, pp.getZ(i) / (CITY.R * 2) + 0.5);
    part.receiveShadow = true;
    g.add(part);
  }
  const groundOut = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), rockify(new THREE.MeshStandardMaterial({ color: 0x3a3424, roughness: 1 }), 0.05, 0.6, 0, 0.3));
  groundOut.rotation.x = -Math.PI / 2;
  groundOut.position.y = -0.3;
  groundOut.receiveShadow = true;
  g.add(groundOut);

  // ------------------------------------------------------------------ remparts
  const wallParts: THREE.BufferGeometry[] = [];
  const crenels: THREE.Matrix4[] = [];
  const towerPos: THREE.Vector3[] = [];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2 + Math.PI / 2 + Math.PI / N;
    const a1 = ((i + 1) / N) * Math.PI * 2 + Math.PI / 2 + Math.PI / N;
    const p0 = new THREE.Vector3(Math.cos(a0) * CITY.R, 0, Math.sin(a0) * CITY.R);
    const p1 = new THREE.Vector3(Math.cos(a1) * CITY.R, 0, Math.sin(a1) * CITY.R);
    towerPos.push(p0);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const len = p0.distanceTo(p1);
    const ang = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    const isGate = Math.abs(mid.x) < 60 && mid.z > 0;
    const segs = isGate ? [[-len / 2, -20], [20, len / 2]] : [[-len / 2, len / 2]];
    for (const [s0, s1] of segs) {
      const w = new THREE.BoxGeometry(12, 42, s1 - s0);
      w.translate(0, 21, (s0 + s1) / 2);
      w.rotateY(ang);
      w.translate(mid.x, 0, mid.z);
      wallParts.push(w);
      for (let s = s0 + 1.5; s < s1 - 1; s += 3) {
        for (const off of [-5.4, 5.4]) {
          const m = new THREE.Matrix4().makeRotationY(ang);
          m.setPosition(new THREE.Vector3(off, 43.2, s).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).add(mid));
          crenels.push(m);
        }
      }
    }
  }
  // porte monumentale : deux tours, arche, herse
  for (const sx of [-27, 27]) {
    const t = new THREE.CylinderGeometry(14, 16, 78, 14);
    t.translate(sx, 39, CITY.gateZ);
    wallParts.push(t);
  }
  const lintel = new THREE.BoxGeometry(42, 18, 14);
  lintel.translate(0, 50, CITY.gateZ);
  wallParts.push(lintel);
  const arch = new THREE.TorusGeometry(10, 2.5, 8, 20, Math.PI);
  arch.translate(0, 31, CITY.gateZ + 7);
  wallParts.push(arch);
  for (const p of towerPos) {
    if (Math.abs(p.x) < 50 && p.z > 0) continue;
    const t = new THREE.CylinderGeometry(13, 15, 62, 14);
    t.translate(p.x, 31, p.z);
    wallParts.push(t);
  }
  const walls = new THREE.Mesh(merge(wallParts), wallMat);
  walls.castShadow = walls.receiveShadow = true;
  g.add(walls);
  const cren = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 2.4, 1.6), wallMat, crenels.length);
  crenels.forEach((m, i) => cren.setMatrixAt(i, m));
  cren.castShadow = true;
  g.add(cren);
  // toits des tours
  const roofs: THREE.BufferGeometry[] = [];
  for (const p of towerPos) {
    if (Math.abs(p.x) < 50 && p.z > 0) continue;
    const c = new THREE.ConeGeometry(16.5, 30, 14);
    c.translate(p.x, 62 + 15, p.z);
    roofs.push(c);
  }
  for (const sx of [-27, 27]) {
    const c = new THREE.ConeGeometry(17.5, 36, 14);
    c.translate(sx, 78 + 18, CITY.gateZ);
    roofs.push(c);
  }
  const towerRoofs = new THREE.Mesh(merge(roofs), roofMat);
  towerRoofs.castShadow = true;
  g.add(towerRoofs);
  const portcullis = new THREE.Group();
  for (let x = -9; x <= 9; x += 2) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 18, 0.5), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, metalness: 0.7, roughness: 0.5 }));
    bar.position.set(x, 32, CITY.gateZ + 4);
    portcullis.add(bar);
  }
  g.add(portcullis);
  // bannières sur les tours de la porte
  for (const sx of [-27, 27]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(9, 30, 1, 8), new THREE.MeshStandardMaterial({ map: bannerTex('#5a0e12'), side: THREE.DoubleSide, roughness: 0.9, transparent: true, alphaTest: 0.5 }));
    b.position.set(sx, 50, CITY.gateZ + 16.2);
    g.add(b);
  }

  // ------------------------------------------------------------------ statues des héros oubliés
  const statues = [heroStatue('sword', 20), heroStatue('goblet', 20)];
  statues[0].position.set(-48, 9, CITY.gateZ + 48);
  statues[0].rotation.y = 0.25;
  statues[1].position.set(48, 9, CITY.gateZ + 48);
  statues[1].rotation.y = -0.25;
  g.add(...statues);

  // ------------------------------------------------------------------ maisons
  const { body, roof } = houseGeometry();
  const facade = facadeTex().clone();
  facade.repeat.set(2, 2);
  facade.needsUpdate = true;
  const facadeE = facadeEmissiveTex().clone();
  facadeE.repeat.set(2, 2);
  facadeE.needsUpdate = true;
  const houseMat = new THREE.MeshStandardMaterial({ color: 0xb8a890, map: facade, emissive: 0xffffff, emissiveMap: facadeE, emissiveIntensity: 1.4, roughness: 0.9 });
  const count = hi ? 1700 : 800;
  const houses = new THREE.InstancedMesh(body, houseMat, count);
  const roofsI = new THREE.InstancedMesh(roof, roofMat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const col = new THREE.Color();
  let k = 0;
  const place = (x: number, z: number, w: number, d: number, h: number, ang: number) => {
    if (k >= count) return;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    sc.set(w, h, d);
    m.compose(pos.set(x, 0, z), q, sc);
    houses.setMatrixAt(k, m);
    houses.setColorAt(k, col.setHSL(0.08 + r.range(-0.02, 0.03), r.range(0.1, 0.3), r.range(0.5, 0.75)));
    // toit à deux pans posé sur la maison, pente proportionnelle à la largeur
    const rm = new THREE.Matrix4().compose(new THREE.Vector3(x, h, z), q, new THREE.Vector3(w, Math.min(w, d) * r.range(0.8, 1.15), d));
    roofsI.setMatrixAt(k, rm);
    k++;
  };
  // rangées le long de l'avenue (façades alignées, plus hautes près de la place)
  for (const side of [-1, 1]) {
    for (let z = CITY.gateZ - 26; z > 60; ) {
      const d = r.range(9, 14);
      if (Math.abs(z - CITY.canalZ) < 16) { z -= 34; continue; }
      const w = r.range(10, 13);
      place(side * (11 + w / 2), z - d / 2, w, d, r.range(14, 24), 0);
      z -= d + r.range(0, 0.8);
    }
  }
  // le reste de la ville
  let guard = 0;
  while (k < count && guard++ < 40000) {
    const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.range(0.02, 1)) * (CITY.R - 22);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < 34 && z > 40) continue; // avenue
    if (Math.hypot(x - CITY.plaza.x, z - CITY.plaza.z) < 70) continue; // place
    if (Math.hypot(x - CITY.tower.x, z - CITY.tower.z) < 45) continue; // tour
    if (Math.abs(z - CITY.canalZ) < 18) continue; // canal
    if (Math.hypot(x + 150, z + 40) < 60 || Math.hypot(x - 160, z - 60) < 45) continue; // cathédrales
    const w = r.range(8, 15), dd = r.range(8, 15);
    // orientation : alignée sur la direction du centre (rues concentriques)
    place(x, z, w, dd, r.range(10, 22) * (1 - d / 900), a + Math.PI / 2 + r.range(-0.1, 0.1));
  }
  houses.count = roofsI.count = k;
  houses.castShadow = houses.receiveShadow = true;
  roofsI.castShadow = true;
  g.add(houses, roofsI);

  // ------------------------------------------------------------------ canal et ponts
  const water = new THREE.Mesh(new THREE.PlaneGeometry(CITY.R * 2, 22), new THREE.MeshStandardMaterial({ color: 0x0c1418, metalness: 0.9, roughness: 0.12 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -2.5, CITY.canalZ);
  g.add(water);
  const canalParts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const bank = new THREE.BoxGeometry(CITY.R * 2, 3.2, 1.5);
    bank.translate(0, -1.2, CITY.canalZ + s * 11.5);
    canalParts.push(bank);
  }
  for (const bx of [0, -120, 130]) {
    const deck = new THREE.BoxGeometry(bx === 0 ? 22 : 10, 1.6, 26);
    deck.translate(bx, 0.3, CITY.canalZ);
    canalParts.push(deck);
    const arc = new THREE.TorusGeometry(8, 1.2, 6, 16, Math.PI);
    arc.rotateY(Math.PI / 2);
    arc.translate(bx, -6.5, CITY.canalZ);
    canalParts.push(arc);
    for (const s of [-1, 1]) {
      const rail = new THREE.BoxGeometry(0.8, 1.4, 26);
      rail.translate(bx + s * (bx === 0 ? 10.6 : 4.6), 1.6, CITY.canalZ);
      canalParts.push(rail);
    }
  }
  const canal = new THREE.Mesh(merge(canalParts), wallMat);
  canal.castShadow = canal.receiveShadow = true;
  g.add(canal);

  // ------------------------------------------------------------------ tour centrale
  const tParts: THREE.BufferGeometry[] = [];
  const T = CITY.tower;
  const lvl = [[26, 30, 60, 8], [19, 22, 110, 8], [14, 16, 70, 8]] as const;
  let y = 0;
  for (const [rt, rb, h, seg] of lvl) {
    const c = new THREE.CylinderGeometry(rt, rb, h, seg);
    c.translate(T.x, y + h / 2, T.z);
    tParts.push(c);
    // contreforts
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2 + Math.PI / seg;
      const b = new THREE.BoxGeometry(3, h * 0.9, 6);
      b.translate(0, y + h * 0.45, rb + 1.5);
      b.rotateY(a);
      b.translate(T.x, 0, T.z);
      tParts.push(b);
      const pin = new THREE.ConeGeometry(2, 10, 4);
      pin.translate(0, y + h + 4, rt + 1);
      pin.rotateY(a);
      pin.translate(T.x, 0, T.z);
      tParts.push(pin);
    }
    y += h;
  }
  const tower = new THREE.Mesh(merge(tParts), stoneMat(0x6a645e, 0.2));
  tower.castShadow = tower.receiveShadow = true;
  g.add(tower);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(15, 80, 8), roofMat);
  spire.position.set(T.x, y + 40, T.z);
  spire.castShadow = true;
  g.add(spire);
  // fenêtres lumineuses de la tour
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffa860, toneMapped: false });
  const wins = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 4.5, 0.6), winMat, 160);
  let wk = 0;
  for (let i = 0; i < 160; i++) {
    const level = r.int(0, 2);
    const [, rb, h] = lvl[level];
    const base = level === 0 ? 0 : level === 1 ? 60 : 170;
    const a = r.range(0, Math.PI * 2);
    const yy = base + r.range(8, h - 8);
    const rad = rb - (yy - base) / h * (lvl[level][1] - lvl[level][0]) - 0.1;
    const mm = new THREE.Matrix4().makeRotationY(a);
    mm.setPosition(T.x + Math.sin(a) * rad, yy, T.z + Math.cos(a) * rad);
    if (r.next() < 0.6) wins.setMatrixAt(wk++, mm);
  }
  wins.count = wk;
  g.add(wins);

  // ------------------------------------------------------------------ cathédrales
  const cathedral = (cx: number, cz: number, s: number, rot: number) => {
    const c = new THREE.Group();
    const parts: THREE.BufferGeometry[] = [];
    const nave = new THREE.BoxGeometry(26, 34, 80);
    nave.translate(0, 17, 0);
    parts.push(nave);
    for (const sx of [-17, 17]) {
      const aisle = new THREE.BoxGeometry(10, 18, 76);
      aisle.translate(sx, 9, 0);
      parts.push(aisle);
      const t = new THREE.BoxGeometry(14, 64, 14);
      t.translate(sx * 0.75, 32, 44);
      parts.push(t);
      for (let z = -32; z <= 32; z += 10) {
        const fb = new THREE.BoxGeometry(2, 20, 2);
        fb.rotateZ(sx > 0 ? -0.6 : 0.6);
        fb.translate(sx * 1.05, 26, z);
        parts.push(fb);
      }
    }
    const body = new THREE.Mesh(merge(parts), stoneMat(0x726c64, 0.3));
    body.castShadow = body.receiveShadow = true;
    c.add(body);
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-14, 0); roofShape.lineTo(0, 16); roofShape.lineTo(14, 0);
    const rf = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 82, bevelEnabled: false }), roofMat);
    rf.position.set(0, 34, -41);
    rf.castShadow = true;
    c.add(rf);
    for (const sx of [-12.75, 12.75]) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(8, 56, 8), roofMat);
      sp.position.set(sx, 64 + 28, 44);
      sp.castShadow = true;
      c.add(sp);
    }
    const rose = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshBasicMaterial({ map: roseWindowTex(), toneMapped: false, color: 0xbfbfbf }));
    rose.position.set(0, 24, 40.2);
    c.add(rose);
    c.position.set(cx, 0, cz);
    c.rotation.y = rot;
    c.scale.setScalar(s);
    g.add(c);
  };
  cathedral(-150, -40, 1.1, 0.35);
  cathedral(160, 60, 0.85, -1.2);

  // ------------------------------------------------------------------ avenue : étals, forges, lanternes
  const stallFrame = new THREE.BoxGeometry(0.3, 4, 0.3);
  const awningGeo = new THREE.PlaneGeometry(6, 4.5);
  const awningCols = [0x7a1a14, 0x9a7a2a, 0x1f3a6a, 0x5a2a4a, 0x3a5a2a];
  const stalls = new THREE.Group();
  for (const side of [-1, 1]) {
    for (let z = 270; z > 190; z -= r.range(9, 14)) {
      if (Math.abs(z - CITY.canalZ) < 16) continue;
      const s = new THREE.Group();
      for (const [dx, dz] of [[-2.7, -1.8], [2.7, -1.8], [-2.7, 1.8], [2.7, 1.8]]) {
        const post = new THREE.Mesh(stallFrame, new THREE.MeshStandardMaterial({ color: 0x3a2818 }));
        post.position.set(dx, 2, dz);
        s.add(post);
      }
      const aw = new THREE.Mesh(awningGeo, new THREE.MeshStandardMaterial({ color: r.pick(awningCols), side: THREE.DoubleSide, roughness: 0.9 }));
      aw.rotation.set(-Math.PI / 2 + 0.3, 0, Math.PI / 2);
      aw.position.y = 4.2;
      s.add(aw);
      const table = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 2.5), new THREE.MeshStandardMaterial({ color: 0x4a3420 }));
      table.position.y = 1;
      s.add(table);
      for (let i = 0; i < 4; i++) {
        const goods = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshStandardMaterial({ color: r.pick([0x8a3a1a, 0xc9a050, 0x5a7a2a, 0x8a6a4a]) }));
        goods.position.set(r.range(-2, 2), 1.7, r.range(-0.8, 0.8));
        s.add(goods);
      }
      s.position.set(side * 8.2, 0, z);
      s.rotation.y = side > 0 ? 0 : Math.PI;
      s.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      stalls.add(s);
    }
  }
  g.add(stalls);
  const forges: THREE.Vector3[] = [];
  for (const [fx, fz] of [[-9, 185], [9, 132], [-9, 105]] as const) {
    const f = new THREE.Group();
    const hearth = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 2.6), wallMat);
    hearth.position.y = 1.2;
    const fire = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 0.2), new THREE.MeshBasicMaterial({ color: 0xff7a20, toneMapped: false }));
    fire.position.set(0, 1.3, 1.31);
    const anvil = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.5), new THREE.MeshStandardMaterial({ color: 0x222224, metalness: 0.8, roughness: 0.4 }));
    anvil.position.set(fx > 0 ? -2.5 : 2.5, 0.6, 1.5);
    f.add(hearth, fire, anvil);
    f.position.set(fx, 0, fz);
    f.rotation.y = fx > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(f);
    const light = new THREE.PointLight(0xff8a3a, 400, 40, 2);
    light.position.set(fx * 0.8, 2.5, fz);
    g.add(light);
    forges.push(new THREE.Vector3(fx * 0.85, 1.5, fz));
  }
  const lanterns = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false }), 80);
  let lk = 0;
  for (let z = 290; z > 60; z -= 12) for (const s of [-1, 1]) lanterns.setMatrixAt(lk++, new THREE.Matrix4().makeTranslation(s * 10.5, 6.5, z));
  lanterns.count = lk;
  g.add(lanterns);

  // ------------------------------------------------------------------ la grande place
  const plazaParts: THREE.BufferGeometry[] = [];
  const basin = new THREE.CylinderGeometry(7, 7.5, 1.2, 24);
  basin.translate(CITY.plaza.x, 0.6, CITY.plaza.z - 22);
  plazaParts.push(basin);
  const plinth = new THREE.BoxGeometry(3, 6, 3);
  plinth.translate(CITY.plaza.x, 3, CITY.plaza.z - 22);
  plazaParts.push(plinth);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const pole = new THREE.CylinderGeometry(0.18, 0.22, 12, 6);
    pole.translate(CITY.plaza.x + Math.cos(a) * 46, 6, CITY.plaza.z + Math.sin(a) * 46);
    plazaParts.push(pole);
  }
  const champion = heroStatue('sword', 2.6);
  champion.children[1].visible = false; // le socle de la fontaine sert de piédestal
  champion.position.set(CITY.plaza.x, 6, CITY.plaza.z - 22);
  champion.rotation.y = 0;
  g.add(champion);
  const plazaMesh = new THREE.Mesh(merge(plazaParts), wallMat);
  plazaMesh.castShadow = plazaMesh.receiveShadow = true;
  g.add(plazaMesh);
  const bannerMats = ['#5a0e12', '#13234a', '#3a2a10'].map((c, i) => new THREE.MeshStandardMaterial({ map: bannerTex(c, i), side: THREE.DoubleSide, transparent: true, alphaTest: 0.5, roughness: 0.9 }));
  const plazaBanners: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 5, 1, 6), bannerMats[i % 3]);
    b.position.set(CITY.plaza.x + Math.cos(a) * 46, 8.6, CITY.plaza.z + Math.sin(a) * 46 + 0.3);
    b.rotation.y = -a + Math.PI / 2;
    g.add(b);
    plazaBanners.push(b);
  }
  // tonneaux, caisses, râtelier : l'intendance des aventuriers
  for (let i = 0; i < 14; i++) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.85 }));
    barrel.position.set(CITY.plaza.x + r.range(-14, 14), 0.55, CITY.plaza.z + r.range(-8, 8));
    if (barrel.position.distanceTo(CITY.plaza) < 6) barrel.position.x += 10;
    barrel.castShadow = true;
    g.add(barrel);
  }

  // ------------------------------------------------------------------ foule instanciée (silhouettes)
  const personGeo = (() => {
    const body = new THREE.CylinderGeometry(0.22, 0.38, 1.45, 8);
    body.translate(0, 0.72, 0);
    const head = new THREE.SphereGeometry(0.15, 8, 6);
    head.translate(0, 1.62, 0);
    const hood = new THREE.ConeGeometry(0.2, 0.35, 8);
    hood.translate(0, 1.78, -0.03);
    return merge([body, head, hood]);
  })();
  const crowdN = hi ? 520 : 260;
  const crowd = new THREE.InstancedMesh(personGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), crowdN);
  const people: { x: number; z: number; dir: number; speed: number; phase: number; lane: number }[] = [];
  const pc = [0x3a3028, 0x2a2a30, 0x4a2a20, 0x5a4a3a, 0x24303a, 0x6a6a70, 0x3a1a1a];
  for (let i = 0; i < crowdN; i++) {
    const inPlaza = i % 3 === 0;
    const p = inPlaza
      ? { x: CITY.plaza.x + r.range(-40, 40), z: CITY.plaza.z + r.range(-30, 34), dir: r.range(0, Math.PI * 2), speed: r.range(0, 1.2), phase: r.range(0, 10), lane: 0 }
      : { x: r.range(-9, 9), z: r.range(60, 295), dir: r.next() < 0.5 ? 0 : Math.PI, speed: r.range(0.8, 1.6), phase: r.range(0, 10), lane: 1 };
    if (inPlaza && Math.hypot(p.x - CITY.plaza.x, p.z - (CITY.plaza.z - 6)) < 9) p.x += 18; // laisser la place aux héros
    people.push(p);
    crowd.setColorAt(i, col.set(r.pick(pc)).multiplyScalar(r.range(0.7, 1.2)));
  }
  crowd.castShadow = true;
  crowd.frustumCulled = false;
  g.add(crowd);
  const scaleV = new THREE.Vector3();
  const updateCrowd = (t: number) => {
    for (let i = 0; i < crowdN; i++) {
      const p = people[i];
      let x = p.x, z = p.z;
      if (p.lane === 1) {
        z = p.z + Math.cos(p.dir) * p.speed * t;
        z = 60 + ((((z - 60) % 235) + 235) % 235);
      } else {
        x += Math.sin(p.dir) * Math.sin(t * 0.2 + p.phase) * p.speed * 3;
        z += Math.cos(p.dir) * Math.sin(t * 0.2 + p.phase) * p.speed * 3;
      }
      const bob = Math.abs(Math.sin(t * 5 + p.phase)) * 0.06 * Math.min(1, p.speed);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.dir);
      const s = 0.9 + (i % 7) * 0.035;
      m.compose(pos.set(x, bob, z), q, scaleV.set(s, s, s));
      crowd.setMatrixAt(i, m);
    }
    crowd.instanceMatrix.needsUpdate = true;
  };

  return { group: g, forges, plazaBanners, updateCrowd };
}
