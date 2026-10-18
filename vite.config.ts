import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build works from any GitHub Pages sub-path (/<repo>/).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5174 },
});
