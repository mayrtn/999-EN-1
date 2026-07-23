/**
 * Contrato_Compartido — Interfaces centrales.
 *
 * Reúne el acuerdo de interfaces que habilita el trabajo en paralelo de los tres
 * desarrolladores (Requirement 9): el ciclo de vida y contrato de las Escenas
 * ({@link IEscena}), la fachada del Shell ({@link IShell}), el Motor_Scoring
 * ({@link IMotorScoring}), el Sistema_Mutacion ({@link ISistemaMutacion}), el
 * Cliente del Servicio_Backend ({@link IClienteBackend}) y el input unificado
 * ({@link InputUnificado}).
 *
 * @module contrato/interfaces
 */

import type Phaser from 'phaser';
import type { EscenaId, PerfilJugador, DeclaracionRasgos } from './rasgos';
import type { TelemetriaRasgos } from './telemetria';
import type { PerillasMutacion } from './perillas';

/**
 * Input unificado (solo teclado) con el mismo mapa de teclas para las tres
 * Escenas (Requirements 9.5, 9.6). Las Escenas nunca leen el teclado de Phaser
 * directamente: siempre consumen esta abstracción.
 *
 * El binding concreto de teclas queda `[PENDIENTE — Documento_Decisiones]`
 * (Requirement 12.1); esta abstracción se fija ahora para no bloquear a los devs.
 */
export interface InputUnificado {
  /** Dirección como vector normalizado (`-1..1` por eje). */
  direccion(): { x: number; y: number };
  /** Acción primaria (saltar / golpear ritmo / disparar): presionada este frame. */
  accionPrimaria(): boolean;
  /** Acción primaria: recién presionada en este frame (just-pressed). */
  accionPrimariaJustPressed(): boolean;
  /** Acción secundaria (uso específico por escena): presionada este frame. */
  accionSecundaria(): boolean;
  /** Acción secundaria: recién presionada en este frame (just-pressed). */
  accionSecundariaJustPressed(): boolean;
  /** Pausa. */
  pausa(): boolean;
}

/**
 * Fachada pública del Shell consumida por las Escenas (Requirement 8).
 *
 * Es el único componente que conoce el ciclo de vida completo y el estado global
 * (Perfil_Jugador). Las Escenas solo hablan con él a través de este contrato.
 */
export interface IShell {
  /** Una escena solicita transición hacia otra escena por id lógico. */
  solicitarTransicion(destino: EscenaId): void;
  /** Una escena entrega su telemetría al terminar (Requirements 1.8, 8.3). */
  reportarTelemetria(telemetria: TelemetriaRasgos): void;
  /** Acceso de solo lectura al perfil acumulado (depuración / HUD). */
  obtenerPerfil(): Readonly<PerfilJugador>;
}

/**
 * Datos con los que el Shell inicia cada Escena antes de `create()`
 * (Requirement 8.4). Incluye las perillas ya resueltas, la fachada del Shell y
 * el input unificado.
 */
export interface DatosInicioEscena {
  perillas: PerillasMutacion;
  shell: IShell;
  input: InputUnificado;
}

/**
 * Contrato que toda Escena implementa (Requirement 9), envolviendo el ciclo de
 * vida de `Phaser.Scene` con los métodos del Contrato_Compartido.
 *
 * Secuencia respetada por toda Escena:
 * 1. El Shell la construye y llama `init(datos)` con las perillas resueltas.
 * 2. Publica `declararRasgos()` al Motor_Scoring vía el Shell (Requirement 4.2).
 * 3. En `create()` llama `aplicarPerillas()` (Requirements 2.5, 3.6).
 * 4. Durante el juego lee `InputUnificado` (Requirement 9.6) y acumula señales.
 * 5. Al terminar, construye `TelemetriaRasgos` y la reporta al Shell.
 */
export interface IEscena {
  readonly id: EscenaId;

  // --- Ciclo de vida (envoltura sobre Phaser.Scene) ---
  /** Se llama antes de `create()`; recibe las perillas resueltas por el Shell. */
  init(datos: DatosInicioEscena): void;
  preload(): void;
  create(): void;
  update(tiempo: number, deltaMs: number): void;

