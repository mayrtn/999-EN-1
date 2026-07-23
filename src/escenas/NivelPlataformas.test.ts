/**
 * Unit tests de Nivel_Plataformas (Task 9.2).
 *
 * Verifican el contrato observable de la escena sin arrancar un mundo Phaser
 * real: recolección de moneda (Requirement 1.4), consecuencia de daño por
 * enemigo y pisotón (Requirement 1.5), activación de accesos ocultos con
 * solicitud de transición al Shell (Requirement 1.7) y la forma de la telemetría
 * emitida (Requirement 1.8), además de la declaración de rasgos.
 *
 * Estrategia: `NivelPlataformas` extiende `Phaser.Scene` e importa `phaser` como
 * valor. El entorno de test es `node` (sin DOM), así que se mockea el módulo
 * `phaser` con una `Scene` base mínima. Los handlers de gameplay son privados
 * pero se ejercitan casteando la instancia a `any` (los `private` de TS no son
 * privados en runtime), inyectando dependencias mínimas (Shell mock, jugador y
 * reloj falsos) y sprites planos con `vi.fn()`.
 *
 * Son tests de ejemplo (no property tests): sin fast-check.
 */

import { describe, it, expect, vi } from 'vitest';
import type { IShell } from '../contrato';

// --- Mock del módulo phaser --------------------------------------------------
// Sólo se necesita la clase base `Scene` (constructor no-op) y los helpers de
// `Math` que la escena referencia dentro de métodos no ejercitados aquí.
vi.mock('phaser', () => {
  class Scene {
    constructor(_config?: unknown) {}
  }
  const PhaserMock = {
    Scene,
    Math: {
      Clamp: (v: number, min: number, max: number) =>
        Math.min(Math.max(v, min), max),
      Distance: {
        Between: (x1: number, y1: number, x2: number, y2: number) =>
          Math.hypot(x2 - x1, y2 - y1),
      },
    },
  };
  return { default: PhaserMock };
});

// La importación debe ir después del vi.mock (hoisted por Vitest de todas formas).
import { NivelPlataformas } from './NivelPlataformas';

/** Cantidades del layout fijo del nivel (deben coincidir con NivelPlataformas.ts). */
const OPORTUNIDAD = {
  furia: 4, // ENEMIGOS.length
  logro: 8, // MONEDAS.length
  curiosidad: 5, // ACCESOS.length (2) + PUNTOS_EXPLORACION.length (3)
  riesgo: 6, // MAX_RIESGO
} as const;

/** Crea un Shell mock con los tres métodos del contrato espiables. */
function crearShellMock(): IShell & {
  solicitarTransicion: ReturnType<typeof vi.fn>;
  reportarTelemetria: ReturnType<typeof vi.fn>;
  obtenerPerfil: ReturnType<typeof vi.fn>;
} {
  return {
    solicitarTransicion: vi.fn(),
    reportarTelemetria: vi.fn(),
    obtenerPerfil: vi.fn(),
  } as never;
}

/** Jugador falso con el cuerpo y los setters de física que tocan los handlers. */
function crearJugadorFalso() {
  return {
    x: 100,
    body: {
      velocity: { x: 0, y: 0 },
      bottom: 0,
      blocked: { down: false },
    },
    setVelocity: vi.fn(),
    setVelocityX: vi.fn(),
    setVelocityY: vi.fn(),
    setAlpha: vi.fn(),
    setPosition: vi.fn(),
  };
}

/** Reloj falso que cubre `this.time.now` y `this.time.delayedCall`. */
function crearRelojFalso() {
  return { now: 0, delayedCall: vi.fn() };
}

/** Sprite de moneda/enemigo plano con `active` y `disableBody` espiables. */
function crearSpriteFalso(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    disableBody: vi.fn(),
    ...overrides,
  };
}

/**
 * Vista laxa de la escena para ejercitar sus miembros privados desde los tests.
 * Los `private` de TS no existen en runtime; esta interfaz expone los campos y
 * handlers que los tests tocan sin recurrir a `unknown` (que rompería tsc).
 */
interface EscenaExpuesta {
  recolectarMoneda(moneda: unknown): void;
  tocarEnemigo(enemigo: unknown): void;
  activarAcceso(acceso: unknown): void;
  senalLogro: number;
  senalFuria: number;
  senalCuriosidad: number;
  senalRiesgo: number;
  vidas: number;
  invulnerableHasta: number;
  jugador: unknown;
  time: unknown;
  enemigos: unknown[];
}

