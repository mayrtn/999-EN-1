/**
 * ScoringManager — Medición de Rasgos para la Escena_Carreras.
 *
 * Módulo puro (sin dependencias de Phaser) que acumula señales y oportunidades
 * por cada rasgo de personalidad durante la sesión de carrera.
 *
 * - Furia: embestidas contra rivales.
 * - Curiosidad: rutas alternativas tomadas.
 * - Logro: checkpoints alcanzados + adelantamientos.
 * - Riesgo: pasadas al ras + tiempo a alta velocidad.
 *
 * @module escenas/carreras/ScoringManager
 */

import type { PistaGenerada, EstadoScoring } from './tipos';
import type { TelemetriaRasgos, DeclaracionRasgos } from '../../contrato';

/**
 * Calcula las oportunidades iniciales de riesgo basándose en la duración de la
 * sesión. Se estima como el total de segundos que el jugador podría mantener
 * velocidad alta (toda la sesión) más un buffer de pasadas al ras posibles.
 */
function calcularOportunidadRiesgo(duracionMs: number, totalSegmentos: number): number {
  // Oportunidad de velocidad alta: cada segundo a alta velocidad suma ~1 unidad
  const segundosSesion = duracionMs / 1000;
  // Pasadas al ras potenciales: estimamos ~2 por segmento como tope
  const pasadasPotenciales = totalSegmentos * 2;
  return segundosSesion + pasadasPotenciales;
}

export class ScoringManager {
  private estado: EstadoScoring;

  constructor() {
    this.estado = {
      furia: { senal: 0, oportunidad: 0 },
      curiosidad: { senal: 0, oportunidad: 0 },
      logro: { senal: 0, oportunidad: 0 },
      riesgo: { senal: 0, oportunidad: 0 },
    };
  }

  /**
   * Inicializa el ScoringManager con oportunidades basadas en la pista generada
   * y la duración de la sesión.
   *
   * Oportunidades:
   * - furia: cantidad de rivales potenciales (estimada como segmentos de la pista)
   * - curiosidad: totalBifurcaciones de la pista
   * - logro: totalCheckpoints + rivales potenciales (adelantamientos posibles)
   * - riesgo: tiempo total a velocidad alta posible + pasadas al ras potenciales
   *
   * Requirements: 3.1, 4.1, 5.1, 6.1
   */
  inicializar(pista: PistaGenerada, duracionMs: number): void {
    const rivalesPotenciales = pista.segmentos.length;

    this.estado = {
      furia: { senal: 0, oportunidad: rivalesPotenciales },
      curiosidad: { senal: 0, oportunidad: pista.totalBifurcaciones },
      logro: { senal: 0, oportunidad: pista.totalCheckpoints + rivalesPotenciales },
      riesgo: { senal: 0, oportunidad: calcularOportunidadRiesgo(duracionMs, pista.segmentos.length) },
    };
  }

  /**
   * Registra una embestida contra un rival.
   * Incrementa la señal de Furia en 1.
   *
   * Requirement 3.2
   */
  registrarEmbestida(): void {
    this.estado.furia.senal += 1;
  }

  /**
   * Registra que el jugador tomó una ruta alternativa.
   * Incrementa la señal de Curiosidad en 1.
   *
   * Requirement 4.3
   */
  registrarRutaAlternativa(): void {
    this.estado.curiosidad.senal += 1;
  }

  /**
   * Registra que el jugador alcanzó un checkpoint.
   * Incrementa la señal de Logro en 1.
   *
   * Requirement 5.3
   */
  registrarCheckpoint(): void {
    this.estado.logro.senal += 1;
  }

  /**
   * Registra que el jugador adelantó a un rival.
   * Incrementa la señal de Logro en 1.
   *
   * Requirement 5.4
   */
  registrarAdelantar(): void {
    this.estado.logro.senal += 1;
  }

  /**
   * Registra una pasada al ras (near-miss).
   * Incrementa la señal de Riesgo en 1.
   *
   * Requirement 6.3
   */
  registrarPasadaAlRas(): void {
    this.estado.riesgo.senal += 1;
  }

  /**
   * Acumula señal de riesgo por mantener velocidad alta.
   *
   * Solo acumula cuando `velocidadActual > umbral * velocidadMaxima`.
   * La acumulación es proporcional al deltaMs (en segundos).
   *
   * Requirement 6.2
   *
   * @param deltaMs - Tiempo transcurrido en milisegundos
   * @param velocidadActual - Velocidad instantánea del vehículo
   * @param velocidadMaxima - Velocidad máxima posible
   * @param umbral - Fracción de velocidadMaxima que define "alta velocidad" (ej: 0.8)
   */
  acumularVelocidadAlta(
    deltaMs: number,
    velocidadActual: number,
    velocidadMaxima: number,
    umbral: number,
  ): void {
    if (velocidadActual > umbral * velocidadMaxima) {
      // Acumula proporcionalmente al tiempo en ese estado (1 unidad por segundo)
      this.estado.riesgo.senal += deltaMs / 1000;
    }
  }

  /**
   * Retorna una copia de solo lectura del estado actual de scoring.
   */
  obtenerEstado(): Readonly<EstadoScoring> {
    return this.estado;
  }

  /**
   * Construye la TelemetriaRasgos al finalizar la sesión.
   *
   * Retorna un objeto con `escena: 'carreras'` y los pares señal/oportunidad
   * de cada rasgo, reflejando exactamente el estado acumulado.
   *
   * Requirements: 3.3, 4.4, 5.5, 6.4, 7.4
   */
  construirTelemetria(): TelemetriaRasgos {
    return {
      escena: 'carreras',
      porRasgo: {
        furia: { senal: this.estado.furia.senal, oportunidad: this.estado.furia.oportunidad },
        curiosidad: { senal: this.estado.curiosidad.senal, oportunidad: this.estado.curiosidad.oportunidad },
        logro: { senal: this.estado.logro.senal, oportunidad: this.estado.logro.oportunidad },
        riesgo: { senal: this.estado.riesgo.senal, oportunidad: this.estado.riesgo.oportunidad },
      },
    };
  }

  /**
   * Declara las oportunidades máximas por rasgo que la escena ofrece.
   *
   * Todas las oportunidades deben ser > 0 después de inicializar con una pista
   * válida (que siempre tiene segmentos, checkpoints y bifurcaciones).
   *
   * Requirements: 3.1, 4.1, 5.1, 6.1
   */
  declararRasgos(): DeclaracionRasgos {
    return {
      oportunidadMaxima: {
        furia: this.estado.furia.oportunidad,
        curiosidad: this.estado.curiosidad.oportunidad,
        logro: this.estado.logro.oportunidad,
        riesgo: this.estado.riesgo.oportunidad,
      },
    };
  }
}
