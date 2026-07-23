/**
 * Escena_Carreras — tercer nivel oculto OPCIONAL de género carreras (stub).
 *
 * Escena de Phaser 3 que implementa el {@link IEscena} del Contrato_Compartido
 * pero, por ahora, como **stub deshabilitado**: queda fuera del alcance duro de
 * la demo (ver `requirements.md` "Supuestos de Trabajo"). Existe para **probar la
 * extensibilidad N-Escenas** del sistema (Requirement 9.7): puede registrarse en
 * el {@link REGISTRO_ESCENAS} sin modificar el Shell ni el Motor_Scoring, porque
 * cumple el contrato como cualquier otra Escena.
 *
 * ## Estado y activación
 *
 * Se registra con `habilitada: false`. **Habilitarla es tan simple como poner
 * `habilitada: true`** en su entrada del registro y desarrollar su jugabilidad:
 * el {@link SceneManager}, el Motor_Scoring y el Sistema_Mutacion la tratarán
 * sin cambios porque declara sus rasgos vía {@link declararRasgos} y consume
 * `InputUnificado` y `PerillasMutacion` igual que las demás.
 *
 * ## Pendientes de diseño
 *
 * El enfoque técnico (pseudo-3D estilo OutRun vs. esquiva-carriles) y el mapa
 * fino de medición quedan `[PENDIENTE — Documento_Decisiones]`
 * (Requirements 12.5, 12.6). Guía **no vinculante** de cómo una carrera mediría
 * los rasgos (de `requirements.md`):
 * - **furia**: embestir rivales.
 * - **curiosidad**: explorar rutas / atajos.
 * - **logro**: checkpoints y posición final.
 * - **riesgo**: velocidad sostenida y pasadas al ras.
 *
 * Como stub, los topes de oportunidad y la telemetría usan placeholders en cero:
 * al no medir todavía, el Motor_Scoring la excluye del cálculo sin efectos.
 *
 * @module escenas/EscenaCarreras
 * @see Requirement 9.7 — extensibilidad sin tocar Shell ni Motor_Scoring.
 */

import Phaser from 'phaser';
import type {
  EscenaId,
  DeclaracionRasgos,
  TelemetriaRasgos,
  PerillasMutacion,
  InputUnificado,
  DatosInicioEscena,
  IEscena,
} from '../contrato';

/**
 * Escena_Carreras: implementación **stub** conforme al Contrato_Compartido.
 *
 * Todos los métodos son no-op seguros o devuelven placeholders válidos. No
 * introduce dependencias nuevas ni lógica de juego: su único fin actual es
 * demostrar que una Escena adicional encaja en el registro declarativo
 * (Requirement 9.7).
 */
export class EscenaCarreras extends Phaser.Scene implements IEscena {
  /** Identidad lógica de la escena (Contrato_Compartido). */
  readonly id: EscenaId = 'carreras';

  /** Input unificado inyectado por el Shell (aún sin uso en el stub). */
  private entradaInput: InputUnificado | null = null;

  constructor() {
    super({ key: 'carreras' });
  }

  /**
   * Recibe los datos de inicio del Shell antes de `create()` (Requirement 8.4).
   * Stub: sólo guarda el input; no hay estado de juego que reiniciar.
   */
  init(datos: DatosInicioEscena): void {
    this.entradaInput = datos?.input ?? this.entradaInput;
  }

  /** Inyecta el input unificado (Requirements 9.5, 9.6). */
  setInput(input: InputUnificado): void {
    this.entradaInput = input;
  }

  /** Sin assets externos: stub sin precarga. */
  preload(): void {
    // No-op.
  }

  /** Muestra un texto placeholder indicando que la escena está por llegar. */
  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'Escena_Carreras (proximamente)', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#7cf9ff',
      })
      .setOrigin(0.5);
  }

  /** Bucle por frame. Stub: no-op. */
  override update(_tiempo: number, _deltaMs: number): void {
    // No-op: sin jugabilidad todavía.
  }

  /**
   * Declara los topes de oportunidad por Rasgo (Requirement 4.2).
   *
   * Stub: placeholders en cero para no aportar señal al Motor_Scoring. Cuando la
   * escena se implemente, aquí se declararán los topes según la guía no
   * vinculante de `requirements.md`: furia = embestir rivales, curiosidad =
   * rutas/atajos, logro = checkpoints/posición, riesgo = velocidad sostenida /
   * pasadas al ras.
   */
  declararRasgos(): DeclaracionRasgos {
    return {
      oportunidadMaxima: {
        furia: 0,
        curiosidad: 0,
        logro: 0,
        riesgo: 0,
      },
    };
  }

  /** Aplica las Perillas_Mutacion (Requirements 2.5, 3.6, 9.4). Stub: no-op. */
  aplicarPerillas(_perillas: PerillasMutacion): void {
    // No-op: el stub no tiene sprites, clima, audio ni enemigos que mutar.
  }

  /**
   * Construye la telemetría al terminar (Requirement 9.1).
   *
   * Stub: todo en cero. Con `oportunidad = 0` en cada Rasgo, el Motor_Scoring
   * excluye la escena del cálculo (Requirement 4.5) sin división por cero.
   */
  construirTelemetria(): TelemetriaRasgos {
    return {
      escena: 'carreras',
      porRasgo: {
        furia: { senal: 0, oportunidad: 0 },
        curiosidad: { senal: 0, oportunidad: 0 },
        logro: { senal: 0, oportunidad: 0 },
        riesgo: { senal: 0, oportunidad: 0 },
      },
    };
  }
}
