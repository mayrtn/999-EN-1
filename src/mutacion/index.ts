/**
 * Módulo Mutacion — validación, fallback y piezas concretas de mutación.
 *
 * Punto único de importación de la lógica de mutación del cliente: la guarda del
 * conjunto cerrado, la heurística de fallback y las piezas concretas basadas en
 * Phaser que las Escenas y el Sistema_Mutacion consumen (gestor de audio con
 * crossfade, overlay de texto temporal y capas de partículas por clima).
 *
 * @module mutacion
 */

export {
  esPerillasValidas,
  recortarMensaje,
  sanitizarPerillas,
} from './validador';

export { calcularFallback } from './fallback';

export { GestorAudioPhaser, MOOD_A_KEY } from './gestor-audio';
export type { GestorAudioOpciones } from './gestor-audio';

export { OverlayTextoPhaser } from './overlay-texto';
export type { OverlayTextoOpciones } from './overlay-texto';

export {
  crearCapaClima,
  asegurarTexturaParticula,
  KEY_TEXTURA_PARTICULA,
} from './clima';

export { SistemaMutacion, TINTES_POR_PALETA } from './sistemaMutacion';
