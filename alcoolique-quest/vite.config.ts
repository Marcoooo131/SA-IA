import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : la cinématique fonctionne aussi dans un sous-dossier (GitHub Pages, serveur statique).
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true },
});
