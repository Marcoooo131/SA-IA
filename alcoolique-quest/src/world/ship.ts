// Navire ancien (caraque) : coque effilée, châteaux avant/arrière, mâts et voiles gonflées.
import * as THREE from 'three';
import { rng } from '../core/math';

export function ship(seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.9 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.9 });
  const sailMat = new THREE.MeshStandardMaterial({ color: r.pick([0xb8ab90, 0x7a2a22, 0x9a917c]), roughness: 1, side: THREE.DoubleSide });

  // coque : boîte déformée (étrave pincée, poupe large, fond arrondi)
  const L = 30, W = 8, H = 6;
  const hull = new THREE.BoxGeometry(W, H, L, 4, 4, 16);
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i);
    const z = p.getZ(i);
    const k = z / (L / 2); // -1 poupe … +1 proue
    const pinch = k > 0 ? 1 - Math.pow(k, 2.2) * 0.95 : 1 - Math.pow(-k, 3) * 0.35;
    const depth = (y + H / 2) / H; // 0 fond … 1 pont
    x *= pinch * (0.45 + 0.55 * Math.sqrt(depth));
    y += Math.pow(Math.abs(k), 2) * 2.2; // tonture
    p.setXYZ(i, x, y, z);
  }
  hull.computeVertexNormals();
  const hullMesh = new THREE.Mesh(hull, wood);
  hullMesh.position.y = 1;
  g.add(hullMesh);
  const aft = new THREE.Mesh(new THREE.BoxGeometry(W * 0.95, 4, 8), darkWood);
  aft.position.set(0, 5.5, -L / 2 + 4.5);
  g.add(aft);
  const fore = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 2.5, 5), darkWood);
  fore.position.set(0, 5, L / 2 - 5);
  g.add(fore);
  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 12, 6), wood);
  bowsprit.rotation.x = Math.PI / 2 - 0.35;
  bowsprit.position.set(0, 6.5, L / 2 + 3);
  g.add(bowsprit);

  const masts: [number, number][] = [[4, 26], [-6, 20]];
  for (const [z, h] of masts) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, h, 6), wood);
    mast.position.set(0, 3 + h / 2, z);
    g.add(mast);
    for (const [yy, w, hh] of [[h * 0.45, 13, 8], [h * 0.82, 9, 5.5]] as const) {
      const sg = new THREE.PlaneGeometry(w, hh, 8, 6);
      const sp = sg.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const sx = sp.getX(i) / (w / 2), sy = sp.getY(i) / (hh / 2);
        sp.setZ(i, (1 - sx * sx) * (1 - sy * sy * 0.6) * 2.2);
      }
      sg.computeVertexNormals();
      const sail = new THREE.Mesh(sg, sailMat);
      sail.position.set(0, 3 + yy, z + 0.6);
      g.add(sail);
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, w + 1, 5), wood);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, 3 + yy + hh / 2, z + 0.3);
      g.add(yard);
    }
  }
  // fanion
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.2), new THREE.MeshStandardMaterial({ color: 0x5a1010, side: THREE.DoubleSide }));
  flag.position.set(0, 3 + 26 + 0.8, 4 - 2);
  flag.rotation.y = Math.PI / 2;
  g.add(flag);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}
