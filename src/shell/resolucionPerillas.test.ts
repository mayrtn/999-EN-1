/**
 * Property tests de la resolución de Perillas_Mutacion del Shell.
 *
 * Cubre dos propiedades de correctitud sobre `resolverPerillas` (orquestación
 * Bedrock + Fallback), verificadas con Vitest + fast-check (>= 100 iteraciones):
 *
 * - Task 6.3 → Property 5: Toda Perillas_Mutacion aplicada pertenece al conjunto
 *   cerrado (respuesta válida / inválida / malformada). Sea cual sea la respuesta
 *   remota, el valor resuelto SIEMPRE satisface `esPerillasValidas` (es una
 *   respuesta remota validada o el fallback).
 *   **Validates: Requirements 5.4, 5.5, 6.4, 9.2**
 *
 * - Task 6.4 → Property 7: El juego nunca queda bloqueado esperando a Bedrock.
 *   Ante cualquier comportamiento del backend (resuelve tarde, rechaza, lanza de
 *   forma síncrona o no resuelve jamás), `resolverPerillas` resuelve dentro de la
 *   ventana de timeout con unas Perillas_Mutacion válidas.
 *   **Validates: Requirements 5.6, 6.2, 6.3, 6.5**
 *
 * Estrategia temporal: Property 5 usa timers reales pequeños con clientes que
 * asientan de inmediato (microtareas); Property 7 usa timers falsos
 * (`vi.useFakeTimers`) y `vi.runAllTimersAsync()` para avanzar el timeout interno
 * de forma determinística y rápida, incluido el caso "nunca resuelve".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';

import {
  PALETAS,
  CLIMAS,
  MOODS,
  MAX_MENSAJE,
  type PerillasMutacion,
  type PerfilJugador,
  type EscenaId,
  type Rasgo,
  type IClienteBackend,
} from '../contrato';
import { esPerillasValidas } from '../mutacion';
import { resolverPerillas } from './resolucionPerillas';

// ---------------------------------------------------------------------------
// Generadores compartidos
// ---------------------------------------------------------------------------

/** Valor de rasgo bien formado: número finito en [0,1] (Requirement 4). */
const arbValorRasgo = fc.double({
  min: 0,
  max: 1,
  noNaN: true,
  noDefaultInfinity: true,
});

/** PerfilJugador con los cuatro rasgos en [0,1]. */
const arbPerfil: fc.Arbitrary<PerfilJugador> = fc
  .record<Record<Rasgo, number>>({
    furia: arbValorRasgo,
    curiosidad: arbValorRasgo,
    logro: arbValorRasgo,
    riesgo: arbValorRasgo,
  })
  .map((rasgos) => ({
    rasgos,
    pesoAcumulado: { furia: 1, curiosidad: 1, logro: 1, riesgo: 1 },
  }));

/** Escena destino de la transición (conjunto cerrado de EscenaId). */
const arbEscena: fc.Arbitrary<EscenaId> = fc.constantFrom<EscenaId>(
  'plataformas',
  'ritmo',
  'shooter',
  'carreras',
);

/** Número finito en [0,1] inclusive (incluye límites). */
const arbNumeroUnitario = fc.double({
  min: 0,
  max: 1,
  noNaN: true,
  noDefaultInfinity: true,
});

/** PerillasMutacion BIEN FORMADAS (mensaje dentro del límite). */
const arbPerillasValidas: fc.Arbitrary<PerillasMutacion> = fc.record({
  paleta: fc.constantFrom(...PALETAS),
  intensidad_enemigos: arbNumeroUnitario,
  agresividad: arbNumeroUnitario,
  clima: fc.constantFrom(...CLIMAS),
  mood_musica: fc.constantFrom(...MOODS),
  mensaje: fc.string({ maxLength: MAX_MENSAJE }),
});

/** Números fuera de [0,1] o no finitos. */
const arbNumeroInvalido = fc.oneof(
  fc.double({ min: 1.0000001, max: 1e6, noNaN: true }),
  fc.double({ min: -1e6, max: -0.0000001, noNaN: true }),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
);

