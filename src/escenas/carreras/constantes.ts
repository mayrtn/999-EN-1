/**
 * Constantes de configuración para la Escena_Carreras.
 *
 * Definen los parámetros de velocidad, boost, pista y sesión que gobiernan
 * la física del vehículo, la generación de pista y la duración de la carrera.
 *
 * @module escenas/carreras/constantes
 */

// ─── Velocidad ───────────────────────────────────────────────────────────────

/** Velocidad mínima del vehículo (desacelerado total). */
export const VELOCIDAD_BASE = 120;

/** Velocidad máxima alcanzable sin boost. */
export const VELOCIDAD_MAXIMA = 450;

/** Aceleración en unidades/s² al mantener dirección arriba. */
export const ACELERACION = 200;

/** Desaceleración natural en unidades/s² cuando no se acelera. */
export const DESACELERACION = 80;

/** Frenado activo en unidades/s² (acción secundaria del InputUnificado). */
export const FRENADO_ACTIVO = 200;

// ─── Boost ───────────────────────────────────────────────────────────────────

/** Factor multiplicador temporal de velocidad durante el boost. */
export const BOOST_MULTIPLICADOR = 1.4;

/** Duración del boost en milisegundos. */
export const BOOST_DURACION_MS = 2000;

/** Cooldown entre activaciones de boost en milisegundos. */
export const BOOST_COOLDOWN_MS = 5000;

// ─── Pista ───────────────────────────────────────────────────────────────────

/** Fracción de VELOCIDAD_MAXIMA a partir de la cual se considera velocidad alta. */
export const UMBRAL_ALTA_VELOCIDAD = 0.8;

/** Píxeles de proximidad sin colisión para registrar una Pasada_Al_Ras. */
export const MARGEN_PASADA_AL_RAS = 15;

/** Ancho visual de la pista en píxeles. */
export const ANCHO_PISTA = 200;

/** Cantidad de posiciones laterales discretas (carriles). */
export const CARRILES = 3;

// ─── Sesión ──────────────────────────────────────────────────────────────────

/** Duración mínima permitida de la sesión en milisegundos (30 segundos). */
export const DURACION_MIN_MS = 30000;

/** Duración máxima permitida de la sesión en milisegundos (50 segundos). */
export const DURACION_MAX_MS = 50000;

/** Duración por defecto de la sesión en milisegundos (40 segundos). */
export const DURACION_DEFECTO_MS = 40000;
