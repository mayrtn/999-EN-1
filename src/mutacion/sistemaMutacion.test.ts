/**
 * Unit tests del Sistema_Mutacion (Task 7.3).
 *
 * Verifican que el orquestador traduce cada Perilla_Mutacion al mecanismo Phaser
 * correcto usando mocks de los colaboradores del ContextoMutacion:
 * - paleta → setTint sobre cada sprite tintable (Requirement 7.1).
 * - intensidad_enemigos → spawner.ajustarIntensidad (Requirement 7.2).
 * - agresividad → spawner.ajustarAgresividad (Requirement 7.3).
 * - clima → start()/stop() del emisor de partículas (Requirement 7.4).
 * - mood_musica → audio.reproducirMood (Requirement 7.5).
 * - mensaje → overlayTexto.mostrar (Requirement 7.6).
 *
 * Son tests de ejemplo (no property tests): mockean Phaser con objetos planos y
 * vi.fn(). También cubren el comportamiento defensivo del orquestador.
 */

import { describe, it, expect, vi } from 'vitest';
import type Phaser from 'phaser';
import type { PerillasMutacion, ContextoMutacion } from '../contrato';
import { SistemaMutacion, TINTES_POR_PALETA } from './sistemaMutacion';

/** Escena falsa: el orquestador no la usa directamente (el ctx trae las refs). */
const escenaFalsa = {} as unknown as Phaser.Scene;

/** Construye unas PerillasMutacion válidas con overrides opcionales. */
function crearPerillas(
  overrides: Partial<PerillasMutacion> = {},
): PerillasMutacion {
  return {
    paleta: 'infierno',
    intensidad_enemigos: 0.5,
    agresividad: 0.25,
    clima: 'lluvia',
    mood_musica: 'furioso',
    mensaje: 'El mundo arde por tu furia',
    ...overrides,
  };
}

/** Sprite mock con setTint espiable. */
function crearSprite() {
  return { setTint: vi.fn() } as unknown as Phaser.GameObjects.Sprite & {
    setTint: ReturnType<typeof vi.fn>;
  };
}

/** Capa de clima mock (ParticleEmitter con start/stop espiables). */
function crearCapaClima() {
  return { start: vi.fn(), stop: vi.fn() } as unknown as Phaser.GameObjects.Particles.ParticleEmitter & {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };
}

/**
 * Construye un ContextoMutacion con mocks. Cada colaborador puede sobrescribirse
 * para probar contextos parciales/defensivos.
 */
function crearContexto(
  overrides: Partial<ContextoMutacion> = {},
): ContextoMutacion {
  return {
    spritesTintables: [crearSprite(), crearSprite()],
    capaClima: crearCapaClima(),
    spawnerEnemigos: {
      ajustarIntensidad: vi.fn(),
      ajustarAgresividad: vi.fn(),
    },
    audio: { reproducirMood: vi.fn() },
    overlayTexto: { mostrar: vi.fn() },
    ...overrides,
  };
}

