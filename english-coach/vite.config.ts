/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * Génère sw.js au build : la liste des fichiers à mettre en cache (application + icônes)
 * et un numéro de version qui change à chaque contenu différent.
 */
function serviceWorker(): Plugin {
  return {
    name: 'english-coach-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicDir = join(root, 'public');
      const publicFiles = listFiles(publicDir)
        .map((f) => relative(publicDir, f).split('\\').join('/'))
        // Les écrans de lancement iOS sont chargés par le système, inutile de les précharger.
        .filter((f) => !f.startsWith('splash/'));
      // index.html est émis par Vite après ce plugin : on l'ajoute explicitement (le shell de l'application).
      const files = [...new Set(['index.html', ...Object.keys(bundle), ...publicFiles])].filter((f) => !f.endsWith('.map')).sort();
      const hash = createHash('sha256');
      for (const name of Object.keys(bundle).sort()) {
        const out = bundle[name];
        hash.update(name);
        hash.update(out.type === 'chunk' ? out.code : typeof out.source === 'string' ? out.source : Buffer.from(out.source));
      }
      for (const f of publicFiles) hash.update(readFileSync(join(publicDir, f)));
      const template = readFileSync(join(root, 'sw', 'sw-template.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', hash.digest('hex').slice(0, 12)).replace('__PRECACHE__', JSON.stringify(files)),
      });
    },
  };
}

export default defineConfig({
  // Chemins relatifs : l'application fonctionne aussi installée dans un sous-dossier.
  base: './',
  plugins: [react(), serviceWorker()],
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  },
});
