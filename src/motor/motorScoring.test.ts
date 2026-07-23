/**
 * Tests del Motor_Scoring (Requirement 4).
 *
 * Cubre las Properties 1–4 con `fast-check` (mínimo 100 iteraciones por
 * propiedad) y unit tests de ejemplo. El Motor_Scoring es lógica pura y
 * determinística: normaliza {@link TelemetriaRasgos} y actualiza el
 * {@link PerfilJugador} acumulado mediante un promedio ponderado incremental.
 *
 * Tareas cubiertas: 2.2 (Property 1), 2.3 (Property 2), 2.4 (Property 3),
 * 2.5 (Property 4) y 2.6 (unit tests de ejemplo).
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { MotorScoring, crearPerfilInicial } from './motorScoring';
import type {
  EscenaId,
  Rasgo,
  PerfilJugador,
  TelemetriaRasgos,
  SenalOportunidad,
} from '../contrato';

// --- Constantes de dominio -------------------------------------------------

const RASGOS: readonly Rasgo[] = ['furia', 'curiosidad', 'logro', 'riesgo'];
const NUM_RUNS = 100;

// --- Arbitrarios de fast-check --------------------------------------------

/** Valores finitos, no negativos y sin NaN (senal / oportunidad >= 0). */
const arbNoNeg = fc.double({
  min: 0,
  max: 1e6,
  noNaN: true,
  noDefaultInfinity: true,
});

/**
 * Oportunidad no negativa que incluye deliberadamente el caso `0` (rasgo no
 * medido) además de valores positivos.
 */
const arbOportunidad = fc.oneof(fc.constant(0), arbNoNeg);

/**
 * Par Señal/Oportunidad válido. Incluye casos con `senal > oportunidad`
 * (fuerza el acotamiento) y con `oportunidad == 0` (rasgo excluido).
 */
const arbSenalOportunidad: fc.Arbitrary<SenalOportunidad> = fc.record({
  senal: arbNoNeg,
  oportunidad: arbOportunidad,
});

const arbEscena = fc.constantFrom<EscenaId>(
  'plataformas',
  'ritmo',
  'shooter',
  'carreras'
);

/** Telemetría completa arbitraria de una escena. */
const arbTelemetria: fc.Arbitrary<TelemetriaRasgos> = fc.record({
  escena: arbEscena,
  porRasgo: fc.record({
    furia: arbSenalOportunidad,
    curiosidad: arbSenalOportunidad,
    logro: arbSenalOportunidad,
    riesgo: arbSenalOportunidad,
  }),
});

/** Secuencia de telemetrías (fold sobre el perfil inicial). */
const arbSecuencia = fc.array(arbTelemetria, { minLength: 0, maxLength: 20 });

const arbRasgo = fc.constantFrom<Rasgo>(
  'furia',
  'curiosidad',
  'logro',
  'riesgo'
);

/** Perfil arbitrario: rasgos en [0,1] y pesos acumulados no negativos. */
const arbPerfil: fc.Arbitrary<PerfilJugador> = fc.record({
  rasgos: fc.record({
    furia: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    curiosidad: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    logro: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    riesgo: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  }),
  pesoAcumulado: fc.record({
    furia: fc.double({ min: 0, max: 1e4, noNaN: true, noDefaultInfinity: true }),
    curiosidad: fc.double({ min: 0, max: 1e4, noNaN: true, noDefaultInfinity: true }),
    logro: fc.double({ min: 0, max: 1e4, noNaN: true, noDefaultInfinity: true }),
    riesgo: fc.double({ min: 0, max: 1e4, noNaN: true, noDefaultInfinity: true }),
  }),
});

// --- Helpers ---------------------------------------------------------------

/** Pliega una secuencia de telemetrías desde el perfil inicial neutro. */
function plegar(
  motor: MotorScoring,
  telemetrias: readonly TelemetriaRasgos[]
): PerfilJugador {
  return telemetrias.reduce(
    (perfil, tel) => motor.actualizarPerfil(perfil, tel),
    crearPerfilInicial()
  );
}