/**
 * Construye una escena lista para ejercitar handlers: inyecta jugador y reloj
 * falsos. Devuelve también esas referencias para las aserciones.
 */
function prepararEscena() {
  const escena = new NivelPlataformas();
  const jugador = crearJugadorFalso();
  const time = crearRelojFalso();
  const any = escena as unknown as EscenaExpuesta;
  any.jugador = jugador;
  any.time = time;
  return { escena, any, jugador, time };
}

describe('NivelPlataformas', () => {
  describe('declararRasgos() — topes de oportunidad (Req 4.2)', () => {
    it('declara los cuatro rasgos con los topes del layout del nivel', () => {
      const escena = new NivelPlataformas();

      const decl = escena.declararRasgos();

      expect(decl).toEqual({
        oportunidadMaxima: {
          furia: OPORTUNIDAD.furia,
          curiosidad: OPORTUNIDAD.curiosidad,
          logro: OPORTUNIDAD.logro,
          riesgo: OPORTUNIDAD.riesgo,
        },
      });
    });
  });

  describe('construirTelemetria() — forma de la telemetría (Req 1.8, 9.1)', () => {
    it('emite escena="plataformas" y un par senal/oportunidad por rasgo', () => {
      const escena = new NivelPlataformas();

      const tele = escena.construirTelemetria();

      expect(tele.escena).toBe('plataformas');
      expect(Object.keys(tele.porRasgo).sort()).toEqual(
        ['curiosidad', 'furia', 'logro', 'riesgo'].sort(),
      );
      for (const rasgo of ['furia', 'curiosidad', 'logro', 'riesgo'] as const) {
        expect(tele.porRasgo[rasgo]).toHaveProperty('senal');
        expect(tele.porRasgo[rasgo]).toHaveProperty('oportunidad');
      }
    });

    it('refleja las señales acumuladas y las oportunidades del nivel', () => {
      const { escena, any } = prepararEscena();
      any.senalFuria = 1;
      any.senalCuriosidad = 2;
      any.senalLogro = 3;
      any.senalRiesgo = 4;

      const tele = escena.construirTelemetria();

      expect(tele.porRasgo.furia).toEqual({
        senal: 1,
        oportunidad: OPORTUNIDAD.furia,
      });
      expect(tele.porRasgo.curiosidad).toEqual({
        senal: 2,
        oportunidad: OPORTUNIDAD.curiosidad,
      });
      expect(tele.porRasgo.logro).toEqual({
        senal: 3,
        oportunidad: OPORTUNIDAD.logro,
      });
      expect(tele.porRasgo.riesgo).toEqual({
        senal: 4,
        oportunidad: OPORTUNIDAD.riesgo,
      });
    });
  });

  describe('recolectarMoneda() — recolección de moneda (Req 1.4)', () => {
    it('desactiva la moneda y suma 1 al rasgo logro', () => {
      const { any } = prepararEscena();
      const moneda = crearSpriteFalso();

      any.recolectarMoneda(moneda);

      expect(moneda.disableBody).toHaveBeenCalledTimes(1);
      expect(moneda.disableBody).toHaveBeenCalledWith(true, true);
      expect(any.senalLogro).toBe(1);
    });

    it('no cuenta una moneda ya inactiva (recolección idempotente)', () => {
      const { any } = prepararEscena();
      const moneda = crearSpriteFalso({ active: false });

      any.recolectarMoneda(moneda);

      expect(moneda.disableBody).not.toHaveBeenCalled();
      expect(any.senalLogro).toBe(0);
    });

    it('acota la señal de logro a la oportunidad máxima del nivel', () => {
      const { any } = prepararEscena();
      any.senalLogro = OPORTUNIDAD.logro; // ya en el tope

      any.recolectarMoneda(crearSpriteFalso());

      expect(any.senalLogro).toBe(OPORTUNIDAD.logro);
    });
  });

  describe('tocarEnemigo() — daño y pisotón (Req 1.5)', () => {
    it('contacto lateral: pierde una vida, aplica retroceso e invulnerabilidad', () => {
      const { any, jugador, time } = prepararEscena();
      time.now = 1000;
      jugador.body.velocity.y = 0; // no cae sobre el enemigo → recibe daño
      const enemigo = crearSpriteFalso({
        x: 200,
        body: { top: 480, height: 28 },
      });

      any.tocarEnemigo(enemigo);

      expect(any.vidas).toBe(2); // 3 → 2
      expect(any.invulnerableHasta).toBeGreaterThan(time.now);
      expect(jugador.setVelocity).toHaveBeenCalledTimes(1);
      expect(jugador.setAlpha).toHaveBeenCalledWith(0.5);
      expect(time.delayedCall).toHaveBeenCalledTimes(1);
    });

    it('ignora el daño mientras el jugador es invulnerable', () => {
      const { any, jugador, time } = prepararEscena();
      time.now = 500;
      any.invulnerableHasta = 2000; // aún invulnerable
      jugador.body.velocity.y = 0;
      const enemigo = crearSpriteFalso({
        x: 200,
        body: { top: 480, height: 28 },
      });

      any.tocarEnemigo(enemigo);

      expect(any.vidas).toBe(3); // sin cambios
      expect(jugador.setVelocity).not.toHaveBeenCalled();
    });

    it('pisotón: derrota al enemigo, rebota y suma al rasgo furia', () => {
      const { any, jugador } = prepararEscena();
      jugador.body.velocity.y = 120; // cayendo
      jugador.body.bottom = 0; // por encima del enemigo
      const enemigo = crearSpriteFalso({
        x: 200,
        body: { top: 480, height: 28 },
      });
      any.enemigos = [enemigo];

      any.tocarEnemigo(enemigo);

      expect(enemigo.disableBody).toHaveBeenCalledWith(true, true);
      expect(any.senalFuria).toBe(1);
      expect(jugador.setVelocityY).toHaveBeenCalledWith(-320); // REBOTE_PISOTON
      expect(any.enemigos).not.toContain(enemigo);
    });
  });

  describe('activarAcceso() — acceso oculto → transición (Req 1.6, 1.7)', () => {
    it('suma a curiosidad y solicita la transición al destino vía el Shell', () => {
      const { escena, any } = prepararEscena();
      const shell = crearShellMock();
      escena.init({ shell } as never);
      // init reinicia jugador/time no; los handlers de acceso no los usan.
      const acceso = {
        objeto: { setFillStyle: vi.fn() },
        destino: 'ritmo',
        activado: false,
      };

      any.activarAcceso(acceso);

      expect(acceso.activado).toBe(true);
      expect(any.senalCuriosidad).toBe(1);
      expect(acceso.objeto.setFillStyle).toHaveBeenCalledTimes(1);
      expect(shell.reportarTelemetria).toHaveBeenCalledTimes(1);
      expect(shell.solicitarTransicion).toHaveBeenCalledTimes(1);
      expect(shell.solicitarTransicion).toHaveBeenCalledWith('ritmo');
    });

    it('reporta la telemetría de la escena de plataformas al Shell', () => {
      const { escena, any } = prepararEscena();
      const shell = crearShellMock();
      escena.init({ shell } as never);

      any.activarAcceso({
        objeto: { setFillStyle: vi.fn() },
        destino: 'shooter',
        activado: false,
      });

      const primeraLlamada = shell.reportarTelemetria.mock.calls[0]!;
      const telemetria = primeraLlamada[0];
      expect(telemetria.escena).toBe('plataformas');
      // La señal de curiosidad ya viene incrementada al reportar.
      expect(telemetria.porRasgo.curiosidad.senal).toBe(1);
      expect(shell.solicitarTransicion).toHaveBeenCalledWith('shooter');
    });

    it('un acceso ya activado no vuelve a solicitar transición (una sola vez)', () => {
      const { escena, any } = prepararEscena();
      const shell = crearShellMock();
      escena.init({ shell } as never);
      const acceso = {
        objeto: { setFillStyle: vi.fn() },
        destino: 'ritmo',
        activado: false,
      };

      any.activarAcceso(acceso);
      any.activarAcceso(acceso); // segunda vez: no-op

      expect(shell.solicitarTransicion).toHaveBeenCalledTimes(1);
      expect(shell.reportarTelemetria).toHaveBeenCalledTimes(1);
      expect(any.senalCuriosidad).toBe(1);
    });

    it('sin Shell inyectado no arroja al activar un acceso (modo autónomo)', () => {
      const { any } = prepararEscena();
      const acceso = {
        objeto: { setFillStyle: vi.fn() },
        destino: 'ritmo',
        activado: false,
      };

      expect(() => any.activarAcceso(acceso)).not.toThrow();
      expect(any.senalCuriosidad).toBe(1);
    });
  });
});
