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

/** Key de la textura circular difusa para niebla. */
export const KEY_TEXTURA_NIEBLA = 'mut_niebla_blob';

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
 * Genera una textura circular con gradiente radial para simular niebla/nube.
 *
 * Crea un círculo de 64x64 px con alpha que decrece desde el centro hacia el
 * borde (blob suave), dando un aspecto orgánico de nube en vez de cuadrados.
 */
export function asegurarTexturaNiebla(scene: Phaser.Scene): string {
  if (!scene.textures.exists(KEY_TEXTURA_NIEBLA)) {
    const size = 64;
    const half = size / 2;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);

    // Dibujar varios círculos concéntricos con alpha decreciente para simular
    // un gradiente radial suave (Phaser Graphics no soporta gradientes nativos)
    const steps = 12;
    for (let i = steps; i >= 0; i--) {
      const ratio = i / steps;
      const radius = half * ratio;
      const alpha = (1 - ratio) * 0.4;
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(half, half, radius);
    }

    // Centro más denso
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(half, half, half * 0.3);

    g.generateTexture(KEY_TEXTURA_NIEBLA, size, size);
    g.destroy();
  }
  return KEY_TEXTURA_NIEBLA;
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
        lifespan: 1000,
        speedY: { min: 600, max: 900 },
        speedX: { min: -40, max: 40 },
        scaleX: 0.6,
        scaleY: { min: 4, max: 8 },
        quantity: 12,
        frequency: 15,
        alpha: { min: 0.4, max: 0.8 },
        tint: 0x9fd8ff,
      };
      break;

    case 'brasas':
      config = {
        x: { min: 0, max: ancho },
        y: alto + 10,
        lifespan: { min: 1500, max: 3000 },
        speedY: { min: -180, max: -60 },
        speedX: { min: -50, max: 50 },
        scale: { start: 2.5, end: 0 },
        quantity: 5,
        frequency: 30,
        alpha: { min: 0.5, max: 1 },
        tint: [0xffcc33, 0xff6600, 0xff3300, 0xff0000],
        blendMode: 'ADD',
      };
      break;

    case 'niebla':
    default:
      config = {
        x: { min: 0, max: ancho },
        y: { min: 0, max: alto },
        lifespan: 5000,
        speedX: { min: -20, max: 20 },
        speedY: { min: -8, max: 8 },
        scale: { start: 1.5, end: 2.5 },
        quantity: 2,
        frequency: 150,
        alpha: { min: 0.08, max: 0.25 },
        tint: 0xcfcfe0,
      };
      break;
  }

  // Para niebla usar la textura circular difusa; para el resto la de 2x2.
  const texturaFinal = clima === 'niebla' ? asegurarTexturaNiebla(scene) : key;

  const emitter = scene.add.particles(0, 0, texturaFinal, config);
  emitter.setDepth(PROFUNDIDAD_CLIMA);
  emitter.setScrollFactor(0);
  return emitter;
}
