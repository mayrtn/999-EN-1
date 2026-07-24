/**
 * OverlayTextoPhaser — implementación concreta de {@link OverlayTexto} sobre Phaser 3.
 *
 * Muestra el `mensaje` corto de la IA como un overlay de texto **temporal** al
 * iniciar la escena (Requirement 7.6): aparece con un fade-in, permanece unos
 * segundos y se oculta con un fade-out automático. Se posiciona en un punto fijo
 * de la pantalla (parte superior, centrado) y permanece fijo al scroll de la
 * cámara.
 *
 * Diseño defensivo: si se muestra un nuevo mensaje mientras el anterior sigue
 * visible, se cancela el ciclo previo para no solapar overlays. Un `mensaje`
 * vacío no crea nada.
 *
 * @module mutacion/overlay-texto
 * @see Requirement 7.6 (mostrar el texto corto de la IA al jugador)
 */

import type Phaser from 'phaser';
import { MAX_MENSAJE, type OverlayTexto } from '../contrato';

/** Tiempo (ms) que el mensaje permanece totalmente visible antes de desvanecerse. */
const DURACION_VISIBLE_MS = 3000;

/** Duración (ms) de los tweens de fade in / fade out. */
const FADE_MS = 400;

/** Desplazamiento vertical desde el borde superior, en píxeles. */
const MARGEN_SUPERIOR = 48;

/**
 * Opciones de configuración del {@link OverlayTextoPhaser}.
 */
export interface OverlayTextoOpciones {
  /** Tiempo totalmente visible antes del fade-out (ms). Por defecto {@link DURACION_VISIBLE_MS}. */
  duracionVisibleMs?: number;
  /** Duración de los fades (ms). Por defecto {@link FADE_MS}. */
  fadeMs?: number;
  /** Margen desde el borde superior (px). Por defecto {@link MARGEN_SUPERIOR}. */
  margenSuperior?: number;
  /** Estilo del texto (se combina con un estilo 8-bit por defecto). */
  estilo?: Phaser.Types.GameObjects.Text.TextStyle;
}

/** Estilo 8-bit por defecto para el overlay. */
const ESTILO_DEFAULT: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'PlanesValMore',
  fontSize: '20px',
  color: '#ffffff',
  align: 'center',
  stroke: '#000000',
  strokeThickness: 4,
};

/**
 * Implementación de {@link OverlayTexto} usando un `Phaser.GameObjects.Text`
 * fijado a la pantalla y tweens de alpha para el ciclo temporal (Requirement 7.6).
 */
export class OverlayTextoPhaser implements OverlayTexto {
  private readonly scene: Phaser.Scene;
  private readonly duracionVisibleMs: number;
  private readonly fadeMs: number;
  private readonly margenSuperior: number;
  private readonly estilo: Phaser.Types.GameObjects.Text.TextStyle;

  /** Objeto de texto reutilizado entre mensajes (o `null` si aún no se creó). */
  private texto: Phaser.GameObjects.Text | null = null;
  /** Handler del temporizador de auto-ocultado en curso, para poder cancelarlo. */
  private timer: Phaser.Time.TimerEvent | null = null;

  /**
   * @param scene Escena de Phaser cuyos objetos de texto, tweens y timers se usan.
   * @param opciones Ajustes opcionales de duración, fade, posición y estilo.
   */
  constructor(scene: Phaser.Scene, opciones: OverlayTextoOpciones = {}) {
    this.scene = scene;
    this.duracionVisibleMs = opciones.duracionVisibleMs ?? DURACION_VISIBLE_MS;
    this.fadeMs = opciones.fadeMs ?? FADE_MS;
    this.margenSuperior = opciones.margenSuperior ?? MARGEN_SUPERIOR;
    this.estilo = { ...ESTILO_DEFAULT, ...(opciones.estilo ?? {}) };
  }

  /**
   * Muestra un `mensaje` corto de forma temporal (Requirement 7.6).
   *
   * Recorta defensivamente a {@link MAX_MENSAJE} caracteres, cancela cualquier
   * ciclo anterior en curso, hace fade-in, mantiene el mensaje visible y luego
   * fade-out con auto-ocultado. Un mensaje vacío o en blanco no muestra nada.
   */
  mostrar(mensaje: string): void {
    const texto = (mensaje ?? '').slice(0, MAX_MENSAJE).trim();
    if (texto.length === 0) return;

    this.cancelarCicloPrevio();

    const objeto = this.obtenerObjetoTexto();
    objeto.setText(texto);
    this.reposicionar(objeto);
    objeto.setAlpha(0);
    objeto.setVisible(true);

    // Fade-in.
    this.scene.tweens.add({
      targets: objeto,
      alpha: 1,
      duration: this.fadeMs,
    });

    // Tras permanecer visible, fade-out y ocultar.
    this.timer = this.scene.time.delayedCall(
      this.fadeMs + this.duracionVisibleMs,
      () => {
        this.scene.tweens.add({
          targets: objeto,
          alpha: 0,
          duration: this.fadeMs,
          onComplete: () => objeto.setVisible(false),
        });
      }
    );
  }

  /**
   * Destruye el overlay y cancela cualquier ciclo en curso. Útil al cerrar la escena.
   */
  destruir(): void {
    this.cancelarCicloPrevio();
    if (this.texto) {
      this.texto.destroy();
      this.texto = null;
    }
  }

  /** Crea (perezosamente) el objeto de texto fijo a pantalla, o devuelve el existente. */
  private obtenerObjetoTexto(): Phaser.GameObjects.Text {
    if (this.texto) return this.texto;
    const objeto = this.scene.add.text(0, 0, '', this.estilo);
    objeto.setOrigin(0.5, 0);
    // Fijo a la pantalla: inmune al scroll de cámara y por encima del mundo.
    objeto.setScrollFactor(0);
    objeto.setDepth(1000);
    objeto.setVisible(false);
    this.texto = objeto;
    return objeto;
  }

  /** Centra el texto horizontalmente y lo ancla al margen superior. */
  private reposicionar(objeto: Phaser.GameObjects.Text): void {
    const ancho = this.scene.scale.width;
    objeto.setPosition(ancho / 2, this.margenSuperior);
  }

  /** Cancela el temporizador de auto-ocultado y detiene tweens del texto en curso. */
  private cancelarCicloPrevio(): void {
    if (this.timer) {
      this.timer.remove(false);
      this.timer = null;
    }
    if (this.texto) {
      this.scene.tweens.killTweensOf(this.texto);
    }
  }
}