describe('SistemaMutacion.aplicar', () => {
  // --- Paleta / setTint (Requirement 7.1) ---
  describe('paleta → setTint sobre sprites existentes (Req 7.1)', () => {
    it('invoca setTint con el tinte de la paleta en cada sprite tintable', () => {
      const sistema = new SistemaMutacion();
      const ctx = crearContexto();
      const perillas = crearPerillas({ paleta: 'neon' });

      sistema.aplicar(escenaFalsa, perillas, ctx);

      for (const sprite of ctx.spritesTintables) {
        expect((sprite as any).setTint).toHaveBeenCalledTimes(1);
        expect((sprite as any).setTint).toHaveBeenCalledWith(
          TINTES_POR_PALETA.neon,
        );
      }
    });

    it('usa el color correcto para cada paleta del conjunto cerrado', () => {
      for (const paleta of ['infierno', 'sueno', 'neon', 'hostil'] as const) {
        const sistema = new SistemaMutacion();
        const ctx = crearContexto();
        sistema.aplicar(escenaFalsa, crearPerillas({ paleta }), ctx);

        for (const sprite of ctx.spritesTintables) {
          expect((sprite as any).setTint).toHaveBeenCalledWith(
            TINTES_POR_PALETA[paleta],
          );
        }
      }
    });

    it('no arroja cuando el arreglo de sprites está vacío (defensivo)', () => {
      const sistema = new SistemaMutacion();
      const ctx = crearContexto({ spritesTintables: [] });

      expect(() => sistema.aplicar(escenaFalsa, crearPerillas(), ctx)).not.toThrow();
    });
  });

  // --- Enemigos: intensidad + agresividad (Requirements 7.2, 7.3) ---
  describe('enemigos → spawner (Req 7.2, 7.3)', () => {
    it('ajusta intensidad y agresividad con los valores de las perillas', () => {
      const sistema = new SistemaMutacion();
      const ctx = crearContexto();
      const perillas = crearPerillas({
        intensidad_enemigos: 0.8,
        agresividad: 0.35,
      });

      sistema.aplicar(escenaFalsa, perillas, ctx);

      expect(ctx.spawnerEnemigos!.ajustarIntensidad).toHaveBeenCalledTimes(1);
      expect(ctx.spawnerEnemigos!.ajustarIntensidad).toHaveBeenCalledWith(0.8);
      expect(ctx.spawnerEnemigos!.ajustarAgresividad).toHaveBeenCalledTimes(1);
      expect(ctx.spawnerEnemigos!.ajustarAgresividad).toHaveBeenCalledWith(0.35);
    });

    it('no arroja cuando el contexto no expone spawner (escena sin enemigos)', () => {
      const sistema = new SistemaMutacion();
      const ctx = crearContexto({ spawnerEnemigos: undefined });

      expect(() => sistema.aplicar(escenaFalsa, crearPerillas(), ctx)).not.toThrow();
    });
  });

  // --- Clima / partículas (Requirement 7.4) ---
  describe('clima → emisor de partículas (Req 7.4)', () => {
    it("detiene la emisión (stop) cuando clima === 'ninguno'", () => {
      const sistema = new SistemaMutacion();
      const ctx = crearContexto();
      const perillas = crearPerillas({ clima: 'ninguno' });

      sistema.aplicar(escenaFalsa, perillas, ctx);

      expect((ctx.capaClima as any).stop).toHaveBeenCalledTimes(1);
      expect((ctx.capaClima as any).start).not.toHaveBeenCalled();
    });

    it("arranca la emisión (start) para un clima con partículas", () => {
      for (const clima of ['lluvia', 'brasas', 'niebla'] as const) {
        const sistema = new SistemaMutacion();
        const ctx = crearContexto();
        sistema.aplicar(escenaFalsa, crearPerillas({ clima }), ctx);

        expect((ctx.capaClima as any).start).toHaveBeenCalledTimes(1);
        expect((ctx.capaClima as any).stop).not.toHaveBeenCalled();
      }
    });

    it('no arroja cuando la capa de clima es nula (defensivo)', () => {
      const sistema = new SistemaMutacion();
      const ctx = crearContexto({
        capaClima: null as unknown as ContextoMutacion['capaClima'],
      });

      expect(() => sistema.aplicar(escenaFalsa, crearPerillas(), ctx)).not.toThrow();
    });
  });

  // --- Audio / mood (Requirement 7.5) ---
  describe('mood_musica → gestor de audio (Req 7.5)', () => {
    it('reproduce la pista correspondiente al mood de las perillas', () => {
      const sistema = new SistemaMutacion();
      const ctx = crearContexto();
      const perillas = crearPerillas({ mood_musica: 'epico' });

      sistema.aplicar(escenaFalsa, perillas, ctx);

      expect(ctx.audio.reproducirMood).toHaveBeenCalledTimes(1);
      expect(ctx.audio.reproducirMood).toHaveBeenCalledWith('epico');
    });
  });

  // --- Overlay / mensaje (Requirement 7.6) ---
  describe('mensaje → overlay de texto (Req 7.6)', () => {
    it('despliega el overlay con el mensaje de las perillas', () => {
      const sistema = new SistemaMutacion();
      const ctx = crearContexto();
      const perillas = crearPerillas({ mensaje: 'Curiosidad recompensada' });

      sistema.aplicar(escenaFalsa, perillas, ctx);

      expect(ctx.overlayTexto.mostrar).toHaveBeenCalledTimes(1);
      expect(ctx.overlayTexto.mostrar).toHaveBeenCalledWith(
        'Curiosidad recompensada',
      );
    });
  });

  // --- Integración de todas las perillas en una sola aplicación ---
  it('aplica todas las perillas en una única invocación', () => {
    const sistema = new SistemaMutacion();
    const ctx = crearContexto();
    const perillas = crearPerillas({
      paleta: 'hostil',
      intensidad_enemigos: 1,
      agresividad: 0,
      clima: 'niebla',
      mood_musica: 'tenso',
      mensaje: 'Hola',
    });

    sistema.aplicar(escenaFalsa, perillas, ctx);

    for (const sprite of ctx.spritesTintables) {
      expect((sprite as any).setTint).toHaveBeenCalledWith(TINTES_POR_PALETA.hostil);
    }
    expect(ctx.spawnerEnemigos!.ajustarIntensidad).toHaveBeenCalledWith(1);
    expect(ctx.spawnerEnemigos!.ajustarAgresividad).toHaveBeenCalledWith(0);
    expect((ctx.capaClima as any).start).toHaveBeenCalledTimes(1);
    expect(ctx.audio.reproducirMood).toHaveBeenCalledWith('tenso');
    expect(ctx.overlayTexto.mostrar).toHaveBeenCalledWith('Hola');
  });
});
