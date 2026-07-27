/**
 * Unit tests de Nivel_Ritmo (Task 9.4).
 *
 * Verifican el contrato/lógica de la escena de ritmo SIN arrancar un mundo
 * Phaser real:
 * - Acotado de duración a `[30000, 50000]` ms (Requirement 2.1, contexto).
 * - Acierto dentro de la ventana de acierto (Requirement 2.2).
 * - Fallo fuera de la ventana de todo beat (Requirement 2.3).
 * - Fin por duración: emite telemetría y solicita retorno una sola vez
 *   (Requirement 2.4).
 * - Forma de la Telemetria_Rasgos emitida (Requirement 2.6).
 *
 * Son tests de ejemplo (no property tests). Phaser se sustituye por un mock
 * mínimo: sólo `Scene` (clase base) y `Math.Clamp`, que es lo único que la
 * clase toca en construcción. Los métodos ejercitados (procesarPulsacion,
 * finalizar, declararRasgos, construirTelemetria, update) no requieren el
 * runtime real de Phaser.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock mínimo de Phaser (evita bootear canvas/DOM en entorno node) ---
vi.mock('phaser', () => {
  class Scene {
    constructor(_config?: unknown) {
      // no-op: no arrancamos ciclo de vida de Phaser en los tests.
    }
  }
  const Clamp = (valor: number, min: number, max: number): number =>
    globalThis.Math.min(globalThis.Math.max(valor, min), max);
  return { default: { Scene, Math: { Clamp }, BlendModes: { ADD: 1 } } };
});

import { NivelRitmo } from './NivelRitmo';

/** Constantes replicadas del módulo bajo prueba para expectativas explícitas. */
const VENTANA_ACIERTO_MS = 150;
const UMBRAL_AJUSTADO_MS = 90;
const CURIOSIDAD_MAX = 3;
const DURACION_MIN_MS = 30000;
const DURACION_MAX_MS = 50000;
const DURACION_DEFECTO_MS = 40000;

/** Beat falso: sólo el sprite con `setVisible` espiable, como usa la escena. */
function crearBeatFalso(tiempoObjetivo: number) {
  return {
    sprite: { setVisible: vi.fn(), x: 400, y: 300 },
    tiempoObjetivo,
    juzgada: false,
  };
}

/** Shell mock con los tres métodos del IShell que la escena puede tocar. */
function crearShellMock() {
  return {
    reportarTelemetria: vi.fn(),
    solicitarTransicion: vi.fn(),
    obtenerPerfil: vi.fn(),
  };
}

/** Stub de los colaboradores de Phaser que usan los efectos visuales. */
function stubVisuales(i: EscenaInterna): void {
  const chainable = () => ({
    setDepth: vi.fn().mockReturnThis(),
    setBlendMode: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    destroy: vi.fn(),
    explode: vi.fn(),
  });
  i.add = {
    particles: vi.fn(() => chainable()),
    rectangle: vi.fn(() => chainable()),
    circle: vi.fn(() => chainable()),
  };
  i.tweens = { add: vi.fn() };
  i.time = { delayedCall: vi.fn(), now: 0 };
  i.scale = { width: 800, height: 600 };
  i.laneX = 400;
  i.hitLineY = 500;
}

/** Acceso tipado laxo a los internos privados de la escena. */
type EscenaInterna = {
  duracionMs: number;
  totalBeats: number;
  beats: Array<ReturnType<typeof crearBeatFalso>>;
  aciertos: number;
  fallos: number;
  riesgoSenal: number;
  curiosidadSenal: number;
  tiempoInicio: number;
  finalizado: boolean;
  esperandoInicio: boolean;
  shell: unknown;
  hud: unknown;
  add: unknown;
  tweens: unknown;
  time: unknown;
  scale: unknown;
  laneX: number;
  hitLineY: number;
  procesarPulsacion(transcurrido: number): void;
  finalizar(): void;
};

/** Castea la escena a su forma interna para inspección/estimulación directa. */
function interna(escena: NivelRitmo): EscenaInterna {
  return escena as unknown as EscenaInterna;
}

