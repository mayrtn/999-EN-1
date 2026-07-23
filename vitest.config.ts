import { defineConfig } from 'vitest/config';

// Configuracion de Vitest + fast-check para la logica pura del juego
// (Motor_Scoring, validador de perillas, Mutacion_Fallback) y unit tests.
export default defineConfig({
  test: {
    globals: true,
    // 'node' es suficiente para la logica pura; las escenas de Phaser que
    // necesiten DOM pueden optar por 'jsdom' mediante un comentario por-archivo.
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
    },
  },
});
