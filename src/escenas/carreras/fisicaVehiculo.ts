/**
 * Funciones puras de física del vehículo para la Escena_Carreras.
 *
 * Módulo sin dependencias de Phaser que calcula aceleración, desaceleración,
 * frenado, colisiones, boost, movimiento lateral y clamping de duración.
 *
 * Todas las funciones reciben estado y retornan nuevo estado sin mutación.
 * deltaMs se expresa en milisegundos y se convierte internamente a segundos
 * para aplicar las tasas (unidades/s²).
 *
 * @module escenas/carreras/fisicaVehiculo
 */

import {
  VELOCIDAD_BASE,
  VELOCIDAD_MAXIMA,
  ACELERACION,
  DESACELERACION,
  FRENADO_ACTIVO,
  BOOST_MULTIPLICADOR,
  DURACION_MIN_MS,
  DURACION_MAX_MS,
} from './constantes';

/**
 * Aplica aceleración al vehículo, clampeando el resultado a VELOCIDAD_MAXIMA.
 *
 * @param velocidadActual - Velocidad actual del vehículo (unidades/s).
 * @param deltaMs - Tiempo transcurrido desde el último frame en milisegundos.
 * @returns Nueva velocidad tras aplicar aceleración, nunca superior a VELOCIDAD_MAXIMA.
 */
export function calcularAceleracion(velocidadActual: number, deltaMs: number): number {
  const deltaSeg = deltaMs / 1000;
  const nuevaVelocidad = velocidadActual + ACELERACION * deltaSeg;
  return Math.min(nuevaVelocidad, VELOCIDAD_MAXIMA);
}

/**
 * Aplica desaceleración natural al vehículo, con floor en VELOCIDAD_BASE.
 *
 * @param velocidadActual - Velocidad actual del vehículo (unidades/s).
 * @param deltaMs - Tiempo transcurrido desde el último frame en milisegundos.
 * @returns Nueva velocidad tras aplicar desaceleración, nunca inferior a VELOCIDAD_BASE.
 */
export function calcularDesaceleracion(velocidadActual: number, deltaMs: number): number {
  const deltaSeg = deltaMs / 1000;
  const nuevaVelocidad = velocidadActual - DESACELERACION * deltaSeg;
  return Math.max(nuevaVelocidad, VELOCIDAD_BASE);
}

/**
 * Aplica frenado activo al vehículo. La reducción es más rápida que la
 * desaceleración natural (FRENADO_ACTIVO > DESACELERACION).
 *
 * @param velocidadActual - Velocidad actual del vehículo (unidades/s).
 * @param deltaMs - Tiempo transcurrido desde el último frame en milisegundos.
 * @returns Nueva velocidad tras aplicar frenado activo, nunca inferior a VELOCIDAD_BASE.
 */
export function calcularFrenadoActivo(velocidadActual: number, deltaMs: number): number {
  const deltaSeg = deltaMs / 1000;
  const nuevaVelocidad = velocidadActual - FRENADO_ACTIVO * deltaSeg;
  return Math.max(nuevaVelocidad, VELOCIDAD_BASE);
}

/**
 * Aplica la penalización de colisión al vehículo. Reduce la velocidad actual
 * en la cantidad de penalización dada, pero nunca por debajo de VELOCIDAD_BASE.
 *
 * @param velocidadActual - Velocidad actual del vehículo (unidades/s).
 * @param penalizacion - Cantidad de velocidad a restar (debe ser positiva).
 * @returns Nueva velocidad tras la colisión, clampeada a VELOCIDAD_BASE como mínimo.
 */
export function aplicarColision(velocidadActual: number, penalizacion: number): number {
  const nuevaVelocidad = velocidadActual - Math.abs(penalizacion);
  return Math.max(nuevaVelocidad, VELOCIDAD_BASE);
}

/**
 * Calcula la velocidad con boost activo. Cuando el boost está activo, multiplica
 * la velocidad por BOOST_MULTIPLICADOR. Puede exceder VELOCIDAD_MAXIMA.
 *
 * @param velocidadActual - Velocidad actual del vehículo (unidades/s).
 * @param boostActivo - Indica si el boost temporal está activo.
 * @returns Velocidad con boost aplicado si activo, o sin cambios si inactivo.
 */
export function calcularBoost(velocidadActual: number, boostActivo: boolean): number {
  if (boostActivo) {
    return velocidadActual * BOOST_MULTIPLICADOR;
  }
  return velocidadActual;
}

/**
 * Mueve el vehículo lateralmente en la dirección indicada, manteniéndolo
 * dentro de los límites de la pista [-maxCarril, +maxCarril].
 *
 * @param posicionActual - Posición lateral actual (carril discreto).
 * @param direccion - Dirección del movimiento: -1 (izquierda), 0 (sin movimiento), +1 (derecha).
 * @param maxCarril - Valor máximo absoluto de carril (ej. 2 para rango [-2, 2]).
 * @returns Nueva posición lateral clampeada a los límites de la pista.
 */
export function moverLateral(posicionActual: number, direccion: number, maxCarril: number): number {
  const nuevaPosicion = posicionActual + direccion;
  return Math.max(-maxCarril, Math.min(nuevaPosicion, maxCarril));
}

/**
 * Clampea la duración de sesión al rango permitido [DURACION_MIN_MS, DURACION_MAX_MS].
 *
 * @param duracionMs - Duración deseada en milisegundos.
 * @returns Duración clampeada al rango [30000, 50000] ms.
 */
export function clampDuracion(duracionMs: number): number {
  return Math.max(DURACION_MIN_MS, Math.min(duracionMs, DURACION_MAX_MS));
}
