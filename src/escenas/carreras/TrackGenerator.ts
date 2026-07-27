/**
 * TrackGenerator — Generador procedural de pista para la Escena_Carreras.
 *
 * Módulo puro (sin dependencia de Phaser) que genera la secuencia de segmentos
 * de pista usando una semilla determinística. Garantiza variedad entre sesiones
 * y cumple los invariantes de estructura (mínimo 3 bifurcaciones, checkpoints
 * a intervalos regulares, todos los tipos de segmento presentes).
 *
 * @module escenas/carreras/TrackGenerator
 */

import { SegmentoPista, PistaGenerada } from './tipos';
import { DURACION_MIN_MS, DURACION_MAX_MS } from './constantes';

// ─── PRNG determinístico (Mulberry32) ────────────────────────────────────────

/**
 * Crea un generador pseudo-aleatorio determinístico basado en la semilla.
 * Usa el algoritmo Mulberry32 — rápido, simple y con buena distribución.
 */
function crearPRNG(semilla: number): () => number {
  let estado = semilla | 0;
  return (): number => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Constantes internas de generación ───────────────────────────────────────

/** Longitud base de un segmento en unidades de pista. */
const LONGITUD_SEGMENTO_MIN = 80;
const LONGITUD_SEGMENTO_MAX = 200;

/** Probabilidad base de bifurcación por segmento. */
const PROBABILIDAD_BIFURCACION = 0.15;

/** Intervalo objetivo entre checkpoints (en cantidad de segmentos). */
const INTERVALO_CHECKPOINT_SEGMENTOS = 5;

/** Mínimo de bifurcaciones garantizado. */
const MINIMO_BIFURCACIONES = 3;

// ─── Tipos de segmento disponibles ───────────────────────────────────────────

const TIPOS_SEGMENTO: Array<SegmentoPista['tipo']> = ['recta', 'curva_izq', 'curva_der'];

// ─── Clase TrackGenerator ────────────────────────────────────────────────────

export class TrackGenerator {
  /**
   * Genera una pista procedural basada en la semilla y la duración de la sesión.
   *
   * Invariantes garantizados:
   * - Misma semilla + misma duración = pista idéntica (determinismo)
   * - Al menos un segmento de cada tipo (recta, curva_izq, curva_der)
   * - Al menos 3 bifurcaciones (inyecta si la generación no produce suficientes)
   * - Checkpoints a intervalos regulares (variación ≤ 50% del intervalo promedio)
   *
   * @param semilla - Valor numérico para el PRNG determinístico
   * @param duracionSesionMs - Duración de la sesión en milisegundos
   * @returns PistaGenerada con segmentos, conteos y semilla
   */
  generar(semilla: number, duracionSesionMs: number): PistaGenerada {
    const rand = crearPRNG(semilla);

    // Calcular cantidad de segmentos en función de la duración
    const duracionClamped = Math.max(DURACION_MIN_MS, Math.min(DURACION_MAX_MS, duracionSesionMs));
    const factorDuracion = duracionClamped / DURACION_MIN_MS;
    const cantidadSegmentos = Math.max(15, Math.round(20 * factorDuracion));

    // Generar segmentos base
    const segmentos: SegmentoPista[] = [];
    for (let i = 0; i < cantidadSegmentos; i++) {
      const tipo = this.seleccionarTipoSegmento(rand, segmentos);
      const longitud = LONGITUD_SEGMENTO_MIN + Math.floor(rand() * (LONGITUD_SEGMENTO_MAX - LONGITUD_SEGMENTO_MIN + 1));
      segmentos.push({
        tipo,
        longitud,
        bifurcacion: false,
        tieneCheckpoint: false,
      });
    }

    // Garantizar que todos los tipos de segmento estén presentes
    this.garantizarTodosLosTipos(segmentos, rand);

    // Insertar bifurcaciones proceduralmente
    this.insertarBifurcaciones(segmentos, rand);

    // Garantizar mínimo 3 bifurcaciones
    this.garantizarMinimoBifurcaciones(segmentos, rand);

    // Distribuir checkpoints a intervalos regulares
    this.distribuirCheckpoints(segmentos);

    // Conteos finales
    const totalBifurcaciones = segmentos.filter(s => s.bifurcacion).length;
    const totalCheckpoints = segmentos.filter(s => s.tieneCheckpoint).length;

    return {
      segmentos,
      totalCheckpoints,
      totalBifurcaciones,
      semilla,
    };
  }

  /**
   * Selecciona el tipo de segmento con distribución variada.
   * Favorece rectas ligeramente pero garantiza variedad.
   */
  private seleccionarTipoSegmento(
    rand: () => number,
    _segmentosExistentes: SegmentoPista[]
  ): SegmentoPista['tipo'] {
    const valor = rand();

    // Distribución: 40% recta, 30% curva_izq, 30% curva_der
    if (valor < 0.4) return 'recta';
    if (valor < 0.7) return 'curva_izq';
    return 'curva_der';
  }

  /**
   * Si algún tipo de segmento no está presente, reemplaza segmentos existentes
   * para garantizar al menos uno de cada tipo.
   */
  private garantizarTodosLosTipos(segmentos: SegmentoPista[], rand: () => number): void {
    for (const tipo of TIPOS_SEGMENTO) {
      const existeTipo = segmentos.some(s => s.tipo === tipo);
      if (!existeTipo) {
        // Encontrar un índice para inyectar este tipo
        const indice = Math.floor(rand() * segmentos.length);
        const existente = segmentos[indice]!;
        segmentos[indice] = {
          tipo,
          longitud: existente.longitud,
          bifurcacion: existente.bifurcacion,
          tieneCheckpoint: existente.tieneCheckpoint,
        };
      }
    }
  }

  /**
   * Inserta bifurcaciones (Rutas_Alternativas) de forma procedural.
   * Cada segmento tiene una probabilidad base de contener bifurcación,
   * con separación mínima entre bifurcaciones consecutivas.
   */
  private insertarBifurcaciones(segmentos: SegmentoPista[], rand: () => number): void {
    const separacionMinima = 3; // mínimo 3 segmentos entre bifurcaciones
    let ultimaBifurcacion = -separacionMinima; // permite bifurcación desde el inicio

    for (let i = 0; i < segmentos.length; i++) {
      if (i - ultimaBifurcacion < separacionMinima) continue;

      if (rand() < PROBABILIDAD_BIFURCACION) {
        segmentos[i]!.bifurcacion = true;
        ultimaBifurcacion = i;
      }
    }
  }

  /**
   * Si la generación procedural no produjo al menos MINIMO_BIFURCACIONES,
   * inyecta bifurcaciones adicionales en posiciones distribuidas.
   */
  private garantizarMinimoBifurcaciones(segmentos: SegmentoPista[], rand: () => number): void {
    let bifurcacionesActuales = segmentos.filter(s => s.bifurcacion).length;

    if (bifurcacionesActuales >= MINIMO_BIFURCACIONES) return;

    // Obtener índices de segmentos sin bifurcación
    const indicesSinBifurcacion = segmentos
      .map((s, i) => (!s.bifurcacion ? i : -1))
      .filter(i => i !== -1);

    // Distribuir las bifurcaciones faltantes de forma espaciada
    const faltantes = MINIMO_BIFURCACIONES - bifurcacionesActuales;
    const paso = Math.floor(indicesSinBifurcacion.length / (faltantes + 1));

    for (let f = 0; f < faltantes && indicesSinBifurcacion.length > 0; f++) {
      // Usar posición distribuida basada en paso, con algo de aleatoriedad
      const posBase = Math.min((f + 1) * paso, indicesSinBifurcacion.length - 1);
      const jitter = Math.floor(rand() * Math.max(1, Math.floor(paso / 2)));
      const posicion = Math.min(posBase + jitter, indicesSinBifurcacion.length - 1);

      const indice = indicesSinBifurcacion[posicion]!;
      segmentos[indice]!.bifurcacion = true;

      // Remover el índice usado para no reutilizarlo
      indicesSinBifurcacion.splice(posicion, 1);
      bifurcacionesActuales++;
    }
  }

  /**
   * Distribuye checkpoints a intervalos regulares a lo largo de la pista.
   * La variación entre checkpoints consecutivos no supera el 50% del intervalo promedio.
   */
  private distribuirCheckpoints(segmentos: SegmentoPista[]): void {
    if (segmentos.length === 0) return;

    // Calcular intervalo de checkpoint basado en la longitud total
    const totalSegmentos = segmentos.length;
    const intervalo = Math.max(2, Math.min(INTERVALO_CHECKPOINT_SEGMENTOS, Math.floor(totalSegmentos / 3)));

    // Colocar checkpoints a intervalos fijos empezando desde el primer intervalo
    for (let i = intervalo - 1; i < totalSegmentos; i += intervalo) {
      segmentos[i]!.tieneCheckpoint = true;
    }
  }
}
