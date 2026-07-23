/**
 * InputTeclado — implementación concreta de {@link InputUnificado} sobre teclado
 * (Requirements 9.5, 9.6).
 *
 * Envuelve el teclado de Phaser (`Phaser.Input.Keyboard`) pero depende de una
 * abstracción mínima inyectable ({@link TecladoLike}) en lugar de alcanzar
 * globals. Esto permite:
 * - Que las tres Escenas compartan el MISMO mapa de teclas (Requirement 9.6) al
 *   construirse todas con el mismo {@link MAPA_TECLAS}.
 * - Unit-testear la lectura de dirección y los estados presionado/just-pressed
 *   con un teclado mockeado (Task 8.2), sin cargar Phaser ni el DOM.
 *
 * El just-pressed se calcula manualmente comparando el estado del frame anterior
 * con el actual mediante {@link InputTeclado.update}, en vez de
 * `Phaser.Input.Keyboard.JustDown`. Se eligió esta vía porque los tests corren
 * en entorno `node` (sin Phaser en runtime) y porque el flag manual permanece
 * estable durante todo el frame (consultable varias veces), evitando el consumo
 * de una sola lectura del `JustDown` nativo.
 *
 * @module input/input-teclado
 */

import type Phaser from 'phaser';
import type { InputUnificado } from '../contrato';
import { MAPA_TECLAS, type MapaTeclas } from './mapa-teclas';

/**
 * Forma mínima de una tecla (compatible con `Phaser.Input.Keyboard.Key`).
 * Sólo se necesita saber si está presionada.
 */
export interface TeclaLike {
  isDown: boolean;
}

/**
 * Forma mínima de un teclado (compatible con
 * `Phaser.Input.Keyboard.KeyboardPlugin`). Sólo se necesita poder registrar
 * teclas por código.
 */
export interface TecladoLike {
  addKey(keyCode: number): TeclaLike;
}

/** Acciones cuyo estado just-pressed se rastrea entre frames. */
type AccionJustPressed = 'accionPrimaria' | 'accionSecundaria';

/**
 * Implementación de {@link InputUnificado} respaldada por un {@link TecladoLike}.
 *
 * Uso en una Escena (cliente): `InputTeclado.desdeEscena(this)`.
 * Uso en tests: `new InputTeclado(tecladoMock)`.
 *
 * La Escena debe llamar {@link InputTeclado.update} una vez por frame (al inicio
 * de su `update()`) para que `accion*JustPressed()` refleje la transición del
 * frame.
 */
export class InputTeclado implements InputUnificado {
  private readonly teclas: Record<keyof MapaTeclas, TeclaLike[]>;

  /** Estado presionado del frame anterior (para calcular just-pressed). */
  private readonly presionadoPrevio: Record<AccionJustPressed, boolean> = {
    accionPrimaria: false,
    accionSecundaria: false,
  };

  /** Flag just-pressed vigente durante el frame actual. */
  private readonly justPressed: Record<AccionJustPressed, boolean> = {
    accionPrimaria: false,
    accionSecundaria: false,
  };

  /**
   * @param teclado Teclado inyectable (el plugin de Phaser o un mock).
   * @param mapa Mapa de teclas a usar; por defecto el compartido
   *   ({@link MAPA_TECLAS}) para garantizar el mismo binding en las tres Escenas.
   */
  constructor(teclado: TecladoLike, mapa: MapaTeclas = MAPA_TECLAS) {
    const registrar = (codigos: readonly number[]): TeclaLike[] =>
      codigos.map((codigo) => teclado.addKey(codigo));

    this.teclas = {
      arriba: registrar(mapa.arriba),
      abajo: registrar(mapa.abajo),
      izquierda: registrar(mapa.izquierda),
      derecha: registrar(mapa.derecha),
      accionPrimaria: registrar(mapa.accionPrimaria),
      accionSecundaria: registrar(mapa.accionSecundaria),
      pausa: registrar(mapa.pausa),
    };
  }

  /**
   * Construye un {@link InputTeclado} a partir de una `Phaser.Scene`, tomando su
   * plugin de teclado. Todas las Escenas usan esta fábrica con el mismo mapa por
   * defecto, garantizando idéntico esquema de controles (Requirement 9.6).
   *
   * @throws Error si el plugin de teclado no está disponible en la escena.
   */
  static desdeEscena(scene: Phaser.Scene, mapa: MapaTeclas = MAPA_TECLAS): InputTeclado {
    const teclado = scene.input.keyboard;
    if (!teclado) {
      throw new Error(
        'InputTeclado.desdeEscena: el plugin de teclado no está disponible ' +
          '(¿input.keyboard deshabilitado en la config del juego?).'
      );
    }
    return new InputTeclado(teclado as unknown as TecladoLike, mapa);
  }

  /** ¿Está presionada alguna de las teclas de la acción indicada? */
  private algunaPresionada(accion: keyof MapaTeclas): boolean {
    return this.teclas[accion].some((tecla) => tecla.isDown);
  }

  /**
   * Actualiza los flags de just-pressed comparando el frame anterior con el
   * actual. Debe llamarse una vez por frame, antes de leer
   * `accion*JustPressed()`.
   */
  update(): void {
    (['accionPrimaria', 'accionSecundaria'] as const).forEach((accion) => {
      const ahora = this.algunaPresionada(accion);
      this.justPressed[accion] = ahora && !this.presionadoPrevio[accion];
      this.presionadoPrevio[accion] = ahora;
    });
  }

  /**
   * Dirección como vector normalizado por eje en `[-1, 1]`. Combina flechas y
   * WASD; si dos teclas opuestas están presionadas a la vez, el eje neto es 0.
   * El eje Y sigue las coordenadas de pantalla de Phaser (abajo = +1).
   */
  direccion(): { x: number; y: number } {
    const x = (this.algunaPresionada('derecha') ? 1 : 0) - (this.algunaPresionada('izquierda') ? 1 : 0);
    const y = (this.algunaPresionada('abajo') ? 1 : 0) - (this.algunaPresionada('arriba') ? 1 : 0);
    return { x, y };
  }

  /** Acción primaria presionada este frame (Requirement 9.6). */
  accionPrimaria(): boolean {
    return this.algunaPresionada('accionPrimaria');
  }

  /** Acción primaria recién presionada en este frame (just-pressed). */
  accionPrimariaJustPressed(): boolean {
    return this.justPressed.accionPrimaria;
  }

  /** Acción secundaria presionada este frame. */
  accionSecundaria(): boolean {
    return this.algunaPresionada('accionSecundaria');
  }

  /** Acción secundaria recién presionada en este frame (just-pressed). */
  accionSecundariaJustPressed(): boolean {
    return this.justPressed.accionSecundaria;
  }

  /** Tecla de pausa presionada este frame. */
  pausa(): boolean {
    return this.algunaPresionada('pausa');
  }
}
