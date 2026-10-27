import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Chemins relatifs : la présentation fonctionne aussi dans un sous-dossier (GitHub Pages, clé USB, serveur statique).
  base: './',
  plugins: [react()],
  server: { host: true },
});
