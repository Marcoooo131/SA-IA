// La relique : une bouteille d'eau en plastique, parfaitement banale, modélisée avec le plus grand sérieux
// (profil de révolution, nervures, étiquette, bouchon cranté, eau intérieure, matériau transmissif).
import * as THREE from 'three';
import { bottleLabelTex } from './textures';

export function waterBottle() {
  const g = new THREE.Group();
  // profil (rayon, hauteur) en mètres : bouteille de 50 cl
  const prof: [number, number][] = [[0, 0], [0.024, 0.0], [0.031, 0.006], [0.0325, 0.016]];
  for (let y = 0.02; y <= 0.13; y += 0.005) {
    const ridge = y > 0.035 && y < 0.115 ? Math.abs(Math.sin((y - 0.035) * Math.PI / 0.0125)) * 0.0012 : 0;
    prof.push([0.0325 - ridge, y]);
  }
  prof.push([0.031, 0.14], [0.027, 0.152], [0.021, 0.163], [0.016, 0.172], [0.0135, 0.18], [0.0135, 0.186], [0.0175, 0.188], [0.0175, 0.191], [0.0138, 0.192], [0.0138, 0.196]);
  const shell = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 48);
  const plastic = new THREE.MeshPhysicalMaterial({
    color: 0xe8f4ff, roughness: 0.04, metalness: 0, transmission: 1, thickness: 0.004, ior: 1.46,
    clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, transparent: true, opacity: 1, side: THREE.DoubleSide,
  });
  const body = new THREE.Mesh(shell, plastic);
  g.add(body);
  // l'eau
  const waterProf = prof.filter(([, y]) => y <= 0.158).map(([x, y]) => new THREE.Vector2(Math.max(0, x - 0.0012), y + 0.001));
  waterProf.push(new THREE.Vector2(0, 0.158));
  const water = new THREE.Mesh(
    new THREE.LatheGeometry(waterProf, 40),
    new THREE.MeshPhysicalMaterial({ color: 0xcfe9ff, roughness: 0.02, transmission: 1, thickness: 0.06, ior: 1.33, attenuationColor: new THREE.Color(0x8fc8ff), attenuationDistance: 0.25 }),
  );
  g.add(water);
  // étiquette
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0331, 0.0331, 0.05, 48, 1, true),
    new THREE.MeshStandardMaterial({ map: bottleLabelTex(), roughness: 0.45, side: THREE.DoubleSide }),
  );
  label.position.y = 0.075;
  g.add(label);
  // bouchon bleu cranté
  const capGeo = new THREE.CylinderGeometry(0.0155, 0.0155, 0.02, 36, 1);
  const cp = capGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const a = Math.atan2(cp.getZ(i), cp.getX(i));
    const k = 1 + (Math.sin(a * 36) > 0 ? 0.035 : 0);
    if (Math.abs(cp.getY(i)) < 0.0099) { cp.setX(i, cp.getX(i) * k); cp.setZ(i, cp.getZ(i) * k); }
  }
  capGeo.computeVertexNormals();
  const cap = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x1a5fb4, roughness: 0.35 }));
  cap.position.y = 0.205;
  g.add(cap);
  g.userData.cap = cap;
  return g;
}
