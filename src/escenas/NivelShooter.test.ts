/**
 * Unit tests de Nivel_Shooter (Task 9.6).
 *
 * Verifican la lógica jugable del shooter de galería fija sin arrancar un mundo
 * Phaser completo: se construye la escena real y se sustituyen los colaboradores
 * de Phaser (`scale`, `add`, `tweens`, `time`) y del Contrato (`inputUnificado`,
 * `shell`) por dobles con `vi.fn()`. Se accede a campos/métodos privados por
 * casting `as any`, lo cual es aceptable para pruebas de caja blanca.
 *
 * Cobertura:
 * - Acotado de duración a [60000, 90000] (contexto de Requirements 3.1/3.5).
 * - Movimiento de la mira según el input, acotado a los bordes (Requirement 3.2).
 * - Generación de disparo al presionar la acción primaria (Requirement 3.3).
 * - Impacto que registra y remueve el objetivo de la escena (Requirement 3.4).
 * - Fin de sesión que reporta telemetría y solicita el retorno (Requirement 3.5).
 * - Forma de la Telemetria_Rasgos y la DeclaracionRasgos (Requirement 3.7).
 *
 * Son unit tests de ejemplo (no property tests).
 */

import { describe, it, expect, vi } from 'vitest';
import type { IShell, InputUnificado } from '../contrato';

// Phaser real requiere un DOM (HTMLVideoElement, etc.) que el entorno 'node' de
// Vitest no provee. Como estos tests ejercitan solo la lógica de la escena (no
// el render), se sustituye Phaser por un doble mínimo: una clase Scene
// extensible y las utilidades matemáticas puras que usa NivelShooter.
vi.mock('phaser', () => {
  class Scene {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_config?: unknown) {}
  }
  return {
    default: {
      Scene,
      Math: {
        Clamp: (v: number, min: number, max: number) =>
          Math.min(max, Math.max(min, v)),
        Between: (min: number, _max: number) => min,
      },
    },
  };
});

import { NivelShooter } from './NivelShooter';

/**
 * Construye una NivelShooter y le inyecta stubs mínimos de Phaser para poder
 * ejercitar sus métodos privados sin bootear la escena.
 */
function crearEscena(duracionMs?: number): any {
  const escena = new NivelShooter(
    duracionMs === undefined ? {} : { duracionMs },
  ) as any;

  // Colaboradores de Phaser que las funciones bajo prueba consultan.
  escena.scale = { width: 800, height: 600 };
  escena.time = { now: 0 };
  escena.tweens = { add: vi.fn() };
  escena.add = {
    // mostrarDestelloDisparo usa this.add.circle(...).setDepth(...)
    circle: vi.fn(() => ({ setDepth: vi.fn(() => ({})) })),
  };

  return escena;
}

/** Doble de InputUnificado con dirección y just-pressed configurables. */
function crearInput(
  overrides: Partial<InputUnificado> = {},
): InputUnificado {
  return {
    direccion: () => ({ x: 0, y: 0 }),
    accionPrimaria: () => false,
    accionPrimariaJustPressed: () => false,
    accionSecundaria: () => false,
    accionSecundariaJustPressed: () => false,
    pausa: () => false,
    pausaJustPressed: () => false,
    ...overrides,
  } as unknown as InputUnificado;
}

/** Doble de mira: sprite con x/y y setPosition espiable. */
function crearMira(x = 400, y = 300) {
  return {
    x,
    y,
    setPosition: vi.fn(function (this: any, nx: number, ny: number) {
      this.x = nx;
      this.y = ny;
    }),
  };
}

/** Doble de objetivo activo con un sprite cuyo getBounds().contains es fijable. */
function crearObjetivo(contiene: boolean, aparicionMs = 0) {
  const destroy = vi.fn();
  return {
    sprite: {
      x: 100,
      getBounds: () => ({ contains: () => contiene }),
      setX: vi.fn(),
      destroy,
    },
    velocidadX: 0,
    aparicionMs,
    _destroy: destroy,
  };
}

/** Doble de IShell con métodos espiables. */
function crearShell(): IShell & Record<string, ReturnType<typeof vi.fn>> {
  return {
    solicitarTransicion: vi.fn(),
    reportarTelemetria: vi.fn(),
    obtenerPerfil: vi.fn(),
  } as unknown as IShell & Record<string, ReturnType<typeof vi.fn>>;
}

