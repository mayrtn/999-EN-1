import { describe, it, expect, beforeEach } from 'vitest';
import { InputTeclado, type TecladoLike, type TeclaLike } from './input-teclado';
import { CODIGOS_TECLA } from './mapa-teclas';

// Unit tests de InputUnificado sobre teclado (Task 8.2, Requirements 9.5, 9.6).
// Se usa un TecladoLike mockeado: teclas falsas cuyo `isDown` se alterna entre
// frames para verificar lectura de dirección y estados presionado/just-pressed
// sin cargar Phaser ni el DOM.

/**
 * Teclado mock que implementa {@link TecladoLike}. Registra una {@link TeclaLike}
 * por código y expone helpers para presionar/soltar teclas entre frames.
 */
class TecladoMock implements TecladoLike {
  private readonly teclas = new Map<number, TeclaLike>();

  addKey(keyCode: number): TeclaLike {
    let tecla = this.teclas.get(keyCode);
    if (!tecla) {
      tecla = { isDown: false };
      this.teclas.set(keyCode, tecla);
    }
    return tecla;
  }

  /** Marca la tecla como presionada. */
  presionar(keyCode: number): void {
    this.addKey(keyCode).isDown = true;
  }

  /** Marca la tecla como soltada. */
  soltar(keyCode: number): void {
    this.addKey(keyCode).isDown = false;
  }
}

