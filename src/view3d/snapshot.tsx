import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import type { Dossier, Product } from '@/domain/types';
import type { RulesConfig } from '@/rules/config';
import { Scene3DContent, cameraPreset } from './Scene3D';

function Capture({ dossier, onDone }: { dossier: Dossier; onDone: (url: string) => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const p = cameraPreset(dossier, 'iso', 'tous', 0.85, 'cote');
    camera.position.copy(p.position);
    camera.lookAt(p.target);
    camera.updateProjectionMatrix();
    let frames = 0;
    let raf = 0;
    const tick = () => {
      frames++;
      gl.render(scene, camera);
      if (frames >= 4) onDone(gl.domElement.toDataURL('image/png'));
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gl, scene, camera, dossier, onDone]);
  return null;
}

/**
 * Rendu hors écran d'une vue isométrique de la maquette (pour le PDF),
 * même lorsque l'onglet 3D n'est pas ouvert.
 */
export function capture3DView(dossier: Dossier, products: Product[], rules: RulesConfig, width = 1400, height = 900): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;`;
    document.body.appendChild(host);
    const root = createRoot(host);
    const timeout = setTimeout(() => finish(new Error('Délai de rendu 3D dépassé')), 15000);
    let done = false;
    function finish(err: Error | null, url?: string) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
      if (err || !url) reject(err ?? new Error('Capture 3D impossible'));
      else resolve({ dataUrl: url, width, height });
    }
    try {
      root.render(
        <Canvas
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          dpr={1}
          camera={{ fov: 40, near: 0.1, far: 500 }}
          style={{ width, height }}
          onCreated={({ gl }) => gl.setSize(width, height)}
        >
          <color attach="background" args={['#ffffff']} />
          <Scene3DContent
            dossier={dossier}
            products={products}
            options={{
              levelFilter: 'tous',
              wallMode: 'coupe',
              hiddenWalls: new Set(),
              showCoverage: false,
              showLabels: true,
              layout: 'cote',
              motionAngle: rules.motion.angleDeg,
              motionRange: rules.motion.rangeM,
            }}
          />
          <Capture dossier={dossier} onDone={(url) => finish(null, url)} />
        </Canvas>,
      );
    } catch (e) {
      finish(e as Error);
    }
  });
}
