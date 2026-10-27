/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Chemins relatifs : fonctionne à la racine d'un domaine comme dans un sous-dossier (GitHub Pages)
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          calendar: [
            '@fullcalendar/core',
            '@fullcalendar/react',
            '@fullcalendar/daygrid',
            '@fullcalendar/timegrid',
            '@fullcalendar/list',
            '@fullcalendar/interaction',
            '@fullcalendar/luxon3',
          ],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