/** Construye una telemetría con el mismo par para los cuatro rasgos. */
function telUniforme(
  escena: EscenaId,
  senal: number,
  oportunidad: number
): TelemetriaRasgos {
  const par: SenalOportunidad = { senal, oportunidad };
  return {
    escena,
    porRasgo: { furia: par, curiosidad: par, logro: par, riesgo: par },
  };
}

// ===========================================================================
// Task 2.2 — Property 1
// ===========================================================================

describe('Motor_Scoring — Property 1 (Score_Rasgo en [0,1])', () => {
  // Feature: arcade-ia-mutante, Property 1: Score_Rasgo siempre en [0,1]
  it('para toda telemetría, el Score_Rasgo calculado queda en [0,1] (incluso si senal > oportunidad)', () => {
    fc.assert(
      fc.property(arbTelemetria, (tel) => {
        // Perfil neutro nuevo por escena: con peso previo 0, el valor
        // actualizado de cada rasgo medido es exactamente el Score_Rasgo.
        const motor = new MotorScoring();
        const perfil = motor.actualizarPerfil(crearPerfilInicial(), tel);

        for (const rasgo of RASGOS) {
          const valor = perfil.rasgos[rasgo];
          const { senal, oportunidad } = tel.porRasgo[rasgo];

          expect(Number.isNaN(valor)).toBe(false);

          if (oportunidad > 0) {
            // Score_Rasgo materializado en el perfil (peso previo 0).
            const esperado = Math.min(1, Math.max(0, senal / oportunidad));
            expect(valor).toBeCloseTo(esperado, 10);
            expect(valor).toBeGreaterThanOrEqual(0);
            expect(valor).toBeLessThanOrEqual(1);
          } else {
            // Rasgo no medido: permanece en el neutro (0).
            expect(valor).toBe(0);
          }
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ===========================================================================
// Task 2.3 — Property 2
// ===========================================================================

describe('Motor_Scoring — Property 2 (oportunidad 0 ⇒ peso 0, sin afectar el perfil)', () => {
  // Feature: arcade-ia-mutante, Property 2: Oportunidad 0 ⇒ peso 0 y no afecta el perfil (sin NaN ni división por cero)
  it('para todo perfil y rasgo con oportunidad 0, el valor y el peso acumulado de ese rasgo quedan idénticos, sin NaN', () => {
    fc.assert(
      fc.property(arbPerfil, arbTelemetria, arbRasgo, (perfil, tel, rasgo) => {
        // Forzar oportunidad 0 en el rasgo elegido (senal cualquiera).
        const telForzada: TelemetriaRasgos = {
          escena: tel.escena,
          porRasgo: {
            ...tel.porRasgo,
            [rasgo]: { senal: tel.porRasgo[rasgo].senal, oportunidad: 0 },
          },
        };

        const resultado = new MotorScoring().actualizarPerfil(perfil, telForzada);

        // El rasgo con oportunidad 0 queda EXACTAMENTE igual (peso 0).
        expect(resultado.rasgos[rasgo]).toBe(perfil.rasgos[rasgo]);
        expect(resultado.pesoAcumulado[rasgo]).toBe(perfil.pesoAcumulado[rasgo]);

        // Sin NaN ni división por cero en ningún rasgo del resultado.
        for (const r of RASGOS) {
          expect(Number.isNaN(resultado.rasgos[r])).toBe(false);
          expect(Number.isNaN(resultado.pesoAcumulado[r])).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ===========================================================================
// Task 2.4 — Property 3
// ===========================================================================

describe('Motor_Scoring — Property 3 (el perfil acumulado permanece en [0,1])', () => {
  // Feature: arcade-ia-mutante, Property 3: El perfil acumulado permanece en [0,1]
  it('para toda secuencia de telemetrías, cada rasgo del perfil resultante queda en [0,1]', () => {
    fc.assert(
      fc.property(arbSecuencia, (secuencia) => {
        const perfil = plegar(new MotorScoring(), secuencia);

        for (const rasgo of RASGOS) {
          const valor = perfil.rasgos[rasgo];
          expect(Number.isNaN(valor)).toBe(false);
          expect(valor).toBeGreaterThanOrEqual(0);
          expect(valor).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ===========================================================================
// Task 2.5 — Property 4
// ===========================================================================

describe('Motor_Scoring — Property 4 (determinismo del perfil)', () => {
  // Feature: arcade-ia-mutante, Property 4: Determinismo del perfil (misma secuencia ⇒ mismo Perfil_Jugador)
  it('para toda secuencia, dos ejecuciones independientes producen el mismo Perfil_Jugador', () => {
    fc.assert(
      fc.property(arbSecuencia, (secuencia) => {
        const perfilA = plegar(new MotorScoring(), secuencia);
        const perfilB = plegar(new MotorScoring(), secuencia);
        expect(perfilA).toEqual(perfilB);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ===========================================================================
// Task 2.6 — Unit tests de ejemplo
// ===========================================================================

describe('Motor_Scoring — unit tests de ejemplo', () => {
  it('senal > oportunidad acota el Score_Rasgo a 1', () => {
    const motor = new MotorScoring();
    const tel = telUniforme('plataformas', 10, 2); // 10/2 = 5 → acotado a 1
    const perfil = motor.actualizarPerfil(crearPerfilInicial(), tel);

    for (const rasgo of RASGOS) {
      expect(perfil.rasgos[rasgo]).toBe(1);
      expect(perfil.pesoAcumulado[rasgo]).toBe(1);
    }
  });

  it('primera escena: el perfil parte del neutro y adopta los Score_Rasgo de esa escena', () => {
    const motor = new MotorScoring();
    const inicial = crearPerfilInicial();
    expect(inicial.rasgos).toEqual({ furia: 0, curiosidad: 0, logro: 0, riesgo: 0 });
    expect(inicial.pesoAcumulado).toEqual({ furia: 0, curiosidad: 0, logro: 0, riesgo: 0 });

    const tel: TelemetriaRasgos = {
      escena: 'plataformas',
      porRasgo: {
        furia: { senal: 3, oportunidad: 4 }, // 0.75
        curiosidad: { senal: 1, oportunidad: 4 }, // 0.25
        logro: { senal: 5, oportunidad: 10 }, // 0.5
        riesgo: { senal: 0, oportunidad: 8 }, // 0
      },
    };
    const perfil = motor.actualizarPerfil(inicial, tel);

    expect(perfil.rasgos.furia).toBeCloseTo(0.75, 10);
    expect(perfil.rasgos.curiosidad).toBeCloseTo(0.25, 10);
    expect(perfil.rasgos.logro).toBeCloseTo(0.5, 10);
    expect(perfil.rasgos.riesgo).toBe(0);
    // El perfil inicial no se muta (función pura).
    expect(inicial.rasgos.furia).toBe(0);
  });

  it('rasgo nunca medido (oportunidad 0) permanece en el neutro con peso 0', () => {
    const motor = new MotorScoring();
    const tel: TelemetriaRasgos = {
      escena: 'ritmo',
      porRasgo: {
        furia: { senal: 2, oportunidad: 4 }, // 0.5
        curiosidad: { senal: 0, oportunidad: 0 }, // nunca medido
        logro: { senal: 0, oportunidad: 0 }, // nunca medido
        riesgo: { senal: 0, oportunidad: 0 }, // nunca medido
      },
    };
    const perfil = motor.actualizarPerfil(crearPerfilInicial(), tel);

    expect(perfil.rasgos.furia).toBeCloseTo(0.5, 10);
    expect(perfil.pesoAcumulado.furia).toBe(1);

    for (const rasgo of ['curiosidad', 'logro', 'riesgo'] as const) {
      expect(perfil.rasgos[rasgo]).toBe(0);
      expect(perfil.pesoAcumulado[rasgo]).toBe(0);
      expect(Number.isNaN(perfil.rasgos[rasgo])).toBe(false);
    }
  });
});
