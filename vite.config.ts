import { defineConfig } from 'vite';

// Bundler estatico para el cliente Phaser 3.
// El build produce artefactos estaticos (HTML/JS/CSS/assets) listos para
// alojarse en S3 y servirse por CloudFront (Requirement 10.1).
export default defineConfig({
  // Rutas relativas para que el bundle funcione bajo cualquier prefijo de CloudFront.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    // Un solo chunk grande de Phaser es aceptable para el arcade; subimos el limite
    // de aviso para no ensuciar el log de build.
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5173,
    open: false,
  },
  preview: {
    port: 4173,
  },
});