describe('InputTeclado (InputUnificado sobre teclado)', () => {
  let teclado: TecladoMock;
  let input: InputTeclado;

  beforeEach(() => {
    teclado = new TecladoMock();
    input = new InputTeclado(teclado);
  });

  describe('direccion()', () => {
    it('sin teclas presionadas devuelve {x:0, y:0}', () => {
      expect(input.direccion()).toEqual({ x: 0, y: 0 });
    });

    it('flecha derecha da x = +1', () => {
      teclado.presionar(CODIGOS_TECLA.RIGHT);
      expect(input.direccion()).toEqual({ x: 1, y: 0 });
    });

    it('tecla D (WASD) da x = +1', () => {
      teclado.presionar(CODIGOS_TECLA.D);
      expect(input.direccion().x).toBe(1);
    });

    it('flecha izquierda da x = -1', () => {
      teclado.presionar(CODIGOS_TECLA.LEFT);
      expect(input.direccion()).toEqual({ x: -1, y: 0 });
    });

    it('tecla A (WASD) da x = -1', () => {
      teclado.presionar(CODIGOS_TECLA.A);
      expect(input.direccion().x).toBe(-1);
    });

    it('izquierda y derecha simultáneas se cancelan a x = 0', () => {
      teclado.presionar(CODIGOS_TECLA.LEFT);
      teclado.presionar(CODIGOS_TECLA.RIGHT);
      expect(input.direccion().x).toBe(0);
    });

    it('flecha abajo da y = +1 (coords de pantalla: abajo positivo)', () => {
      teclado.presionar(CODIGOS_TECLA.DOWN);
      expect(input.direccion()).toEqual({ x: 0, y: 1 });
    });

    it('flecha arriba da y = -1 (coords de pantalla: arriba negativo)', () => {
      teclado.presionar(CODIGOS_TECLA.UP);
      expect(input.direccion()).toEqual({ x: 0, y: -1 });
    });

    it('arriba y abajo simultáneas se cancelan a y = 0', () => {
      teclado.presionar(CODIGOS_TECLA.UP);
      teclado.presionar(CODIGOS_TECLA.DOWN);
      expect(input.direccion().y).toBe(0);
    });

    it('combina ejes: derecha + arriba da {x:+1, y:-1}', () => {
      teclado.presionar(CODIGOS_TECLA.RIGHT);
      teclado.presionar(CODIGOS_TECLA.UP);
      expect(input.direccion()).toEqual({ x: 1, y: -1 });
    });
  });

  describe('accionPrimaria() (mantenido)', () => {
    it('devuelve false cuando la tecla primaria no está presionada', () => {
      expect(input.accionPrimaria()).toBe(false);
    });

    it('devuelve true mientras la tecla primaria (Espacio) está presionada', () => {
      teclado.presionar(CODIGOS_TECLA.SPACE);
      expect(input.accionPrimaria()).toBe(true);
    });

    it('vuelve a false tras soltar la tecla primaria', () => {
      teclado.presionar(CODIGOS_TECLA.SPACE);
      expect(input.accionPrimaria()).toBe(true);
      teclado.soltar(CODIGOS_TECLA.SPACE);
      expect(input.accionPrimaria()).toBe(false);
    });
  });

  describe('accionPrimariaJustPressed()', () => {
    it('es false antes de cualquier update', () => {
      expect(input.accionPrimariaJustPressed()).toBe(false);
    });

    it('es true sólo en el frame de la transición up→down', () => {
      // Frame 1: tecla presionada por primera vez.
      teclado.presionar(CODIGOS_TECLA.SPACE);
      input.update();
      expect(input.accionPrimariaJustPressed()).toBe(true);
    });

    it('es false en frames sucesivos mientras se mantiene presionada', () => {
      teclado.presionar(CODIGOS_TECLA.SPACE);
      input.update();
      expect(input.accionPrimariaJustPressed()).toBe(true);

      // Frame 2: sigue presionada → ya no es "recién presionada".
      input.update();
      expect(input.accionPrimariaJustPressed()).toBe(false);

      // Frame 3: idem.
      input.update();
      expect(input.accionPrimariaJustPressed()).toBe(false);
    });

    it('vuelve a ser true sólo tras soltar y re-presionar', () => {
      // Presionar y mantener.
      teclado.presionar(CODIGOS_TECLA.SPACE);
      input.update();
      expect(input.accionPrimariaJustPressed()).toBe(true);
      input.update();
      expect(input.accionPrimariaJustPressed()).toBe(false);

      // Soltar.
      teclado.soltar(CODIGOS_TECLA.SPACE);
      input.update();
      expect(input.accionPrimariaJustPressed()).toBe(false);

      // Re-presionar → just-pressed de nuevo.
      teclado.presionar(CODIGOS_TECLA.SPACE);
      input.update();
      expect(input.accionPrimariaJustPressed()).toBe(true);
    });
  });

  describe('accionSecundaria() (mantenido)', () => {
    it('devuelve false cuando la tecla secundaria no está presionada', () => {
      expect(input.accionSecundaria()).toBe(false);
    });

    it('devuelve true mientras la tecla secundaria (Shift) está presionada', () => {
      teclado.presionar(CODIGOS_TECLA.SHIFT);
      expect(input.accionSecundaria()).toBe(true);
    });
  });

  describe('accionSecundariaJustPressed()', () => {
    it('es true sólo en el frame de la transición up→down', () => {
      teclado.presionar(CODIGOS_TECLA.SHIFT);
      input.update();
      expect(input.accionSecundariaJustPressed()).toBe(true);
    });

    it('es false mientras se mantiene, y true de nuevo tras soltar y re-presionar', () => {
      teclado.presionar(CODIGOS_TECLA.SHIFT);
      input.update();
      expect(input.accionSecundariaJustPressed()).toBe(true);

      input.update();
      expect(input.accionSecundariaJustPressed()).toBe(false);

      teclado.soltar(CODIGOS_TECLA.SHIFT);
      input.update();
      expect(input.accionSecundariaJustPressed()).toBe(false);

      teclado.presionar(CODIGOS_TECLA.SHIFT);
      input.update();
      expect(input.accionSecundariaJustPressed()).toBe(true);
    });

    it('es independiente del just-pressed de la acción primaria', () => {
      // Sólo primaria presionada.
      teclado.presionar(CODIGOS_TECLA.SPACE);
      input.update();
      expect(input.accionPrimariaJustPressed()).toBe(true);
      expect(input.accionSecundariaJustPressed()).toBe(false);
    });
  });

  describe('pausa()', () => {
    it('devuelve false cuando ninguna tecla de pausa está presionada', () => {
      expect(input.pausa()).toBe(false);
    });

    it('devuelve true con Esc presionado', () => {
      teclado.presionar(CODIGOS_TECLA.ESC);
      expect(input.pausa()).toBe(true);
    });

    it('devuelve true con P presionado (tecla alterna de pausa)', () => {
      teclado.presionar(CODIGOS_TECLA.P);
      expect(input.pausa()).toBe(true);
    });
  });
});
