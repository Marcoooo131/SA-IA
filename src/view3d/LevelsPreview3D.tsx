import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Dossier, Level } from '@/domain/types';
import { Scene3DContent, cameraPreset } from './Scene3D';

/** Maquette 3D interactive d'un plan non encore enregistré (aperçu de génération). */
export function LevelsPreview3D({ levels }: { levels: Level[] }) {
  const dossier = { plan: { levels }, devices: [] } as unknown as Dossier;
  const cam = cameraPreset(dossier, 'iso', 'tous', levels.length > 1 ? 0.8 : 1, 'cote');
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 40, near: 0.1, far: 500, position: cam.position.toArray() }} gl={{ antialias: true }}>
      <color attach="background" args={['#eef2f6']} />
      <Scene3DContent
        dossier={dossier}
        products={[]}
        options={{ levelFilter: 'tous', wallMode: 'coupe', hiddenWalls: new Set(), showCoverage: false, showLabels: true, layout: 'cote', motionAngle: 110, motionRange: 10 }}
      />
      <OrbitControls makeDefault target={cam.target} enableDamping maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
