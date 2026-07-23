/**
 * Validador de Perillas_Mutacion (guarda del conjunto cerrado).
 *
 * Implementa la validación estricta que el Shell aplica sobre la respuesta
 * (no confiable) del Servicio_Backend antes de mutar la siguiente Escena. La
 * respuesta de Bedrock se trata como `unknown` hasta pasar por esta guarda: si
 * algún campo está fuera del conjunto cerrado o de su rango, se descarta y se
 * usa la Mutacion_Fallback.
 *
 * `esPerillasValidas` es una guarda **pura y estricta**: no muta ni repara la
 * entrada. El recorte defensivo del `mensaje` vive en helpers separados
 * ({@link recortarMensaje} y {@link sanitizarPerillas}) para mantener la
 * validación libre de efectos.
 *
 * @module mutacion/validador
 * @see Requirements 5.4 (validación estricta del conjunto cerrado), 9.2 (definición del conjunto cerrado)
 */

import {
  PALETAS,
  CLIMAS,
  MOODS,
  MAX_MENSAJE,
  type PerillasMutacion,
  type Paleta,
  type Clima,
  type MoodMusica,
} from '../contrato';

/**
 * Indica si `x` es un número finito en el rango `[0, 1]` inclusive.
 *
 * Rechaza no-números, `NaN`, `Infinity` y `-Infinity`, así como valores fuera
 * del rango. Usado para `intensidad_enemigos` y `agresividad` (Requirement 9.2).
 */
function esNumeroEnRangoUnitario(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
}

/**
 * Guarda de tipo estricta para {@link PerillasMutacion} (Requirements 5.4, 9.2).
 *
 * Devuelve `true` únicamente cuando `x` es un objeto con **todos** estos campos
 * bien formados y pertenecientes al conjunto cerrado:
 * - `paleta` ∈ {@link PALETAS}
 * - `clima` ∈ {@link CLIMAS}
 * - `mood_musica` ∈ {@link MOODS}
 * - `intensidad_enemigos` número finito en `[0, 1]`
 * - `agresividad` número finito en `[0, 1]`
 * - `mensaje` string de longitud ≤ {@link MAX_MENSAJE}
 *
 * Rechaza `null`, valores no-objeto, campos faltantes, tipos incorrectos,
 * números fuera de rango (incluidos `NaN` e `Infinity`) y valores de enum fuera
 * del conjunto cerrado. Es pura: no muta ni recorta la entrada.
 */
export function esPerillasValidas(x: unknown): x is PerillasMutacion {
  if (typeof x !== 'object' || x === null) return false;

  const p = x as Record<string, unknown>;

  return (
    typeof p.paleta === 'string' &&
    (PALETAS as readonly string[]).includes(p.paleta) &&
    typeof p.clima === 'string' &&
    (CLIMAS as readonly string[]).includes(p.clima) &&
    typeof p.mood_musica === 'string' &&
    (MOODS as readonly string[]).includes(p.mood_musica) &&
    esNumeroEnRangoUnitario(p.intensidad_enemigos) &&
    esNumeroEnRangoUnitario(p.agresividad) &&
    typeof p.mensaje === 'string' &&
    p.mensaje.length <= MAX_MENSAJE
  );
}

/**
 * Recorta defensivamente un mensaje a {@link MAX_MENSAJE} caracteres.
 *
 * El diseño exige un "recorte defensivo del mensaje": esta función garantiza
 * que un mensaje potencialmente largo del Servicio_IA nunca exceda el máximo.
 * Se mantiene fuera de {@link esPerillasValidas} para que la validación siga
 * siendo estricta y sin efectos (Requirement 5.4).
 */
export function recortarMensaje(mensaje: string): string {
  return mensaje.length > MAX_MENSAJE ? mensaje.slice(0, MAX_MENSAJE) : mensaje;
}

/**
 * Sanea una respuesta candidata a {@link PerillasMutacion} recortando el
 * `mensaje` a {@link MAX_MENSAJE} antes de validar.
 *
 * Útil cuando la única razón por la que una respuesta fallaría es un `mensaje`
 * demasiado largo: se recorta y se revalida contra el conjunto cerrado. Si tras
 * el recorte sigue sin cumplir la guarda estricta, devuelve `null` para que el
 * llamador use la Mutacion_Fallback (Requirements 5.4, 5.5).
 *
 * @returns Las perillas válidas con el `mensaje` recortado, o `null` si no son
 *   válidas por cualquier otro motivo.
 */
export function sanitizarPerillas(x: unknown): PerillasMutacion | null {
  if (typeof x !== 'object' || x === null) return null;

  const p = x as Record<string, unknown>;

  // Recorta el mensaje de forma defensiva antes de validar; no toca el resto.
  const candidato: Record<string, unknown> = { ...p };
  if (typeof p.mensaje === 'string') {
    candidato.mensaje = recortarMensaje(p.mensaje);
  }

  if (!esPerillasValidas(candidato)) return null;

  // `esPerillasValidas` ya estrechó el tipo; reconstruimos un objeto limpio.
  return {
    paleta: candidato.paleta as Paleta,
    intensidad_enemigos: candidato.intensidad_enemigos as number,
    agresividad: candidato.agresividad as number,
    clima: candidato.clima as Clima,
    mood_musica: candidato.mood_musica as MoodMusica,
    mensaje: candidato.mensaje as string,
  };
}
