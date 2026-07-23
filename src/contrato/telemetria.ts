/**
 * Contrato_Compartido — Telemetría de Rasgos.
 *
 * Estructura que cada Escena emite al terminar (Requirement 9.1): identidad de
 * la Escena y, por cada Rasgo, su Señal y su Oportunidad. El Shell la entrega al
 * Motor_Scoring para actualizar el Perfil_Jugador (Requirement 8.3).
 *
 * @module contrato/telemetria
 */

import type { EscenaId } from './rasgos';

/**
 * Par Señal/Oportunidad de un Rasgo dentro de una Escena.
 *
 * - `senal`: acciones relevantes realizadas por el jugador (`>= 0`).
 * - `oportunidad`: tope de acciones que la escena ofreció (`>= 0`).
 *
 * El Motor_Scoring calcula `Score_Rasgo = clamp(senal / oportunidad, 0, 1)`
 * cuando `oportunidad > 0` (Requirements 4.3, 4.4).
 */
export interface SenalOportunidad {
  senal: number;
  oportunidad: number;
}

/**
 * Telemetría completa emitida por una Escena al terminar (Requirement 9.1).
 *
 * Incluye la identidad de la Escena y la {@link SenalOportunidad} de cada uno de
 * los cuatro Rasgos. El Shell la reenvía al Motor_Scoring
 * (Requirements 1.8, 2.6, 3.7, 8.3).
 */
export interface TelemetriaRasgos {
  escena: EscenaId;
  porRasgo: {
    furia: SenalOportunidad;
    curiosidad: SenalOportunidad;
    logro: SenalOportunidad;
    riesgo: SenalOportunidad;
  };
}