const arbEnumInvalido = (conjunto: readonly string[]) =>
  fc.string().filter((s) => !conjunto.includes(s));

/**
 * Objetos con AL MENOS UN DEFECTO (parten de una perilla válida). Cubren enums
 * fuera del conjunto cerrado, números fuera de rango, campos faltantes y tipos
 * incorrectos.
 */
const arbPerillasMalformadas: fc.Arbitrary<unknown> = fc.oneof(
  arbPerillasValidas.chain((p) =>
    arbEnumInvalido(PALETAS).map((paleta) => ({ ...p, paleta })),
  ),
  arbPerillasValidas.chain((p) =>
    arbEnumInvalido(CLIMAS).map((clima) => ({ ...p, clima })),
  ),
  arbPerillasValidas.chain((p) =>
    arbEnumInvalido(MOODS).map((mood_musica) => ({ ...p, mood_musica })),
  ),
  arbPerillasValidas.chain((p) =>
    arbNumeroInvalido.map((intensidad_enemigos) => ({ ...p, intensidad_enemigos })),
  ),
  arbPerillasValidas.chain((p) =>
    arbNumeroInvalido.map((agresividad) => ({ ...p, agresividad })),
  ),
  arbPerillasValidas.chain((p) =>
    fc
      .constantFrom(
        'paleta',
        'intensidad_enemigos',
        'agresividad',
        'clima',
        'mood_musica',
        'mensaje',
      )
      .map((clave) => {
        const copia: Record<string, unknown> = { ...p };
        delete copia[clave];
        return copia;
      }),
  ),
  arbPerillasValidas.chain((p) =>
    fc
      .constantFrom<Record<string, unknown>>(
        { paleta: 123 },
        { clima: true },
        { mood_musica: null },
        { intensidad_enemigos: 'alto' },
        { agresividad: {} },
        { mensaje: 42 },
      )
      .map((defecto) => ({ ...p, ...defecto })),
  ),
);

/** No-objetos: null / undefined / number / string / array / boolean. */
const arbNoObjeto: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.double({ noNaN: true }),
  fc.string(),
  fc.array(fc.anything()),
  fc.boolean(),
);

/** Perilla por lo demás válida pero con `mensaje` que excede MAX_MENSAJE. */
const arbPerillasMensajeLargo: fc.Arbitrary<unknown> = arbPerillasValidas.chain((p) =>
  fc
    .string({ minLength: MAX_MENSAJE + 1, maxLength: MAX_MENSAJE + 100 })
    .map((mensaje) => ({ ...p, mensaje })),
);

/** Construye un IClienteBackend cuyo `pedirMutacion` devuelve `valor`. */
function clienteQueDevuelve(valor: unknown): IClienteBackend {
  return {
    pedirMutacion: () => Promise.resolve(valor),
  };
}

// ---------------------------------------------------------------------------
// Task 6.3 — Property 5
// ---------------------------------------------------------------------------

