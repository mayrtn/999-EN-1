/**
 * Motor_Scoring — lógica pura y determinística (Requirement 4).
 *
 * Normaliza la {@link TelemetriaRasgos} que emite cada Escena y actualiza el
 * {@link PerfilJugador} acumulado mediante un promedio ponderado incremental.
 * No usa `Math.random`, `Date.now` ni estado externo: dada la misma secuencia de
 * telemetrías produce siempre el mismo perfil (Requirement 4.7).
 *
 * Fórmula por Rasgo `r` en una Escena:
 * - Score_Rasgo: `score_r = clamp(senal_r / oportunidad_r, 0, 1)` cuando
 *   `oportunidad_r > 0` (Requirements 4.3, 4.4).
 * - Peso_Rasgo: `peso_r = oportunidad_r > 0 ? 1 : 0` (Requirement 4.5). Con
 *   `oportunidad_r == 0` el Rasgo se excluye del cálculo para esa Escena,
 *   evitando la división por cero y no contaminando el promedio.
 * - Perfil_Jugador (promedio ponderado acumulado incremental, Requirement 4.6):
 *   ```
 *   pesoNuevo_r = pesoAcumulado_r + peso_r
 *   perfil_r'   = (perfil_r * pesoAcumulado_r + score_r * peso_r) / pesoNuevo_r  si pesoNuevo_r > 0
 *   perfil_r'   = perfil_r                                                       si pesoNuevo_r == 0
 *   ```
 *
 * @module motor/motorScoring
 */

import type {
  EscenaId,
  Rasgo,
  PerfilJugador,
  DeclaracionRasgos,
  TelemetriaRasgos,
  IMotorScoring,
} from '../contrato';

/** Los cuatro Rasgos en orden fijo (determinismo del recorrido, Requirement 4.7). */
const RASGOS: readonly Rasgo[] = ['furia', 'curiosidad', 'logro', 'riesgo'];

/**
 * Acota `valor` al rango cerrado `[min, max]` (Requirement 4.4).
 *
 * Aritmética pura; `NaN` no puede alcanzarse desde el Motor_Scoring porque solo
 * se invoca con `oportunidad > 0`.
 */
function clamp(valor: number, min: number, max: number): number {
  if (valor < min) return min;
  if (valor > max) return max;
  return valor;
}

/**
 * Crea un {@link PerfilJugador} en estado neutro inicial (Requirement 8.1):
 * los cuatro Rasgos en `0` y su peso acumulado en `0`.
 *
 * Cada llamada devuelve un objeto nuevo e independiente (sin estado compartido).
 */
export function crearPerfilInicial(): PerfilJugador {
  return {
    rasgos: { furia: 0, curiosidad: 0, logro: 0, riesgo: 0 },
    pesoAcumulado: { furia: 0, curiosidad: 0, logro: 0, riesgo: 0 },
  };
}

/**
 * Implementación pura y determinística del {@link IMotorScoring} (Requirement 4).
 *
 * El único estado que mantiene son las declaraciones registradas por las Escenas
 * (Requirement 4.2). El cálculo del perfil no depende de ese estado ni de nada
 * externo: `actualizarPerfil` es una función pura de sus argumentos y no muta la
 * entrada.
 */
export class MotorScoring implements IMotorScoring {
  /** Declaraciones registradas por Escena antes de medir (Requirement 4.2). */
  private readonly declaraciones = new Map<EscenaId, DeclaracionRasgos>();

  /**
   * Registra la declaración de una Escena antes de iniciar la medición
   * (Requirement 4.2). Almacena una copia defensiva para no acoplarse a mutaciones
   * externas del objeto declarado.
   */
  registrarDeclaracion(escena: EscenaId, decl: DeclaracionRasgos): void {
    this.declaraciones.set(escena, {
      oportunidadMaxima: { ...decl.oportunidadMaxima },
    });
  }

  /**
   * Devuelve la declaración registrada para una Escena, o `undefined` si aún no
   * se registró (Requirement 4.2). Entrega una copia para preservar la
   * inmutabilidad del estado interno.
   */
  obtenerDeclaracion(escena: EscenaId): DeclaracionRasgos | undefined {
    const decl = this.declaraciones.get(escena);
    if (decl === undefined) return undefined;
    return { oportunidadMaxima: { ...decl.oportunidadMaxima } };
  }

  /**
   * Calcula el Score_Rasgo de cada Rasgo y actualiza el {@link PerfilJugador}
   * acumulado mediante el promedio ponderado incremental (Requirements 4.3–4.6).
   *
   * Función pura: devuelve un perfil NUEVO sin mutar `perfilActual`
   * (Requirement 4.7). Ante `oportunidad == 0` en un Rasgo, su peso es 0 y el
   * valor acumulado permanece idéntico, sin `NaN` ni división por cero
   * (Requirement 4.5).
   */
  actualizarPerfil(
    perfilActual: PerfilJugador,
    telemetria: TelemetriaRasgos
  ): PerfilJugador {
    const rasgos = { ...perfilActual.rasgos };
    const pesoAcumulado = { ...perfilActual.pesoAcumulado };

    for (const rasgo of RASGOS) {
      const { senal, oportunidad } = telemetria.porRasgo[rasgo];

      // Peso_Rasgo: 1 si la Escena midió el Rasgo, 0 si no (Requirement 4.5).
      const peso = oportunidad > 0 ? 1 : 0;
      if (peso === 0) {
        // Oportunidad 0 ⇒ excluir del cálculo; el valor acumulado no cambia.
        continue;
      }

      // Score_Rasgo acotado a [0,1] (Requirements 4.3, 4.4).
      const score = clamp(senal / oportunidad, 0, 1);

      // Promedio ponderado acumulado incremental (Requirement 4.6).
      const pesoPrevio = pesoAcumulado[rasgo];
      const pesoNuevo = pesoPrevio + peso;
      rasgos[rasgo] =
        (rasgos[rasgo] * pesoPrevio + score * peso) / pesoNuevo;
      pesoAcumulado[rasgo] = pesoNuevo;
    }

    return { rasgos, pesoAcumulado };
  }
}
