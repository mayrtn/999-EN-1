/**
 * Mapa de teclas centralizado del Contrato_Compartido (Requirements 9.5, 9.6).
 *
 * Único punto donde vive el binding concreto teclado → acciones lógicas. Las
 * tres Escenas (Nivel_Plataformas, Nivel_Ritmo, Nivel_Shooter) comparten el
 * MISMO {@link InputUnificado}, por lo que este mapa es idéntico para todas y
 * garantiza el requisito de "mismo mapa de teclas en los tres niveles"
 * (Requirement 9.6).
 *
 * `[PENDIENTE — Documento_Decisiones]` (Requirement 12.1): el esquema de
 * controles definitivo aún debe confirmarlo el equipo. Estos valores son
 * defaults sensatos que no bloquean la implementación en paralelo; cuando el
 * equipo cierre la decisión, sólo se edita este archivo sin tocar Escenas.
 *
 * @module input/mapa-teclas
 */

/**
 * Códigos de tecla usados por el mapa por defecto.
 *
 * Se declaran como literales numéricos (los mismos valores que
 * `Phaser.Input.Keyboard.KeyCodes`) para mantener este módulo libre de un
 * import de Phaser en tiempo de ejecución. Así el input es testeable con un
 * teclado mockeado en un entorno `node` sin cargar el motor completo.
 */
export const CODIGOS_TECLA = {
  // Flechas.
  UP: 38,
  DOWN: 40,
  LEFT: 37,
  RIGHT: 39,
  // WASD.
  W: 87,
  A: 65,
  S: 83,
  D: 68,
  // Acciones.
  SPACE: 32,
  SHIFT: 16,
  ESC: 27,
  P: 80,
} as const;

/**
 * Estructura del mapa de teclas: cada acción lógica se asocia a una o más
 * teclas físicas. Se admiten múltiples teclas por acción (p. ej. flechas + WASD
 * para el movimiento) — la acción se considera activa si cualquiera de sus
 * teclas está presionada.
 */
export interface MapaTeclas {
  /** Movimiento hacia arriba (eje Y negativo). */
  arriba: readonly number[];
  /** Movimiento hacia abajo (eje Y positivo, coords de pantalla de Phaser). */
  abajo: readonly number[];
  /** Movimiento hacia la izquierda (eje X negativo). */
  izquierda: readonly number[];
  /** Movimiento hacia la derecha (eje X positivo). */
  derecha: readonly number[];
  /** Acción primaria: saltar / golpear ritmo / disparar. */
  accionPrimaria: readonly number[];
  /** Acción secundaria: dash / acción alterna por escena. */
  accionSecundaria: readonly number[];
  /** Pausa. */
  pausa: readonly number[];
}

/**
 * Mapa de teclas por defecto compartido por las tres Escenas
 * (Requirements 9.5, 9.6).
 *
 * Defaults (marcados `[PENDIENTE — Documento_Decisiones]`, Requirement 12.1):
 * - Movimiento: flechas **y** WASD (ambos soportados a la vez).
 * - Acción primaria: `Espacio`.
 * - Acción secundaria: `Shift`.
 * - Pausa: `Esc` o `P`.
 */
export const MAPA_TECLAS: MapaTeclas = {
  arriba: [CODIGOS_TECLA.UP, CODIGOS_TECLA.W],
  abajo: [CODIGOS_TECLA.DOWN, CODIGOS_TECLA.S],
  izquierda: [CODIGOS_TECLA.LEFT, CODIGOS_TECLA.A],
  derecha: [CODIGOS_TECLA.RIGHT, CODIGOS_TECLA.D],
  accionPrimaria: [CODIGOS_TECLA.SPACE],
  accionSecundaria: [CODIGOS_TECLA.SHIFT],
  pausa: [CODIGOS_TECLA.ESC, CODIGOS_TECLA.P],
} as const;