describe('NivelRitmo', () => {
  describe('acotado de duración (Requirement 2.1)', () => {
    it('acota por debajo un valor menor al mínimo (10000 → 30000)', () => {
      const escena = new NivelRitmo(10000);
      expect(interna(escena).duracionMs).toBe(DURACION_MIN_MS);
    });

    it('acota por arriba un valor mayor al máximo (120000 → 50000)', () => {
      const escena = new NivelRitmo(120000);
      expect(interna(escena).duracionMs).toBe(DURACION_MAX_MS);
    });

    it('preserva un valor dentro del rango válido', () => {
      const escena = new NivelRitmo(40000);
      expect(interna(escena).duracionMs).toBe(40000);
    });

    it('usa la duración por defecto en rango cuando no se pasa argumento', () => {
      const escena = new NivelRitmo();
      expect(interna(escena).duracionMs).toBe(DURACION_DEFECTO_MS);
    });
  });

  describe('declararRasgos (oportunidad máxima por rasgo)', () => {
    it('declara furia 0, curiosidad CURIOSIDAD_MAX y logro/riesgo = totalBeats', () => {
      const escena = new NivelRitmo();
      const totalBeats = interna(escena).totalBeats;
      expect(totalBeats).toBeGreaterThan(0);

      const decl = escena.declararRasgos();
      expect(decl.oportunidadMaxima).toEqual({
        furia: 0,
        curiosidad: CURIOSIDAD_MAX,
        logro: totalBeats,
        riesgo: totalBeats,
      });
    });
  });

  describe('construirTelemetria (Requirement 2.6)', () => {
    it('emite la forma esperada reflejando las señales medidas', () => {
      const escena = new NivelRitmo();
      const i = interna(escena);
      i.aciertos = 5;
      i.fallos = 2; // no aparece en telemetría, pero refleja estado real
      i.riesgoSenal = 3;
      i.curiosidadSenal = 1;
      const totalBeats = i.totalBeats;

      expect(escena.construirTelemetria()).toEqual({
        escena: 'ritmo',
        porRasgo: {
          furia: { senal: 0, oportunidad: 0 },
          curiosidad: { senal: 1, oportunidad: CURIOSIDAD_MAX },
          logro: { senal: 5, oportunidad: totalBeats },
          riesgo: { senal: 3, oportunidad: totalBeats },
        },
      });
    });

    it('parte de señales en cero para una escena recién construida', () => {
      const escena = new NivelRitmo();
      const tele = escena.construirTelemetria();
      expect(tele.porRasgo.logro.senal).toBe(0);
      expect(tele.porRasgo.riesgo.senal).toBe(0);
      expect(tele.porRasgo.curiosidad.senal).toBe(0);
    });
  });

  describe('procesarPulsacion — acierto dentro de ventana (Requirement 2.2)', () => {
    it('registra ACIERTO y marca el beat como juzgado cuando cae en ventana', () => {
      const escena = new NivelRitmo();
      const i = interna(escena);
      stubVisuales(i);
      const beat = crearBeatFalso(3000);
      i.beats = [beat];

      // 3050 vs 3000 ⇒ desfase 50 ms (≤ 150 ventana, ≤ 90 no arriesgado)
      i.procesarPulsacion(3050);

      expect(i.aciertos).toBe(1);
      expect(i.fallos).toBe(0);
      expect(beat.juzgada).toBe(true);
      expect(beat.sprite.setVisible).toHaveBeenCalledWith(false);
      expect(i.riesgoSenal).toBe(0);
    });

    it('un acierto con timing ajustado (>90 ms) suma a Riesgo', () => {
      const escena = new NivelRitmo();
      const i = interna(escena);
      stubVisuales(i);
      const beat = crearBeatFalso(3000);
      i.beats = [beat];

      // 3120 vs 3000 ⇒ desfase 120 ms (≤ 150 ventana pero > 90 ⇒ arriesgado)
      i.procesarPulsacion(3120);

      expect(i.aciertos).toBe(1);
      expect(i.riesgoSenal).toBe(1);
      expect(120).toBeGreaterThan(UMBRAL_AJUSTADO_MS);
      expect(120).toBeLessThanOrEqual(VENTANA_ACIERTO_MS);
    });

    it('elige el beat más cercano cuando hay varios en ventana', () => {
      const escena = new NivelRitmo();
      const i = interna(escena);
      stubVisuales(i);
      const cercano = crearBeatFalso(3000);
      const lejano = crearBeatFalso(3140);
      i.beats = [lejano, cercano];

      i.procesarPulsacion(3020); // más cerca de 3000 (20) que de 3140 (120)

      expect(cercano.juzgada).toBe(true);
      expect(lejano.juzgada).toBe(false);
      expect(i.aciertos).toBe(1);
    });
  });

  describe('procesarPulsacion — fallo fuera de ventana (Requirement 2.3)', () => {
    it('registra FALLO cuando no hay beat en ventana', () => {
      const escena = new NivelRitmo();
      const i = interna(escena);
      stubVisuales(i);
      const beat = crearBeatFalso(3000);
      i.beats = [beat];

      // 100 vs 3000 ⇒ desfase 2900 ms, muy fuera de la ventana
      i.procesarPulsacion(100);

      expect(i.fallos).toBe(1);
      expect(i.aciertos).toBe(0);
      expect(beat.juzgada).toBe(false);
      expect(beat.sprite.setVisible).not.toHaveBeenCalled();
    });

    it('registra FALLO justo fuera del borde de la ventana (151 ms)', () => {
      const escena = new NivelRitmo();
      const i = interna(escena);
      stubVisuales(i);
      i.beats = [crearBeatFalso(3000)];

      i.procesarPulsacion(3000 + VENTANA_ACIERTO_MS + 1);

      expect(i.fallos).toBe(1);
      expect(i.aciertos).toBe(0);
    });

    it('ignora beats ya juzgados y registra FALLO', () => {
      const escena = new NivelRitmo();
      const i = interna(escena);
      stubVisuales(i);
      const beat = crearBeatFalso(3000);
      beat.juzgada = true;
      i.beats = [beat];

      i.procesarPulsacion(3000); // en tiempo, pero el beat ya fue juzgado

      expect(i.aciertos).toBe(0);
      expect(i.fallos).toBe(1);
    });
  });

  describe('fin por duración (Requirement 2.4)', () => {
    let shell: ReturnType<typeof crearShellMock>;
    let escena: NivelRitmo;
    let i: EscenaInterna;

    beforeEach(() => {
      shell = crearShellMock();
      escena = new NivelRitmo(); // 75000 ms
      i = interna(escena);
      i.shell = shell;
      i.beats = [];
      i.hud = null;
      i.tiempoInicio = 1000;
      i.esperandoInicio = false;
    });

    it('al agotarse la duración emite telemetría y solicita retorno a plataformas', () => {
      // transcurrido = 76000 - 1000 = 75000 ≥ duracionMs
      escena.update(1000 + DURACION_DEFECTO_MS);

      expect(i.finalizado).toBe(true);
      expect(shell.reportarTelemetria).toHaveBeenCalledTimes(1);
      expect(shell.reportarTelemetria).toHaveBeenCalledWith(
        escena.construirTelemetria(),
      );
      expect(shell.solicitarTransicion).toHaveBeenCalledTimes(1);
      expect(shell.solicitarTransicion).toHaveBeenCalledWith('plataformas');
    });

    it('no finaliza antes de agotarse la duración', () => {
      escena.update(1000 + DURACION_DEFECTO_MS - 1);

      expect(i.finalizado).toBe(false);
      expect(shell.reportarTelemetria).not.toHaveBeenCalled();
      expect(shell.solicitarTransicion).not.toHaveBeenCalled();
    });

    it('finaliza una sola vez aunque update se llame de nuevo', () => {
      escena.update(1000 + DURACION_DEFECTO_MS);
      escena.update(1000 + DURACION_DEFECTO_MS + 5000);

      expect(shell.reportarTelemetria).toHaveBeenCalledTimes(1);
      expect(shell.solicitarTransicion).toHaveBeenCalledTimes(1);
    });

    it('finalizar() directo también es idempotente', () => {
      i.finalizar();
      i.finalizar();

      expect(shell.reportarTelemetria).toHaveBeenCalledTimes(1);
      expect(shell.solicitarTransicion).toHaveBeenCalledTimes(1);
    });
  });
});
