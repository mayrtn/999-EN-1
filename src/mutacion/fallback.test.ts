/**
 * Tests de Mutacion_Fallback (`calcularFallback`).
 *
 * Cubre:
 * - Task 4.2 → Property 6: el fallback siempre produce perillas válidas
 *   (satisface `esPerillasValidas`). Validates: Requirements 6.1, 6.4.
 * - Task 4.3 → Unit tests de ejemplo: perfiles neutro, dominante-furia y
 *   dominante-riesgo mapean a las perillas documentadas por la heurística.
 *   Validates: Requirements 6.1, 6.4.
 *
 * Framework: Vitest + fast-check (mínimo 100 iteraciones por propiedad).
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { calcularFallback } from './fallback';
import { esPerillasValidas } from './validador';
import type { PerfilJugador, Rasgo } from '../contrato';

/** Construye un PerfilJugador a partir de valores por rasgo. */
function perfilDe(valores: Record<Rasgo, number>): PerfilJugador {
  return {
    rasgos: { ...valores },
    // pesoAcumulado no lo usa calcularFallback; se completa por consistencia.
    pesoAcumulado: { furia: 1, curiosidad: 1, logro: 1, riesgo: 1 },
  };
}

/**
 * Genera un valor de rasgo. El caso primario son doubles en [0,1] (sin NaN),
 * pero también se incluyen valores ligeramente fuera de rango (negativos y >1)
 * para probar la robustez del clamp interno del fallback.
 */
const arbValorRasgo = fc.oneof(
  { weight: 8, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
  { weight: 1, arbitrary: fc.double({ min: -1, max: 0, noNaN: true }) },
  { weight: 1, arbitrary: fc.double({ min: 1, max: 2, noNaN: true }) },
);

/** Genera un PerfilJugador con un valor por cada rasgo. */
const arbPerfil: fc.Arbitrary<PerfilJugador> = fc
  .record({
    furia: arbValorRasgo,
    curiosidad: arbValorRasgo,
    logro: arbValorRasgo,
    riesgo: arbValorRasgo,
  })
  .map((rasgos) => perfilDe(rasgos));

describe('calcularFallback — Property 6: perillas siempre válidas', () => {
  // Feature: arcade-ia-mutante, Property 6: El fallback siempre produce perillas válidas
  it('produce perillas que satisfacen esPerillasValidas para todo perfil', () => {
    fc.assert(
      fc.property(arbPerfil, (perfil) => {
        const perillas = calcularFallback(perfil);
        expect(esPerillasValidas(perillas)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe('calcularFallback — unit tests de ejemplo (Task 4.3)', () => {
  it('perfil neutro (todos 0) → paleta infierno, clima ninguno, mood calma, intensidad/agresividad 0', () => {
    const perfil = perfilDe({ furia: 0, curiosidad: 0, logro: 0, riesgo: 0 });

    const perillas = calcularFallback(perfil);

    // Empate total en 0 → gana furia por el orden de desempate.
    expect(perillas.paleta).toBe('infierno');
    expect(perillas.clima).toBe('ninguno');
    expect(perillas.mood_musica).toBe('calma');
    expect(perillas.intensidad_enemigos).toBe(0);
    expect(perillas.agresividad).toBe(0);
    expect(perillas.mensaje).toBe('El mundo arde con tu furia.');
    expect(esPerillasValidas(perillas)).toBe(true);
  });

  it('perfil dominante-furia (furia alta, resto bajo) → paleta infierno, mood furioso, clima lluvia', () => {
    const perfil = perfilDe({ furia: 0.9, curiosidad: 0.1, logro: 0.1, riesgo: 0.1 });

    const perillas = calcularFallback(perfil);

    expect(perillas.paleta).toBe('infierno');
    expect(perillas.mood_musica).toBe('furioso');
    // riesgo/curiosidad bajos; furia >= 0.5 → 'lluvia'.
    expect(perillas.clima).toBe('lluvia');
    // intensidad_enemigos = clamp(furia).
    expect(perillas.intensidad_enemigos).toBe(0.9);
    // agresividad = clamp((furia + riesgo) / 2) = (0.9 + 0.1) / 2 = 0.5.
    expect(perillas.agresividad).toBeCloseTo(0.5, 10);
    expect(perillas.mensaje).toBe('El mundo arde con tu furia.');
    expect(esPerillasValidas(perillas)).toBe(true);
  });

  it('perfil dominante-riesgo (riesgo alto, resto bajo) → paleta hostil, clima brasas, mood tenso', () => {
    const perfil = perfilDe({ furia: 0.1, curiosidad: 0.1, logro: 0.1, riesgo: 0.9 });

    const perillas = calcularFallback(perfil);

    expect(perillas.paleta).toBe('hostil');
    // riesgo >= 0.5 tiene prioridad en clima.
    expect(perillas.clima).toBe('brasas');
    // furia baja, riesgo >= 0.5 → 'tenso'.
    expect(perillas.mood_musica).toBe('tenso');
    // intensidad_enemigos = clamp(furia) = 0.1.
    expect(perillas.intensidad_enemigos).toBe(0.1);
    // agresividad = (0.1 + 0.9) / 2 = 0.5.
    expect(perillas.agresividad).toBeCloseTo(0.5, 10);
    expect(perillas.mensaje).toBe('Vives al filo del peligro.');
    expect(esPerillasValidas(perillas)).toBe(true);
  });
});
