/**
 * SpawnerRivalesCarreras — Spawner de rivales para la Escena_Carreras.
 *
 * Módulo puro (sin dependencia de Phaser) que gestiona la generación y
 * actualización de vehículos rivales controlados por IA. Implementa la
 * interfaz {@link SpawnerEnemigos} del Contrato_Compartido para integrarse
 * con el {@link SistemaMutacion}.
 *
 * - `intensidad` escala la probabilidad de spawn (0 = sin rivales, 1 = máximo).
 * - `agresividad` escala la velocidad de los rivales (0 = lentos, 1 = rápidos).
 *
 * @module escenas/carreras/SpawnerRivalesCarreras
 */

import { Rival, SegmentoPista } from './tipos';
import { CARRILES } from './constantes';
import { SpawnerEnemigos } from '../../contrato';

// ─── Constantes internas ─────────────────────────────────────────────────────

/** Velocidad base de un rival (cuando agresividad = 0). */
const VELOCIDAD_RIVAL_MIN = 80;

/** Velocidad máxima de un rival (cuando agresividad = 1). */
const VELOCIDAD_RIVAL_MAX = 200;

/** Distancia inicial a la que aparece un rival (delante del jugador). */
const DISTANCIA_SPAWN = 450;

/** Distancia mínima bajo la cual un rival se desactiva (detrás del jugador). */
const DISTANCIA_DESACTIVACION = -50;

/** Máximo rivales activos simultáneos. */
const MAX_RIVALES_ACTIVOS = 2;

/** Intervalo entre spawns forzados en milisegundos. */
const INTERVALO_SPAWN_MS = 2500;

// ─── Clase SpawnerRivalesCarreras ────────────────────────────────────────────

export class SpawnerRivalesCarreras implements SpawnerEnemigos {
  private intensidad: number = 0.5;
  private agresividad: number = 0.5;
  private rivalesActivos: Rival[] = [];
  private siguienteId: number = 1;
  private tiempoDesdeUltimoSpawn: number = 0;

  /**
   * Ajusta la probabilidad de spawn de rivales.
   * Valores más altos generan rivales con mayor frecuencia.
   *
   * @param intensidad - Valor en [0, 1] donde 0 = sin spawns, 1 = máximo spawns
   */
  ajustarIntensidad(intensidad: number): void {
    this.intensidad = Math.max(0, Math.min(1, intensidad));
  }

  /**
   * Ajusta la velocidad de los rivales generados.
   * Valores más altos producen rivales más rápidos y difíciles de esquivar.
   *
   * @param agresividad - Valor en [0, 1] donde 0 = lentos, 1 = rápidos
   */
  ajustarAgresividad(agresividad: number): void {
    this.agresividad = Math.max(0, Math.min(1, agresividad));
  }

  /**
   * Intenta generar un rival en un carril aleatorio según la probabilidad
   * escalada por la intensidad actual.
   *
   * @param _segmentoActual - Segmento de pista donde se encuentra el jugador (contexto)
   * @returns Un nuevo Rival si el spawn se activa, o null en caso contrario
   */
  spawnear(_segmentoActual: SegmentoPista): Rival | null {
    // El spawn ahora se controla por timer en actualizarRivales
    return null;
  }

  /**
   * Fuerza la creación de un rival sin chequeo de probabilidad.
   */
  forzarSpawn(): Rival | null {
    const activos = this.rivalesActivos.filter(r => r.activo).length;
    if (activos >= MAX_RIVALES_ACTIVOS) return null;
    return this.crearRival();
  }

  private crearRival(): Rival {
    const carril = Math.floor(Math.random() * CARRILES);
    const velocidad =
      VELOCIDAD_RIVAL_MIN + this.agresividad * (VELOCIDAD_RIVAL_MAX - VELOCIDAD_RIVAL_MIN);

    const rival: Rival = {
      id: this.siguienteId++,
      carril,
      distancia: DISTANCIA_SPAWN,
      velocidad,
      activo: true,
    };

    this.rivalesActivos.push(rival);
    return rival;
  }

  /**
   * Actualiza la posición de todos los rivales activos y desactiva aquellos
   * que salen del rango visible (distancia < umbral de desactivación).
   * La distancia es relativa al jugador: se reduce según la diferencia
   * entre la velocidad del jugador y la del rival.
   *
   * @param deltaMs - Tiempo transcurrido desde el último frame en milisegundos
   * @param velocidadJugador - Velocidad actual del jugador para cálculo relativo
   */
  actualizarRivales(deltaMs: number, velocidadJugador?: number): void {
    const deltaSeg = deltaMs / 1000;
    const velJugador = velocidadJugador ?? 100;

    // Timer-based spawn: genera un rival cada INTERVALO_SPAWN_MS
    this.tiempoDesdeUltimoSpawn += deltaMs;
    const intervaloActual = INTERVALO_SPAWN_MS * (1 - this.intensidad * 0.5); // más intensidad = más frecuente
    if (this.tiempoDesdeUltimoSpawn >= intervaloActual) {
      this.tiempoDesdeUltimoSpawn = 0;
      this.forzarSpawn();
    }

    // Mover rivales hacia el jugador
    for (const rival of this.rivalesActivos) {
      if (!rival.activo) continue;

      // Velocidad de acercamiento: más rápido cuanto más rápido va el jugador
      rival.distancia -= (velJugador * 0.5 + rival.velocidad * 0.3) * deltaSeg;

      if (rival.distancia < DISTANCIA_DESACTIVACION) {
        rival.activo = false;
      }
    }

    // Limpiar rivales inactivos viejos (evitar memory leak)
    if (this.rivalesActivos.length > 20) {
      this.rivalesActivos = this.rivalesActivos.filter(r => r.activo);
    }
  }

  /**
   * Devuelve la lista de rivales activos (activo === true).
   */
  obtenerRivalesActivos(): Rival[] {
    return this.rivalesActivos.filter(r => r.activo);
  }

  /**
   * Devuelve todos los rivales (activos e inactivos) para inspección.
   */
  obtenerTodosLosRivales(): Rival[] {
    return [...this.rivalesActivos];
  }

  /**
   * Retorna la intensidad actual configurada.
   */
  obtenerIntensidad(): number {
    return this.intensidad;
  }

  /**
   * Retorna la agresividad actual configurada.
   */
  obtenerAgresividad(): number {
    return this.agresividad;
  }
}
