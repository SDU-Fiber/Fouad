import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the build can be hosted from any sub-path (static hosting, intranet share, etc.)
  base: './',
  server: { port: 3000, host: '0.0.0.0' },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
