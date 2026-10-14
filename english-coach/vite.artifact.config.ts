import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Build de la version « artefact claude.ai » : un seul script autonome (IIFE) et une feuille de style,
 * ensuite assemblés en une page par scripts/build-artifact.mjs.
 * La mémoire (db) et le professeur IA (sample) passent par les capacités de l'artefact.
 */
const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_TARGET': JSON.stringify('artifact') },
  resolve: {
    alias: [
      { find: /^(\.\.?\/)+core\/sync$/, replacement: src('artifact/sync.ts') },
      { find: /^(\.\.?\/)+core\/tutor$/, replacement: src('artifact/tutor.ts') },
      { find: /^(\.\.?\/)+platform$/, replacement: src('artifact/platform.tsx') },
    ],
  },
  publicDir: false,
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: src('main.tsx'),
      output: { format: 'iife', entryFileNames: 'app.js', assetFileNames: 'app[extname]', inlineDynamicImports: true },
    },
  },
});
