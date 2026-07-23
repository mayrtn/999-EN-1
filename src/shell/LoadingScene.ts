/**
 * LoadingScene — Pantalla de carga entre transiciones (Requirement 8.2).
 *
 * Escena de infraestructura del Shell (no jugable, no implementa
 * {@link IEscena}). El {@link SceneManager} la muestra mientras se resuelven las
 * `Perillas_Mutacion` de la siguiente Escena (Requirement 8.2) y la oculta al
 * iniciar el destino. Como la resolución de perillas es asíncrona y no bloquea el
 * bucle de frames (Requirement 5.6), esta pantalla garantiza continuidad visual
 * durante la espera.
 *
 * FASE 1 — placeholder: un texto "Cargando..." centrado sobre fondo oscuro. En
 * fases posteriores puede enriquecerse (spinner, arte, tips) sin cambiar el
 * contrato con el {@link SceneManager}.
 *
 * @module shell/LoadingScene
 * @see Requirement 8.2
 */

import Phaser from 'phaser';

/** Clave lógica de la pantalla de carga dentro del gestor de escenas de Phaser. */
export const ID_CARGA = 'carga';

/** Texto mostrado durante la carga (placeholder de Fase 1). */
const TEXTO_CARGA = 'Cargando...';

/**
 * Pantalla de carga mínima usada por el {@link SceneManager} durante las
 * transiciones (Requirement 8.2).
 */
export class LoadingScene extends Phaser.Scene {
  constructor() {
    super({ key: ID_CARGA });
  }

  /** Dibuja el fondo y el texto de carga centrado. */
  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0b0b12');
    this.add
      .text(width / 2, height / 2, TEXTO_CARGA, {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#7cf9ff',
      })
      .setOrigin(0.5);
  }
}
