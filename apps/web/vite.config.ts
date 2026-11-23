import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Für GitHub Pages: BASE_PATH=/eishockey-manager/
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  worker: { format: 'es' },
});
