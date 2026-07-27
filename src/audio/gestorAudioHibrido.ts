/**
 * GestorAudioHibrido — elige automáticamente entre audio de Phaser (archivos) y
 * música sintetizada con Web Audio API.
 *
 * Si los assets de Phaser (`mus_calma`, `mus_epico`, etc.) están cargados, usa
 * el {@link GestorAudioPhaser} original con crossfade sobre el sound manager de
 * Phaser. Si no hay assets (Fase 1/2), usa el {@link GestorAudioSintetizado}
 * que genera música procedural con osciladores (Requirement 7.5).
 *
 * Este wrapper permite que las escenas siempre tengan música sin importar si se
 * desplegaron los archivos CC0 o no.
 *
 * Además, registra un listener en el evento SHUTDOWN de la escena para detener
 * automáticamente la música al abandonarla, evitando superposiciones entre
 * escenas.
 *
 * @module audio/gestorAudioHibrido
 */

import type Phaser from 'phaser';
import type { GestorAudio } from '../contrato';
import { GestorAudioPhaser, MOOD_A_KEY } from '../mutacion/gestor-audio';
import { GestorAudioSintetizado } from './musicaSintetizada';

/**
 * Crea un {@link GestorAudio} que auto-detecta la presencia de assets de audio
 * de Phaser y elige la estrategia adecuada. Se registra automáticamente para
 * detenerse cuando la escena se apague (SHUTDOWN), evitando que la música de
 * una escena se superponga con la siguiente.
 *
 * @param scene Escena de Phaser cuya caché y sound manager se consultan.
 * @returns Implementación de `GestorAudio` lista para usar.
 */
export function crearGestorAudio(scene: Phaser.Scene): GestorAudio {
  // Verificar si al menos una pista está cargada en la caché de Phaser
  const tieneAssets = Object.values(MOOD_A_KEY).some(
    (key) => scene.cache.audio.exists(key),
  );

  if (tieneAssets) {
    const gestor = new GestorAudioPhaser(scene);
    // Auto-detener al salir de la escena
    scene.events.once('shutdown', () => gestor.detener());
    scene.events.once('destroy', () => gestor.detener());
    return gestor;
  }

  // Sin assets: usar música sintetizada procedural
  const gestor = new GestorAudioSintetizado();
  // Auto-detener al salir de la escena para evitar superposición
  scene.events.once('shutdown', () => gestor.detener());
  scene.events.once('destroy', () => gestor.detener());
  return gestor;
}
