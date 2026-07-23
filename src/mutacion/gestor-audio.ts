/**
 * GestorAudioPhaser — implementación concreta de {@link GestorAudio} sobre Phaser 3.
 *
 * Selecciona la pista musical según la perilla `mood_musica`
 * (`calma`/`epico`/`tenso`/`furioso`) y realiza un **crossfade** entre la pista
 * que suena actualmente y la pista destino (Requirement 7.5). El bucle de
 * medición → mutación pide un mood por transición y este gestor se encarga de
 * fundir el audio sin cortes bruscos.
 *
 * Robustez ante ausencia de assets (Fase 3, assets CC0 aún no presentes): las
 * pistas se resuelven a través de un mapa `mood → key` de sonido. Si la key no
 * está cargada en la caché de audio de Phaser, el gestor hace **no-op** de forma
 * defensiva, de modo que la app arranca y muta con audio placeholder o sin audio.
 *
 * @module mutacion/gestor-audio
 * @see Requirement 7.5 (seleccionar la pista según `mood_musica`)
 */

import type Phaser from 'phaser';
import type { GestorAudio, MoodMusica } from '../contrato';

/**
 * Mapa `mood_musica → key de audio` esperada en la caché de Phaser.
 *
 * Los assets CC0 reales se precargan en Fase 3 bajo estas keys. Mientras no
 * existan, el gestor detecta la ausencia y hace no-op (ver {@link GestorAudioPhaser}).
 *
 * | mood      | key de audio esperada |
 * | --------- | --------------------- |
 * | `calma`   | `mus_calma`           |
 * | `epico`   | `mus_epico`           |
 * | `tenso`   | `mus_tenso`           |
 * | `furioso` | `mus_furioso`         |
 */
export const MOOD_A_KEY: Readonly<Record<MoodMusica, string>> = {
  calma: 'mus_calma',
  epico: 'mus_epico',
  tenso: 'mus_tenso',
  furioso: 'mus_furioso',
};

/** Volumen objetivo de la pista activa (fade-in) al final del crossfade. */
const VOLUMEN_MAXIMO = 1;

/** Duración por defecto del crossfade en milisegundos. */
const CROSSFADE_MS = 800;

/**
 * Opciones de configuración del {@link GestorAudioPhaser}.
 */
export interface GestorAudioOpciones {
  /** Volumen máximo de la pista activa (`[0,1]`). Por defecto {@link VOLUMEN_MAXIMO}. */
  volumen?: number;
  /** Duración del crossfade en ms. Por defecto {@link CROSSFADE_MS}. */
  crossfadeMs?: number;
  /** Mapa `mood → key` a usar. Por defecto {@link MOOD_A_KEY}. */
  moodAKey?: Readonly<Record<MoodMusica, string>>;
}

/**
 * Implementación de {@link GestorAudio} basada en el sound manager y los tweens
 * de una `Phaser.Scene` (Requirement 7.5).
 *
 * Diseño defensivo: si la key de audio del mood destino no está cargada, o si el
 * mood ya está sonando, la llamada no hace nada dañino. Cada crossfade tween-ea
 * el volumen de la pista saliente a 0 (deteniéndola al terminar) y el de la
 * entrante de 0 a {@link VOLUMEN_MAXIMO}.
 */
export class GestorAudioPhaser implements GestorAudio {
  private readonly scene: Phaser.Scene;
  private readonly volumen: number;
  private readonly crossfadeMs: number;
  private readonly moodAKey: Readonly<Record<MoodMusica, string>>;

  /** Sonido actualmente activo (o `null` si no hay ninguno sonando). */
  private actual: Phaser.Sound.BaseSound | null = null;
  /** Mood actualmente activo (para evitar reiniciar la misma pista). */
  private moodActual: MoodMusica | null = null;

  /**
   * @param scene Escena de Phaser cuyo sound manager y tweens se usan.
   * @param opciones Ajustes opcionales de volumen, duración y mapa de keys.
   */
  constructor(scene: Phaser.Scene, opciones: GestorAudioOpciones = {}) {
    this.scene = scene;
    this.volumen = opciones.volumen ?? VOLUMEN_MAXIMO;
    this.crossfadeMs = opciones.crossfadeMs ?? CROSSFADE_MS;
    this.moodAKey = opciones.moodAKey ?? MOOD_A_KEY;
  }

  /**
   * Reproduce la pista asociada al `mood`, con crossfade desde la pista actual
   * (Requirement 7.5).
   *
   * Comportamiento defensivo:
   * - Si el `mood` ya es el activo, no hace nada (evita reiniciar la pista).
   * - Si la key del mood no está cargada en la caché de audio, hace no-op (la
   *   app funciona con audio placeholder o sin audio en Fase 3).
   */
  reproducirMood(mood: MoodMusica): void {
    if (mood === this.moodActual) return;

    const key = this.moodAKey[mood];

    // Guarda: sin asset cargado no se puede reproducir. No-op defensivo.
    if (!key || !this.scene.cache.audio.exists(key)) {
      this.moodActual = mood;
      return;
    }

    const saliente = this.actual;

    // Crea e inicia la pista entrante a volumen 0 para fundir hacia arriba.
    const entrante = this.scene.sound.add(key, {
      loop: true,
      volume: 0,
    });
    entrante.play();

    this.iniciarFadeEntrada(entrante);
    if (saliente) this.iniciarFadeSalida(saliente);

    this.actual = entrante;
    this.moodActual = mood;
  }

  /**
   * Detiene la pista activa (si hay) sin crossfade. Útil al abandonar una escena.
   */
  detener(): void {
    if (this.actual) {
      this.actual.stop();
      this.actual.destroy();
      this.actual = null;
    }
    this.moodActual = null;
  }

  /**
   * Funde la pista entrante desde 0 hasta el volumen máximo.
   *
   * Guarda contra sonidos sin control de volumen (algunos backends de audio):
   * si el objeto no soporta la propiedad `volume`, el tween simplemente no aplica.
   */
  private iniciarFadeEntrada(sonido: Phaser.Sound.BaseSound): void {
    if (!this.soportaVolumen(sonido)) return;
    this.scene.tweens.add({
      targets: sonido,
      volume: this.volumen,
      duration: this.crossfadeMs,
    });
  }

  /**
   * Funde la pista saliente hasta 0 y la detiene/libera al completar.
   */
  private iniciarFadeSalida(sonido: Phaser.Sound.BaseSound): void {
    if (!this.soportaVolumen(sonido)) {
      sonido.stop();
      sonido.destroy();
      return;
    }
    this.scene.tweens.add({
      targets: sonido,
      volume: 0,
      duration: this.crossfadeMs,
      onComplete: () => {
        sonido.stop();
        sonido.destroy();
      },
    });
  }

  /**
   * Indica si el sonido expone una propiedad `volume` tween-able. `NoAudioSound`
   * (cuando el navegador no habilita audio) no la expone de forma útil.
   */
  private soportaVolumen(sonido: Phaser.Sound.BaseSound): boolean {
    return typeof (sonido as { volume?: unknown }).volume === 'number';
  }
}
