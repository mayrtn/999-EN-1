import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  PALETAS,
  CLIMAS,
  MOODS,
  MAX_MENSAJE,
  type PerillasMutacion,
} from '../contrato';
import {
  esPerillasValidas,
  recortarMensaje,
  sanitizarPerillas,
} from './validador';

// ---------------------------------------------------------------------------
// Generadores (arbitraries)
// ---------------------------------------------------------------------------

/** Número finito en [0,1] inclusive (incluye los límites 0 y 1). */
const arbNumeroUnitario = fc.double({
  min: 0,
  max: 1,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Mensaje bien formado: string de longitud <= MAX_MENSAJE. */
const arbMensajeValido = fc
  .string({ maxLength: MAX_MENSAJE })
  .filter((s) => s.length <= MAX_MENSAJE);

/** Arbitrary de PerillasMutacion BIEN FORMADAS (dirección (a) de Property 8). */
const arbPerillasValidas: fc.Arbitrary<PerillasMutacion> = fc.record({
  paleta: fc.constantFrom(...PALETAS),
  intensidad_enemigos: arbNumeroUnitario,
  agresividad: arbNumeroUnitario,
  clima: fc.constantFrom(...CLIMAS),
  mood_musica: fc.constantFrom(...MOODS),
  mensaje: arbMensajeValido,
});

/** Valores que NO son un número finito en [0,1]. */
const arbNumeroInvalido = fc.oneof(
  fc.double({ min: 1.0000001, max: 1e6, noNaN: true }), // > 1
  fc.double({ min: -1e6, max: -0.0000001, noNaN: true }), // < 0
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
);

/** Enum inválido: cualquier string que no pertenezca al conjunto cerrado dado. */
const arbEnumInvalido = (conjunto: readonly string[]) =>
  fc.string().filter((s) => !conjunto.includes(s));

/**
 * Arbitrary de objetos con AL MENOS UN DEFECTO (dirección (b) de Property 8).
 * Parte de una perilla válida y le inyecta un defecto de tipo variado.
 */
const arbPerillasInvalidas: fc.Arbitrary<unknown> = fc.oneof(
  // Enum fuera del conjunto cerrado
  arbPerillasValidas.chain((p) =>
    arbEnumInvalido(PALETAS).map((paleta) => ({ ...p, paleta })),
  ),
  arbPerillasValidas.chain((p) =>
    arbEnumInvalido(CLIMAS).map((clima) => ({ ...p, clima })),
  ),
  arbPerillasValidas.chain((p) =>
    arbEnumInvalido(MOODS).map((mood_musica) => ({ ...p, mood_musica })),
  ),
  // Número fuera de [0,1] (incluye NaN / Infinity)
  arbPerillasValidas.chain((p) =>
    arbNumeroInvalido.map((intensidad_enemigos) => ({
      ...p,
      intensidad_enemigos,
    })),
  ),
  arbPerillasValidas.chain((p) =>
    arbNumeroInvalido.map((agresividad) => ({ ...p, agresividad })),
  ),
  // Mensaje demasiado largo (> MAX_MENSAJE)
  arbPerillasValidas.chain((p) =>
    fc
      .string({ minLength: MAX_MENSAJE + 1, maxLength: MAX_MENSAJE + 50 })
      .map((mensaje) => ({ ...p, mensaje })),
  ),
  // Campo faltante (se elimina una clave requerida)
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
  // Tipo incorrecto en un campo (p. ej. número donde va string, o viceversa)
  arbPerillasValidas.chain((p) =>
    fc
      .constantFrom(
        { paleta: 123 },
        { clima: true },
        { mood_musica: null },
        { intensidad_enemigos: 'alto' },
        { agresividad: {} },
        { mensaje: 42 },
      )
      .map((defecto) => ({ ...p, ...defecto })),
  ),
  // No-objeto / null / valores primitivos
  fc.constantFrom<unknown>(null, undefined, 42, 'perillas', true, [], NaN),
);

// ---------------------------------------------------------------------------
// Task 3.2 — Property 8 (property-based test)
// ---------------------------------------------------------------------------

describe('validador de Perillas_Mutacion — Property 8', () => {
  // Feature: arcade-ia-mutante, Property 8: La validación rechaza todo lo que esté fuera del conjunto cerrado
  it('acepta toda perilla bien formada y rechaza todo lo fuera del conjunto cerrado', () => {
    // Validates: Requirements 5.4, 9.2

    // (a) Toda PerillasMutacion bien formada ⇒ esPerillasValidas === true
    fc.assert(
      fc.property(arbPerillasValidas, (perillas) => {
        return esPerillasValidas(perillas) === true;
      }),
      { numRuns: 300 },
    );

    // (b) Todo objeto con al menos un defecto ⇒ esPerillasValidas === false
    fc.assert(
      fc.property(arbPerillasInvalidas, (candidato) => {
        return esPerillasValidas(candidato) === false;
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 3.3 — Unit tests de ejemplo
// ---------------------------------------------------------------------------

/** Fábrica de una perilla válida base; permite overrides por caso. */
function perillaBase(overrides: Partial<PerillasMutacion> = {}): PerillasMutacion {
  return {
    paleta: 'neon',
    intensidad_enemigos: 0.5,
    agresividad: 0.5,
    clima: 'ninguno',
    mood_musica: 'calma',
    mensaje: 'hola jugador',
    ...overrides,
  };
}

describe('validador de Perillas_Mutacion — ejemplos', () => {
  it('acepta una perilla válida completa', () => {
    expect(esPerillasValidas(perillaBase())).toBe(true);
  });

  // --- Un caso inválido por cada enum ---
  it('rechaza una paleta fuera del conjunto cerrado', () => {
    expect(esPerillasValidas(perillaBase({ paleta: 'arcoiris' as never }))).toBe(false);
  });

  it('rechaza un clima fuera del conjunto cerrado', () => {
    expect(esPerillasValidas(perillaBase({ clima: 'tormenta' as never }))).toBe(false);
  });

  it('rechaza un mood_musica fuera del conjunto cerrado', () => {
    expect(esPerillasValidas(perillaBase({ mood_musica: 'relajado' as never }))).toBe(false);
  });

  // --- Límites numéricos 0 y 1 aceptados ---
  it('acepta intensidad_enemigos y agresividad en el límite 0', () => {
    expect(
      esPerillasValidas(perillaBase({ intensidad_enemigos: 0, agresividad: 0 })),
    ).toBe(true);
  });

  it('acepta intensidad_enemigos y agresividad en el límite 1', () => {
    expect(
      esPerillasValidas(perillaBase({ intensidad_enemigos: 1, agresividad: 1 })),
    ).toBe(true);
  });

  // --- Valores apenas fuera de [0,1] rechazados ---
  it('rechaza intensidad_enemigos apenas por debajo de 0', () => {
    expect(esPerillasValidas(perillaBase({ intensidad_enemigos: -0.0001 }))).toBe(false);
  });

  it('rechaza agresividad apenas por encima de 1', () => {
    expect(esPerillasValidas(perillaBase({ agresividad: 1.0001 }))).toBe(false);
  });

  it('rechaza NaN e Infinity en los campos numéricos', () => {
    expect(esPerillasValidas(perillaBase({ intensidad_enemigos: Number.NaN }))).toBe(false);
    expect(
      esPerillasValidas(perillaBase({ agresividad: Number.POSITIVE_INFINITY })),
    ).toBe(false);
  });

  // --- Límite de longitud del mensaje ---
  it('acepta un mensaje de exactamente MAX_MENSAJE caracteres', () => {
    const mensaje = 'a'.repeat(MAX_MENSAJE);
    expect(esPerillasValidas(perillaBase({ mensaje }))).toBe(true);
  });

  it('rechaza un mensaje de MAX_MENSAJE + 1 caracteres', () => {
    const mensaje = 'a'.repeat(MAX_MENSAJE + 1);
    expect(esPerillasValidas(perillaBase({ mensaje }))).toBe(false);
  });

  // --- No-objeto / null / campo faltante ---
  it('rechaza null y valores no-objeto', () => {
    expect(esPerillasValidas(null)).toBe(false);
    expect(esPerillasValidas(undefined)).toBe(false);
    expect(esPerillasValidas(42)).toBe(false);
    expect(esPerillasValidas('perillas')).toBe(false);
  });

  it('rechaza un objeto con un campo requerido faltante', () => {
    const { mensaje: _omitido, ...sinMensaje } = perillaBase();
    expect(esPerillasValidas(sinMensaje)).toBe(false);
  });
});

describe('recortarMensaje y sanitizarPerillas', () => {
  it('recortarMensaje deja intacto un mensaje dentro del límite', () => {
    const corto = 'mensaje corto';
    expect(recortarMensaje(corto)).toBe(corto);
  });

  it('recortarMensaje trunca un mensaje demasiado largo a MAX_MENSAJE', () => {
    const largo = 'x'.repeat(MAX_MENSAJE + 25);
    const recortado = recortarMensaje(largo);
    expect(recortado.length).toBe(MAX_MENSAJE);
  });

  it('sanitizarPerillas recorta un mensaje demasiado largo y devuelve perillas válidas', () => {
    const conMensajeLargo = perillaBase({ mensaje: 'y'.repeat(MAX_MENSAJE + 40) });
    const saneadas = sanitizarPerillas(conMensajeLargo);

    expect(saneadas).not.toBeNull();
    expect(saneadas!.mensaje.length).toBe(MAX_MENSAJE);
    expect(esPerillasValidas(saneadas)).toBe(true);
  });

  it('sanitizarPerillas devuelve null cuando el defecto no es solo un mensaje largo', () => {
    const conEnumInvalido = perillaBase({ paleta: 'invalida' as never });
    expect(sanitizarPerillas(conEnumInvalido)).toBeNull();
  });
});
