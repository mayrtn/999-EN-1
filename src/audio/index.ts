/**
 * Módulo audio — barrel de re-exportación.
 *
 * Centraliza las exportaciones de SFX sintetizados y música procedural.
 *
 * @module audio
 */

export {
  sfxCoin,
  sfxCrystal,
  sfxJump,
  sfxPortal,
  sfxHit,
  sfxShoot,
  sfxRhythmHit,
  sfxRhythmMiss,
} from './sfx';

export { GestorAudioSintetizado } from './musicaSintetizada';
export { crearGestorAudio } from './gestorAudioHibrido';