  // --- Contrato_Compartido ---
  /** Declara qué Rasgos mide y sus topes de oportunidad (Requirement 4.2). */
  declararRasgos(): DeclaracionRasgos;
  /** Aplica las Perillas_Mutacion recibidas (Requirements 2.5, 3.6, 9.4). */
  aplicarPerillas(perillas: PerillasMutacion): void;
  /** Construye la telemetría al terminar (Requirements 1.8, 2.6, 3.7, 9.1). */
  construirTelemetria(): TelemetriaRasgos;
  /** Inyecta el input unificado (Requirements 9.5, 9.6). */
  setInput(input: InputUnificado): void;
}

/**
 * Motor_Scoring: librería pura y determinística sin estado de Phaser
 * (Requirement 4.7).
 */
export interface IMotorScoring {
  /** Registra la declaración de una escena antes de medir (Requirement 4.2). */
  registrarDeclaracion(escena: EscenaId, decl: DeclaracionRasgos): void;
  /**
   * Calcula el Score_Rasgo por Rasgo y actualiza el perfil acumulado
   * (Requirements 4.3–4.6). Devuelve un nuevo Perfil_Jugador sin mutar el previo.
   */
  actualizarPerfil(
    perfilActual: PerfilJugador,
    telemetria: TelemetriaRasgos
  ): PerfilJugador;
}

/**
 * Spawner de enemigos que una Escena expone para que el Sistema_Mutacion ajuste
 * densidad (`intensidad_enemigos`) y comportamiento (`agresividad`)
 * (Requirements 7.2, 7.3).
 *
 * Forma mínima del contrato; la implementación concreta es responsabilidad de
 * cada Escena en tareas posteriores.
 */
export interface SpawnerEnemigos {
  /** Ajusta la densidad de spawn a partir de `intensidad_enemigos` en `[0,1]`. */
  ajustarIntensidad(intensidad: number): void;
  /** Ajusta la IA de enemigos a partir de `agresividad` en `[0,1]`. */
  ajustarAgresividad(agresividad: number): void;
}

/**
 * Gestor de audio que selecciona/crossfadea la pista según `mood_musica`
 * (Requirement 7.5). Contrato mínimo; implementación en tareas posteriores.
 */
export interface GestorAudio {
  /** Reproduce la pista asociada al mood indicado, con crossfade. */
  reproducirMood(mood: PerillasMutacion['mood_musica']): void;
}

/**
 * Overlay de texto temporal para mostrar el `mensaje` de la IA al iniciar la
 * escena (Requirement 7.6). Contrato mínimo; implementación posterior.
 */
export interface OverlayTexto {
  /** Muestra un mensaje corto de forma temporal. */
  mostrar(mensaje: string): void;
}

/**
 * Contexto que la Escena arma con sus propias referencias para que el
 * Sistema_Mutacion aplique cada perilla reutilizando los sprites existentes
 * (Requirement 7.7).
 *
 * Nota: desde Phaser v3.60 `ParticleEmitterManager` fue removido; la capa de
 * clima se modela con `Phaser.GameObjects.Particles.ParticleEmitter`.
 */
export interface ContextoMutacion {
  /** Sprites a los que aplicar el tinte de paleta (Requirement 7.1). */
  spritesTintables: Phaser.GameObjects.Sprite[];
  /** Emisor de partículas para el clima (Requirement 7.4). */
  capaClima: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Spawner opcional para intensidad y agresividad (Requirements 7.2, 7.3). */
  spawnerEnemigos?: SpawnerEnemigos;
  /** Gestor de audio para el mood musical (Requirement 7.5). */
  audio: GestorAudio;
  /** Overlay para el mensaje de la IA (Requirement 7.6). */
  overlayTexto: OverlayTexto;
}

/**
 * Sistema_Mutacion: aplica cada perilla a una Escena reutilizando sprites
 * existentes (Requirement 7).
 */
export interface ISistemaMutacion {
  aplicar(
    scene: Phaser.Scene,
    perillas: PerillasMutacion,
    ctx: ContextoMutacion
  ): void;
}

/**
 * Cliente del Servicio_Backend (Requirements 5.1, 5.6).
 *
 * Devuelve `unknown` deliberadamente: la respuesta de Bedrock es **no confiable**
 * hasta que el Shell la valide contra el conjunto cerrado (Requirements 5.4, 5.5).
 * Rechaza en timeout, error o red caída.
 */
export interface IClienteBackend {
  pedirMutacion(
    perfil: PerfilJugador,
    proximaEscena: EscenaId,
    opts: { timeoutMs: number; signal?: AbortSignal }
  ): Promise<unknown>;
}
