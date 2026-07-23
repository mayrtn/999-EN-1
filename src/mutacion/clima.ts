/**
 * Helpers de partículas de clima (Requirement 7.4).
 *
 * Construyen la capa de partículas que representa cada `Clima` sobre una
 * `Phaser.Scene`, reutilizando una textura mínima generada en runtime para no
 * depender de assets de arte (Fase 3): `lluvia` (partículas verticales),
 * `brasas` (partículas cálidas ascendentes), `niebla` (overlay suave de baja
 * alpha) y `ninguno` (sin emisor).
 *
 * Desde Phaser v3.60 `ParticleEmitterManager` fue removido; `scene.add.particles`
 * devuelve directamente un `Phaser.GameObjects.Particles.ParticleEmitter`. Estos
 * helpers usan esa API.
 *
 * @module mutacion/clima
 * @see Requirement 7.4 (aplicar el efecto de partículas y clima según la perilla)
 */

import type Phaser from 'phaser';
import type { Clima } from '../contrato';

/** Key de la textura de partícula 2x2 blanca generada en runtime. */
export const KEY_TEXTURA_PARTICULA = 'mut_particula_1px';

/** Profundidad alta para que la capa de clima quede por encima del mundo. */
const PROFUNDIDAD_CLIMA = 900;

/**
 * Garantiza que exista una pequeña textura blanca reutilizable para partículas.
 *
 * Si la textura {@link KEY_TEXTURA_PARTICULA} no está en la caché, la genera con
 * `Graphics.generateTexture` (2x2 px blanco). Esto permite que el clima funcione
 * sin ningún asset de arte cargado (Requirement 7.4, Fase 3).
 */
export function asegurarTexturaParticula(scene: Phaser.Scene): string {
  if (!scene.textures.exists(KEY_TEXTURA_PARTICULA)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture(KEY_TEXTURA_PARTICULA, 2, 2);
    g.destroy();
  }
  return KEY_TEXTURA_PARTICULA;
}

/**
 * Crea la capa de partículas correspondiente a un `Clima` (Requirement 7.4).
 *
 * - `ninguno`: devuelve `null` (sin emisor).
 * - `lluvia`: partículas finas que caen verticalmente desde arriba.
 * - `brasas`: partículas cálidas (tinte naranja) que ascienden desde abajo.
 * - `niebla`: partículas grandes de baja alpha que derivan lentamente (overlay suave).
 *
 * El emisor se ancla al ancho/alto de la escena y se fija a la cámara
 * (`scrollFactor = 0`) para cubrir la pantalla. La textura se genera en runtime
 * si no existe, de modo que funciona sin assets de arte.
 *
 * @param scene Escena sobre la que crear el emisor.
 * @param clima Clima del conjunto cerrado.
 * @returns El `ParticleEmitter` creado, o `null` para `ninguno`.
 */
export function crearCapaClima(
  scene: Phaser.Scene,
  clima: Clima
): Phaser.GameObjects.Particles.ParticleEmitter | null {
  if (clima === 'ninguno') return null;

  const key = asegurarTexturaParticula(scene);
  const ancho = scene.scale.width;
  const alto = scene.scale.height;

  let config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

  switch (clima) {
    case 'lluvia':
      config = {
        x: { min: 0, max: ancho },
        y: -10,
        lifespan: 1200,
        speedY: { min: 500, max: 700 },
        speedX: { min: -20, max: 20 },
        scaleX: 0.5,
        scaleY: { min: 3, max: 6 },
        quantity: 4,
        frequency: 20,
        alpha: { min: 0.3, max: 0.7 },
        tint: 0x9fd8ff,
      };
      break;

    case 'brasas':
      config = {
        x: { min: 0, max: ancho },
        y: alto + 10,
        lifespan: { min: 1500, max: 2500 },
        speedY: { min: -120, max: -60 },
        speedX: { min: -30, max: 30 },
        scale: { start: 1.5, end: 0 },
        quantity: 2,
        frequency: 60,
        alpha: { min: 0.4, max: 0.9 },
        tint: [0xffcc33, 0xff6600, 0xff3300],
        blendMode: 'ADD',
      };
      break;

    case 'niebla':
    default:
      config = {
        x: { min: 0, max: ancho },
        y: { min: 0, max: alto },
        lifespan: 4000,
        speedX: { min: -15, max: 15 },
        speedY: { min: -5, max: 5 },
        scale: { start: 12, end: 20 },
        quantity: 1,
        frequency: 300,
        alpha: { min: 0.02, max: 0.08 },
        tint: 0xcfcfe0,
      };
      break;
  }

  const emitter = scene.add.particles(0, 0, key, config);
  emitter.setDepth(PROFUNDIDAD_CLIMA);
  emitter.setScrollFactor(0);
  return emitter;
}
