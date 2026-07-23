import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Smoke test del toolchain de testing (Task 1.1): confirma que Vitest y
// fast-check estan correctamente cableados. Las propiedades reales del juego
// (Properties 1-8) se implementan en tareas posteriores.
describe('toolchain de testing', () => {
  it('Vitest ejecuta unit tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('fast-check ejecuta property tests', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
      { numRuns: 100 },
    );
  });
});
