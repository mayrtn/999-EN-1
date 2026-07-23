/**
 * Contrato_Compartido — Perillas_Mutacion (conjunto cerrado).
 *
 * Define las Perillas_Mutacion como un conjunto cerrado de valores y rangos
 * (Requirement 9.2). Este es el contrato que el Servicio_IA debe respetar y que
 * el Shell valida estrictamente antes de aplicar (Requirements 5.3, 5.4).
 *
 * @module contrato/perillas
 */

/** Paleta de color aplicable vía tinte de sprites (Requirement 7.1). */
export type Paleta = 'infierno' | 'sueno' | 'neon' | 'hostil';

/** Efecto climático de partículas sobre la escena (Requirement 7.4). */
export type Clima = 'ninguno' | 'lluvia' | 'brasas' | 'niebla';

/** Mood musical que selecciona la pista de audio (Requirement 7.5). */
export type MoodMusica = 'calma' | 'epico' | 'tenso' | 'furioso';

/**
 * Perillas_Mutacion: el conjunto cerrado de parámetros que transforman la
 * siguiente Escena (Requirement 9.2).
 *
 * - `paleta` / `clima` / `mood_musica`: valores de sus respectivos enums.
 * - `intensidad_enemigos`: densidad de spawn en `[0, 1]` inclusive.
 * - `agresividad`: agresividad de la IA de enemigos en `[0, 1]` inclusive.
 * - `mensaje`: texto corto (se recorta a {@link MAX_MENSAJE} caracteres).
 */
export interface PerillasMutacion {
  paleta: Paleta;
  intensidad_enemigos: number;
  agresividad: number;
  clima: Clima;
  mood_musica: MoodMusica;
  mensaje: string;
}

/** Conjunto cerrado de paletas válidas (Requirement 9.2). */
export const PALETAS = ['infierno', 'sueno', 'neon', 'hostil'] as const;

/** Conjunto cerrado de climas válidos (Requirement 9.2). */
export const CLIMAS = ['ninguno', 'lluvia', 'brasas', 'niebla'] as const;

/** Conjunto cerrado de moods musicales válidos (Requirement 9.2). */
export const MOODS = ['calma', 'epico', 'tenso', 'furioso'] as const;

/** Longitud máxima permitida para `mensaje`; el Shell lo recorta defensivamente. */
export const MAX_MENSAJE = 80;
