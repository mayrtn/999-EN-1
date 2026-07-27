/**
 * Interfaces y tipos del dominio para la Escena_Carreras.
 *
 * Define las estructuras de datos que modelan la pista, el estado de sesión,
 * los rivales/obstáculos, el scoring y la configuración de generación procedural.
 *
 * @module escenas/carreras/tipos
 */

// ─── Pista ───────────────────────────────────────────────────────────────────

/** Segmento individual de la pista generada proceduralmente. */
export interface SegmentoPista {
  /** Tipo de curvatura del segmento. */
  tipo: 'recta' | 'curva_izq' | 'curva_der';
  /** Longitud del segmento en unidades de pista. */
  longitud: number;
  /** Indica si hay una Ruta_Alternativa disponible en este segmento. */
  bifurcacion: boolean;
  /** Indica si este segmento contiene un Checkpoint. */
  tieneCheckpoint: boolean;
}

/** Resultado completo de la generación procedural de pista. */
export interface PistaGenerada {
  /** Secuencia ordenada de segmentos que componen la pista. */
  segmentos: SegmentoPista[];
  /** Cantidad total de checkpoints distribuidos en la pista. */
  totalCheckpoints: number;
  /** Cantidad total de bifurcaciones (Rutas_Alternativas) en la pista. */
  totalBifurcaciones: number;
  /** Semilla usada para la generación (garantiza reproducibilidad). */
  semilla: number;
}

// ─── Estado de Sesión ────────────────────────────────────────────────────────

/** Estado completo de la sesión de carrera en un instante dado. */
export interface EstadoSesion {
  /** Milisegundos restantes del Temporizador_Sesion. */
  tiempoRestanteMs: number;
  /** Velocidad instantánea del Vehiculo_Jugador. */
  velocidadActual: number;
  /** Carril actual del vehículo (rango [-2..2] para 5 carriles). */
  posicionLateral: number;
  /** Distancia total recorrida durante la sesión. */
  distanciaRecorrida: number;
  /** Índice del segmento de pista en el que se encuentra el jugador. */
  segmentoActual: number;
  /** Indica si el jugador está transitando una Ruta_Alternativa. */
  enRutaAlternativa: boolean;
  /** Indica si el boost temporal está activo. */
  boostActivo: boolean;
  /** Milisegundos restantes de cooldown antes de poder activar boost nuevamente. */
  boostCooldownMs: number;
}

// ─── Rivales y Obstáculos ────────────────────────────────────────────────────

/** Vehículo rival controlado por IA que circula por la pista. */
export interface Rival {
  /** Identificador único del rival dentro de la sesión. */
  id: number;
  /** Carril en el que se encuentra el rival. */
  carril: number;
  /** Posición Z relativa al jugador (distancia en la pista). */
  distancia: number;
  /** Velocidad actual del rival. */
  velocidad: number;
  /** Indica si el rival está activo (visible y colisionable). */
  activo: boolean;
}

/** Elemento estático o lento en la pista que el jugador debe esquivar. */
export interface Obstaculo {
  /** Identificador único del obstáculo dentro de la sesión. */
  id: number;
  /** Carril en el que se encuentra el obstáculo. */
  carril: number;
  /** Posición Z relativa al jugador (distancia en la pista). */
  distancia: number;
  /** Tipo de obstáculo: estático (inmóvil) o lento (se mueve despacio). */
  tipo: 'estatico' | 'lento';
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/** Evento discreto que el gameplay registra para la medición de rasgos. */
export type EventoScoring =
  | { tipo: 'embestida'; rivalId: number }
  | { tipo: 'ruta_alternativa'; indice: number }
  | { tipo: 'checkpoint'; indice: number }
  | { tipo: 'adelantar'; rivalId: number }
  | { tipo: 'pasada_al_ras'; objetoId: number }
  | { tipo: 'velocidad_alta'; deltaMs: number };

/** Estado acumulado de señales y oportunidades por cada rasgo de personalidad. */
export interface EstadoScoring {
  furia: { senal: number; oportunidad: number };
  curiosidad: { senal: number; oportunidad: number };
  logro: { senal: number; oportunidad: number };
  riesgo: { senal: number; oportunidad: number };
}

// ─── Configuración de Pista ──────────────────────────────────────────────────

/** Configuración completa de una pista generada, incluyendo parámetros de spawning. */
export interface ConfigPista {
  /** Secuencia de segmentos que componen la pista. */
  segmentos: SegmentoPista[];
  /** Semilla determinística usada para la generación. */
  semilla: number;
  /** Cantidad total de checkpoints en la pista. */
  totalCheckpoints: number;
  /** Cantidad de Rutas_Alternativas (garantizado >= 3). */
  rutasAlternativas: number;
  /** Cantidad base de rivales antes de aplicar intensidad_enemigos. */
  rivalesBase: number;
}
