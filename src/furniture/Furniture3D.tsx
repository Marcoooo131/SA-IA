import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { FurnitureItem } from '@/domain/types';
import { getFurnitureModel, partColor, type FurniturePart } from './models';

// Géométries unitaires partagées (mises à l'échelle par objet) : scène légère.
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
const SPHERE = new THREE.SphereGeometry(0.5, 18, 12);
const materials = new Map<string, THREE.MeshStandardMaterial>();

function material(color: string, opacity = 1): THREE.MeshStandardMaterial {
  const key = `${color}|${opacity}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    materials.set(key, m);
  }
  return m;
}

/**
 * Transformation 3D d'un volume dans le repère local de l'objet
 * (x le long de la largeur, y vers le haut, z vers l'avant = y du plan).
 */
export function partTransform(p: FurniturePart, w: number, d: number, h: number) {
  const pw = p.w * w;
  const pd = p.d * d;
  const ph = p.h * h;
  const position: [number, number, number] = [-w / 2 + p.x * w + pw / 2, p.z * h + ph / 2, -d / 2 + p.y * d + pd / 2];
  if (p.shape === 'cylx') return { position, rotation: [0, 0, Math.PI / 2] as [number, number, number], scale: [ph, pw, pd] as [number, number, number] };
  if (p.shape === 'cyly') return { position, rotation: [Math.PI / 2, 0, 0] as [number, number, number], scale: [pw, pd, ph] as [number, number, number] };
  return { position, rotation: [0, 0, 0] as [number, number, number], scale: [pw, ph, pd] as [number, number, number] };
}

/** Position / orientation de l'objet dans la scène (mêmes données que le plan 2D). */
export function furnitureTransform(item: FurnitureItem): { position: [number, number, number]; rotationY: number } {
  const model = getFurnitureModel(item.modelId);
  return { position: [item.x, model?.elevation ?? 0, item.y], rotationY: (-item.rotation * Math.PI) / 180 };
}

export function FurnitureMesh({ item, selected, onSelect }: { item: FurnitureItem; selected?: boolean; onSelect?: (id: string) => void }) {
  const model = getFurnitureModel(item.modelId);
  if (!model) return null;
  const { position, rotationY } = furnitureTransform(item);
  const click = onSelect
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(item.id);
      }
    : undefined;
  return (
    <group position={position} rotation={[0, rotationY, 0]} onClick={click} name={`furniture-${item.id}`}>
      {model.parts.map((p, i) => {
        const t = partTransform(p, item.w, item.d, item.h);
        const geo = p.shape === 'sphere' ? SPHERE : p.shape === 'box' || p.shape === 'round' ? BOX : CYL;
        return <mesh key={i} geometry={geo} material={material(partColor(p, model, item.color), p.opacity ?? 1)} position={t.position} rotation={t.rotation} scale={t.scale} castShadow={(p.opacity ?? 1) >= 1} receiveShadow />;
      })}
      {selected && (
        <mesh position={[0, item.h / 2, 0]} scale={[item.w + 0.08, item.h + 0.08, item.d + 0.08]} geometry={BOX}>
          <meshBasicMaterial color="#d7001e" wireframe />
        </mesh>
      )}
    </group>
  );
}