describe('resolverPerillas — Property 5: conjunto cerrado', () => {
  // Feature: arcade-ia-mutante, Property 5: Toda Perillas_Mutacion aplicada pertenece al conjunto cerrado
  it('resuelve SIEMPRE unas perillas válidas sea cual sea la respuesta remota', async () => {
    // Validates: Requirements 5.4, 5.5, 6.4, 9.2

    /**
     * Comportamiento del backend para esta iteración. Cubre:
     * (a) perilla bien formada, (b) objeto malformado, (c) no-objeto,
     * (d) cliente que rechaza / lanza de forma síncrona, (e) mensaje demasiado
     * largo pero por lo demás válido.
     */
    const arbCaso: fc.Arbitrary<IClienteBackend> = fc.oneof(
      arbPerillasValidas.map((v) => clienteQueDevuelve(v)),
      arbPerillasMalformadas.map((v) => clienteQueDevuelve(v)),
      arbNoObjeto.map((v) => clienteQueDevuelve(v)),
      arbPerillasMensajeLargo.map((v) => clienteQueDevuelve(v)),
      // (d) cliente que rechaza (error de red / 5xx / timeout del propio cliente)
      fc.constant<IClienteBackend>({
        pedirMutacion: () => Promise.reject(new Error('backend caído')),
      }),
      // (d) cliente que lanza de forma síncrona
      fc.constant<IClienteBackend>({
        pedirMutacion: () => {
          throw new Error('excepción síncrona');
        },
      }),
    );

    await fc.assert(
      fc.asyncProperty(
        arbPerfil,
        arbEscena,
        arbCaso,
        async (perfil, proximaEscena, cliente) => {
          const perillas = await resolverPerillas(
            { cliente },
            { perfil, proximaEscena, timeoutMs: 50 },
          );

          // Sea remota-validada o fallback, el resultado pertenece al conjunto
          // cerrado (Requirements 5.4, 5.5, 6.4, 9.2).
          expect(esPerillasValidas(perillas)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 6.4 — Property 7
// ---------------------------------------------------------------------------

describe('resolverPerillas — Property 7: nunca bloquea esperando a Bedrock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Feature: arcade-ia-mutante, Property 7: El juego nunca queda bloqueado esperando a Bedrock
  it('resuelve dentro del timeout con perillas válidas ante cualquier condición del backend', async () => {
    // Validates: Requirements 5.6, 6.2, 6.3, 6.5

    /** Condición del backend: tarde, rechaza, lanza síncrono o nunca resuelve. */
    type Condicion =
      | { tipo: 'tarde'; extra: number; valor: PerillasMutacion }
      | { tipo: 'rechaza' }
      | { tipo: 'lanzaSync' }
      | { tipo: 'nunca' };

    const arbCondicion: fc.Arbitrary<Condicion> = fc.oneof(
      fc.record({
        tipo: fc.constant<'tarde'>('tarde'),
        // Resuelve estrictamente DESPUÉS del timeout.
        extra: fc.integer({ min: 1, max: 500 }),
        valor: arbPerillasValidas,
      }),
      fc.constant<Condicion>({ tipo: 'rechaza' }),
      fc.constant<Condicion>({ tipo: 'lanzaSync' }),
      fc.constant<Condicion>({ tipo: 'nunca' }),
    );

    await fc.assert(
      fc.asyncProperty(
        arbPerfil,
        arbEscena,
        fc.integer({ min: 1, max: 1000 }),
        arbCondicion,
        async (perfil, proximaEscena, timeoutMs, condicion) => {
          const cliente: IClienteBackend = {
            pedirMutacion: () => {
              switch (condicion.tipo) {
                case 'tarde':
                  // Resuelve tarde (más allá del timeout) con una perilla válida.
                  return new Promise<unknown>((resolve) => {
                    setTimeout(
                      () => resolve(condicion.valor),
                      timeoutMs + condicion.extra,
                    );
                  });
                case 'rechaza':
                  return Promise.reject(new Error('backend caído'));
                case 'lanzaSync':
                  throw new Error('excepción síncrona del cliente');
                case 'nunca':
                  // Promesa que jamás asienta: simula a Bedrock colgado.
                  return new Promise<unknown>(() => {});
              }
            },
          };

          const promesa = resolverPerillas(
            { cliente },
            { perfil, proximaEscena, timeoutMs },
          );

          // Avanza todos los timers (dispara el timeout interno de la carrera).
          // Si `resolverPerillas` se colgara esperando a Bedrock, el `await`
          // siguiente nunca completaría y el test agotaría su tiempo.
          await vi.runAllTimersAsync();

          const perillas = await promesa;

          // Resolvió (no se colgó) y con perillas del conjunto cerrado
          // (Requirements 5.6, 6.2, 6.3, 6.5).
          expect(esPerillasValidas(perillas)).toBe(true);
        },
      ),
      { numRuns: 150 },
    );
  });
});