describe('NivelShooter', () => {
  // --- Acotado de duración (contexto Requirements 3.1 / 3.5) ---
  describe('acotado de duración a [60000, 90000]', () => {
    it('eleva una duración por debajo del mínimo hasta 60000', () => {
      const escena = crearEscena(30_000);
      expect(escena.duracionMs).toBe(60_000);
    });

    it('recorta una duración por encima del máximo hasta 90000', () => {
      const escena = crearEscena(120_000);
      expect(escena.duracionMs).toBe(90_000);
    });

    it('conserva una duración dentro del rango', () => {
      const escena = crearEscena(75_000);
      expect(escena.duracionMs).toBe(75_000);
    });

    it('usa un valor por defecto válido cuando no se configura', () => {
      const escena = crearEscena();
      expect(escena.duracionMs).toBeGreaterThanOrEqual(60_000);
      expect(escena.duracionMs).toBeLessThanOrEqual(90_000);
    });
  });

  // --- Movimiento de la mira (Requirement 3.2) ---
  describe('moverMira: movimiento según el input, acotado a los bordes (Req 3.2)', () => {
    it('desplaza la mira hacia la derecha según la dirección del input', () => {
      const escena = crearEscena();
      const mira = crearMira(100, 100);
      escena.mira = mira;
      escena.inputUnificado = crearInput({ direccion: () => ({ x: 1, y: 0 }) });

      escena.moverMira(16);

      expect(mira.setPosition).toHaveBeenCalledTimes(1);
      // Con VELOCIDAD_MIRA=420 y delta 16ms el paso es ~6.72 px hacia la derecha.
      expect(mira.x).toBeGreaterThan(100);
      expect(mira.y).toBe(100);
    });

    it('acota la posición al borde derecho (no excede width)', () => {
      const escena = crearEscena();
      const mira = crearMira(799, 300);
      escena.mira = mira;
      escena.inputUnificado = crearInput({ direccion: () => ({ x: 1, y: 0 }) });

      escena.moverMira(1000); // paso grande para forzar el clamp

      expect(mira.x).toBe(800); // clamp a width
    });

    it('acota la posición al borde superior (no baja de 0)', () => {
      const escena = crearEscena();
      const mira = crearMira(400, 5);
      escena.mira = mira;
      escena.inputUnificado = crearInput({ direccion: () => ({ x: 0, y: -1 }) });

      escena.moverMira(1000);

      expect(mira.y).toBe(0); // clamp a 0
    });

    it('no arroja ni mueve si falta la mira o el input (defensivo)', () => {
      const escena = crearEscena();
      escena.mira = undefined;
      escena.inputUnificado = crearInput({ direccion: () => ({ x: 1, y: 0 }) });
      expect(() => escena.moverMira(16)).not.toThrow();
    });
  });

  // --- Generación de disparo (Requirement 3.3) ---
  describe('procesarDisparo: dispara al presionar la acción primaria (Req 3.3)', () => {
    it('incrementa el conteo de disparos cuando la acción está recién presionada', () => {
      const escena = crearEscena();
      escena.mira = crearMira(200, 200);
      escena.objetivos = [];
      escena.inputUnificado = crearInput({
        accionPrimariaJustPressed: () => true,
      });

      escena.procesarDisparo();

      expect(escena.disparos).toBe(1);
      // Se mostró el destello del disparo en la posición de la mira.
      expect(escena.add.circle).toHaveBeenCalledTimes(1);
    });

    it('no dispara cuando la acción no fue presionada', () => {
      const escena = crearEscena();
      escena.mira = crearMira(200, 200);
      escena.objetivos = [];
      escena.inputUnificado = crearInput({
        accionPrimariaJustPressed: () => false,
      });

      escena.procesarDisparo();

      expect(escena.disparos).toBe(0);
      expect(escena.add.circle).not.toHaveBeenCalled();
    });
  });

  // --- Impacto que remueve objetivo (Requirement 3.4) ---
  describe('resolverImpacto: registra el impacto y remueve el objetivo (Req 3.4)', () => {
    it('destruye el objetivo alcanzado y lo saca del arreglo', () => {
      const escena = crearEscena();
      escena.time = { now: 5_000 };
      const objetivo = crearObjetivo(true, 4_900); // vida 100ms → quick-draw
      escena.objetivos = [objetivo];

      escena.resolverImpacto(100, 100);

      expect(escena.impactos).toBe(1);
      expect(escena.objetivosDestruidos).toBe(1);
      expect(escena.impactosRapidos).toBe(1); // dentro de la ventana quick-draw
      expect(escena.objetivos).toHaveLength(0);
      expect(objetivo._destroy).toHaveBeenCalledTimes(1);
    });

    it('no cuenta quick-draw si el objetivo llevaba tiempo en pantalla', () => {
      const escena = crearEscena();
      escena.time = { now: 10_000 };
      const objetivo = crearObjetivo(true, 0); // vida 10s → no quick-draw
      escena.objetivos = [objetivo];

      escena.resolverImpacto(100, 100);

      expect(escena.impactos).toBe(1);
      expect(escena.objetivosDestruidos).toBe(1);
      expect(escena.impactosRapidos).toBe(0);
      expect(escena.objetivos).toHaveLength(0);
    });

    it('un disparo fallido deja el arreglo intacto y no registra impacto', () => {
      const escena = crearEscena();
      escena.time = { now: 5_000 };
      const objetivo = crearObjetivo(false); // el punto no cae dentro
      escena.objetivos = [objetivo];

      escena.resolverImpacto(9_999, 9_999);

      expect(escena.impactos).toBe(0);
      expect(escena.objetivosDestruidos).toBe(0);
      expect(escena.objetivos).toHaveLength(1);
      expect(objetivo._destroy).not.toHaveBeenCalled();
    });

    it('solo destruye un objetivo por disparo (el primero alcanzado)', () => {
      const escena = crearEscena();
      escena.time = { now: 0 };
      const a = crearObjetivo(true);
      const b = crearObjetivo(true);
      escena.objetivos = [a, b];

      escena.resolverImpacto(100, 100);

      expect(escena.objetivos).toHaveLength(1);
      expect(escena.impactos).toBe(1);
    });
  });

  // --- Fin de sesión (Requirement 3.5) ---
  describe('finalizar: reporta telemetría y solicita el retorno (Req 3.5)', () => {
    it('reporta la telemetría y solicita la transición a plataformas', () => {
      const escena = crearEscena();
      const shell = crearShell();
      escena.shell = shell;
      escena.timerSpawn = { remove: vi.fn() };
      escena.timerFin = { remove: vi.fn() };

      escena.finalizar();

      expect(escena.terminado).toBe(true);
      expect(shell.reportarTelemetria).toHaveBeenCalledTimes(1);
      expect(shell.solicitarTransicion).toHaveBeenCalledWith('plataformas');
    });

    it('es idempotente: una segunda llamada no vuelve a notificar', () => {
      const escena = crearEscena();
      const shell = crearShell();
      escena.shell = shell;
      escena.timerSpawn = { remove: vi.fn() };
      escena.timerFin = { remove: vi.fn() };

      escena.finalizar();
      escena.finalizar();

      expect(shell.reportarTelemetria).toHaveBeenCalledTimes(1);
      expect(shell.solicitarTransicion).toHaveBeenCalledTimes(1);
    });

    it('degrada con gracia si el Shell no está cableado (no arroja)', () => {
      const escena = crearEscena();
      escena.shell = undefined;
      escena.timerSpawn = { remove: vi.fn() };
      escena.timerFin = { remove: vi.fn() };

      expect(() => escena.finalizar()).not.toThrow();
      expect(escena.terminado).toBe(true);
    });
  });

  // --- Forma de la telemetría y la declaración de rasgos (Requirement 3.7) ---
  describe('construirTelemetria / declararRasgos: forma del contrato (Req 3.7)', () => {
    it('construye la Telemetria_Rasgos con las señales acumuladas', () => {
      const escena = crearEscena();
      escena.objetivosDestruidos = 3;
      escena.totalObjetivos = 7;
      escena.impactos = 4;
      escena.disparos = 9;
      escena.impactosRapidos = 2;

      const telemetria = escena.construirTelemetria();

      expect(telemetria).toEqual({
        escena: 'shooter',
        porRasgo: {
          furia: { senal: 3, oportunidad: 7 },
          logro: { senal: 4, oportunidad: 9 },
          riesgo: { senal: 2, oportunidad: 4 },
          curiosidad: { senal: 0, oportunidad: 0 },
        },
      });
    });

    it('declara topes de oportunidad con curiosidad no medida (0)', () => {
      const escena = crearEscena();
      const decl = escena.declararRasgos();

      expect(decl.oportunidadMaxima.curiosidad).toBe(0);
      expect(decl.oportunidadMaxima.furia).toBeGreaterThan(0);
      expect(decl.oportunidadMaxima.logro).toBeGreaterThan(0);
      expect(decl.oportunidadMaxima.riesgo).toBeGreaterThan(0);
    });
  });
});
