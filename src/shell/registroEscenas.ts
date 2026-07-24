/**
 * Registro declarativo de Escenas del Shell (Requirement 9.7).
 *
 * Este módulo es el **único** lugar donde se enumeran las Escenas jugables del
 * juego. El {@link SceneManager} lo consume iterándolo: registra en el gestor de
 * escenas de Phaser sólo las entradas con `habilitada === true` y las trata a
 * todas por igual a través del Contrato_Compartido ({@link IEscena}). Gracias a
 * esta indirección, **añadir una Escena nueva no requiere modificar el Shell ni
 * el Motor_Scoring** (Requirement 9.7): basta con agregar una entrada aquí.
 *
 * ## Extensibilidad N-Escenas (design.md "Extensibilidad N-Escenas")
 *
 * La tarea 11.5 añadirá la `Escena_Carreras` como entrada opcional
 * (`habilitada: false`) SIN tocar el {@link SceneManager}: simplemente empujará
 * un {@link RegistroEscena} más a {@link REGISTRO_ESCENAS}. Por eso el registro
 * vive en un módulo separado y exportado, desacoplado de la lógica de
 * orquestación.
 *
 * @module shell/registroEscenas
 * @see Requirement 9.7
 */

import type Phaser from 'phaser';
import type { EscenaId, IEscena } from '../contrato';
import {
  NivelPlataformas,
  NivelRitmo,
  NivelShooter,
  EscenaCarreras,
} from '../escenas';
import { EscenaSeleccion } from '../escenas/EscenaSeleccion';

/**
 * Tipo de una Escena jugable: una `Phaser.Scene` que además cumple el
 * Contrato_Compartido ({@link IEscena}). El {@link SceneManager} la registra con
 * Phaser (por su `EscenaId` como clave) y le entrega los `DatosInicioEscena`.
 */
export type EscenaJugable = Phaser.Scene & IEscena;

/**
 * Entrada del registro declarativo: asocia un id lógico ({@link EscenaId}) con
 * un **constructor perezoso** de la Escena y un **feature flag**.
 *
 * @see Requirement 9.7
 */
export interface RegistroEscena {
  /** Id lógico de la Escena dentro del Contrato_Compartido. */
  id: EscenaId;
  /**
   * Fábrica que crea una nueva instancia de la Escena. Es perezosa (no se
   * construye hasta registrarla) para no instanciar Phaser en tiempo de import.
   */
  crear: () => EscenaJugable;
  /**
   * Feature flag por Escena. El {@link SceneManager} sólo registra e instancia
   * las Escenas con `habilitada === true`. Poner una en `false` la excluye del
   * juego sin borrar su entrada (Requirement 9.7).
   */
  habilitada: boolean;
}

/**
 * Registro declarativo de las Escenas del juego (Requirement 9.7).
 *
 * Las tres Escenas de la demo están habilitadas. La `Escena_Carreras` NO figura
 * aquí todavía: la tarea 11.5 añadirá su entrada (con `habilitada: false`) sin
 * modificar el {@link SceneManager}.
 */
export const REGISTRO_ESCENAS: RegistroEscena[] = [
  { id: 'seleccion_personaje', crear: () => new EscenaSeleccion() as unknown as EscenaJugable, habilitada: true },
  { id: 'plataformas', crear: () => new NivelPlataformas(), habilitada: true },
  { id: 'ritmo', crear: () => new NivelRitmo(), habilitada: true },
  { id: 'shooter', crear: () => new NivelShooter(), habilitada: true },
  // [SEAM — Tarea 11.5] Escena_Carreras: entrada opcional deshabilitada. Prueba
  // la extensibilidad N-Escenas (Requirement 9.7): se añade aquí sin tocar el
  // SceneManager ni el Motor_Scoring. El SceneManager NO la registra mientras
  // `habilitada === false`; activarla es tan simple como ponerla en `true`.
  { id: 'carreras', crear: () => new EscenaCarreras(), habilitada: false },
];
