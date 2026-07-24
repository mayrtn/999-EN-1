/**
 * Contrato_Compartido — Rasgos y Perfil del Jugador.
 *
 * Tipos base del acuerdo de interfaces que todos los niveles respetan
 * (Requirement 9). Aquí viven la identidad de las Escenas, los cuatro Rasgos
 * medibles, el Perfil_Jugador acumulado y la declaración de oportunidad por
 * escena que consume el Motor_Scoring.
 *
 * @module contrato/rasgos
 */

/**
 * Identidad lógica de cada Escena jugable del juego.
 *
 * `'carreras'` corresponde a la Escena_Carreras opcional, registrable sin
 * modificar el Shell ni el Motor_Scoring (Requirement 9.7).
 */
export type EscenaId = 'portada' | 'seleccion_personaje' | 'plataformas' | 'ritmo' | 'shooter' | 'carreras';

/**
 * Los cuatro Rasgos que el Motor_Scoring mide y acumula por jugador
 * (Requirement 4). Cada Escena declara cuáles mide vía {@link DeclaracionRasgos}.
 */
export type Rasgo = 'furia' | 'curiosidad' | 'logro' | 'riesgo';

/**
 * Perfil acumulado del jugador durante toda la sesión (Requirements 4.6, 8.6).
 *
 * - `rasgos`: valor acumulado de cada Rasgo en `[0, 1]`. Estado neutro
 *   inicial = 0 con peso acumulado 0 (Requirement 8.1).
 * - `pesoAcumulado`: suma de Peso_Rasgo de las escenas que midieron cada Rasgo;
 *   necesario para el promedio ponderado incremental (Requirement 4.6).
 */
export interface PerfilJugador {
  rasgos: Record<Rasgo, number>;
  pesoAcumulado: Record<Rasgo, number>;
}

/**
 * Declaración que una Escena publica antes de medir (Requirement 4.2).
 *
 * `oportunidadMaxima` fija el tope de Oportunidad que la escena ofrece por
 * Rasgo. Si un Rasgo no se mide, su tope es 0 (Requirement 4.5), lo que hace
 * que el Motor_Scoring lo excluya del cálculo (peso 0, sin división por cero).
 */
export interface DeclaracionRasgos {
  oportunidadMaxima: Record<Rasgo, number>;
}
