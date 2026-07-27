/**
 * SceneManager — Orquestador de Escenas, transiciones y estado de sesión (Shell).
 *
 * Es el corazón del Shell del cliente y el único componente que conoce el ciclo
 * de vida completo del juego y el estado global (`Perfil_Jugador`). Coordina el
 * gestor de escenas nativo de Phaser sobre el {@link REGISTRO_ESCENAS}
 * declarativo, implementa la fachada {@link IShell} que reciben las Escenas y
 * gobierna las transiciones con pantalla de carga.
 *
 * Responsabilidades cubiertas por esta tarea (11.2):
 * - **Registro declarativo (Requirement 9.7)**: itera {@link REGISTRO_ESCENAS} y
 *   registra en Phaser sólo las Escenas `habilitada === true`, usando su
 *   `EscenaId` como clave. No requiere modificación para admitir Escenas nuevas.
 * - **Perfil_Jugador en memoria toda la sesión (Requirement 8.6)**: mantiene el
 *   perfil como única fuente de verdad en el registro global del juego (la clave
 *   {@link CLAVE_PERFIL_JUGADOR} que fijó la BootScene), leyéndolo y
 *   actualizándolo sin recrearlo entre Escenas.
 * - **Pantalla de carga en transición (Requirement 8.2)**: muestra la
 *   {@link LoadingScene} mientras se resuelven las `Perillas_Mutacion` de la
 *   siguiente Escena y la oculta al iniciarla.
 * - **Entrega de perillas antes de iniciar (Requirement 8.4)** y **retorno al
 *   Nivel_Plataformas al terminar un nivel oculto (Requirement 8.5)**: ambos se
 *   resuelven por el mismo camino de transición genérico.
 * - **Fachada IShell**: `solicitarTransicion`, `reportarTelemetria`,
 *   `obtenerPerfil`.
 *
 * ## Seams para tareas siguientes (documentados)
 *
 * - **Tarea 11.3 (Motor_Scoring + resolución real de perillas + Sistema_Mutacion)**:
 *   - {@link DepsSceneManager.resolverPerillas} es el punto de inyección de la
 *     resolución de perillas. Por defecto 11.2 usa {@link calcularFallback}
 *     (heurística local, siempre válida) de forma síncrona para que el flujo sea
 *     ejecutable. 11.3 lo reemplazará por la orquestación completa
 *     Bedrock + Fallback (`resolverPerillas` de `resolucionPerillas.ts`).
 *   - {@link DepsSceneManager.actualizarPerfil} es el punto de inyección del
 *     Motor_Scoring. Por defecto 11.2 sólo guarda la última telemetría
 *     ({@link SceneManager.obtenerUltimaTelemetria}) SIN alterar el perfil. 11.3
 *     inyectará `MotorScoring.actualizarPerfil` para que `reportarTelemetria`
 *     actualice el `Perfil_Jugador`.
 * - **Tarea 11.5 (Escena_Carreras)**: no toca este archivo; sólo añade una
 *   entrada a {@link REGISTRO_ESCENAS} (Requirement 9.7).
 *
 * @module shell/SceneManager
 * @see Requirements 8.2, 8.5, 8.6, 9.7
 */

import Phaser from 'phaser';
import type {
  DatosInicioEscena,
  DeclaracionRasgos,
  EscenaId,
  IShell,
  InputUnificado,
  PerfilJugador,
  PerillasMutacion,
  TelemetriaRasgos,
} from '../contrato';
import { crearPerfilInicial } from '../motor';
import { calcularFallback } from '../mutacion';
import { InputTeclado } from '../input';
import { CLAVE_PERFIL_JUGADOR } from './BootScene';
import { LoadingScene, ID_CARGA } from './LoadingScene';
import { ResumenPerfilScene, ID_RESUMEN } from '../escenas/ResumenPerfilScene';
import {
  REGISTRO_ESCENAS,
  type EscenaJugable,
  type RegistroEscena,
} from './registroEscenas';

/** Primera Escena jugable que se carga al arrancar (Requirement 6.2). */
export const PRIMERA_ESCENA: EscenaId = 'portada';

/** Clave bajo la que se publica el {@link SceneManager} en el registro global. */
export const CLAVE_SCENE_MANAGER = 'sceneManager';

/**
 * Vista mínima del gestor de escenas de Phaser (`game.scene`) que usa el
 * {@link SceneManager}. Se define de forma acotada para facilitar el testing con
 * un doble; el `Phaser.Scenes.SceneManager` real la satisface estructuralmente.
 */
export interface IGestorEscenas {
  /** Registra una Escena bajo una clave (equivalente a `add`). */
  add(clave: string, escena: Phaser.Scene, iniciar?: boolean): unknown;
  /** Arranca (o reinicia) una Escena, pasándole datos a su `init` (`start`). */
  start(clave: string, datos?: object): unknown;
  /** Detiene una Escena en ejecución (`stop`). */
  stop(clave: string): unknown;
  /** Devuelve la instancia registrada bajo una clave, o `null` si no existe. */
  getScene(clave: string): EscenaJugable | null;
}

/**
 * Almacén de datos de sesión (equivalente a `Phaser.Data.DataManager`, es decir
 * `game.registry`). Es el punto de encuentro del `Perfil_Jugador` entre la
 * BootScene y el {@link SceneManager} (Requirement 8.6).
 */
export interface IAlmacenSesion {
  get(clave: string): unknown;
  set(clave: string, valor: unknown): void;
}

/**
 * Dependencias del {@link SceneManager}. `gestor` y `sesion` son obligatorios;
 * el resto son seams inyectables con defaults sensatos (ver documentación del
 * módulo).
 */
export interface DepsSceneManager {
  /** Gestor de escenas de Phaser (`game.scene`). */
  gestor: IGestorEscenas;
  /** Almacén de sesión (`game.registry`) donde vive el Perfil_Jugador. */
  sesion: IAlmacenSesion;
  /**
   * Registro declarativo de Escenas a usar. Por defecto {@link REGISTRO_ESCENAS}.
   * Inyectable para tests.
   */
  registro?: RegistroEscena[];
  /**
   * SEAM 11.3 — Resolución de `Perillas_Mutacion` para una transición. Por
   * defecto usa {@link calcularFallback} (heurística local válida) de forma
   * asíncrona pero inmediata, para que el flujo sea ejecutable en Fase 1. 11.3
   * lo reemplazará por la orquestación completa Bedrock + Fallback.
   */
  resolverPerillas?: (
    perfil: Readonly<PerfilJugador>,
    destino: EscenaId
  ) => Promise<PerillasMutacion>;
  /**
   * SEAM 11.3 — Actualización del `Perfil_Jugador` a partir de la telemetría
   * (Motor_Scoring). Por defecto `undefined`: 11.2 sólo guarda la última
   * telemetría sin tocar el perfil. 11.3 inyectará `MotorScoring.actualizarPerfil`.
   */
  actualizarPerfil?: (
    perfil: PerfilJugador,
    telemetria: TelemetriaRasgos
  ) => PerfilJugador;
  /**
   * SEAM 11.3 — Registro de la {@link DeclaracionRasgos} de una Escena antes de
   * iniciarla (Motor_Scoring, Requirement 4.2). Por defecto `undefined`: sin
   * Motor_Scoring cableado no se registra nada. 11.3 inyecta
   * `MotorScoring.registrarDeclaracion` para que cada Escena publique qué Rasgos
   * mide y sus topes de oportunidad antes de medir.
   */
  registrarDeclaracion?: (escena: EscenaId, decl: DeclaracionRasgos) => void;
  /**
   * Constructor del {@link InputUnificado} de una Escena. Por defecto crea un
   * {@link InputTeclado} desde la Escena (mismo mapa de teclas en las tres,
   * Requirement 9.6). Inyectable para tests sin teclado de Phaser.
   */
  construirInput?: (escena: EscenaJugable) => InputUnificado;
}

/** Opciones internas de una transición. */
interface OpcionesTransicion {
  /** Si `true`, muestra la pantalla de carga (Requirement 8.2). */
  mostrarCarga: boolean;
}

/**
 * Orquestador de Escenas del Shell. Implementa {@link IShell}: es la fachada que
 * cada Escena recibe en sus {@link DatosInicioEscena}.
 */
export class SceneManager implements IShell {
  private readonly gestor: IGestorEscenas;
  private readonly sesion: IAlmacenSesion;
  private readonly registro: RegistroEscena[];
  private readonly resolver: (
    perfil: Readonly<PerfilJugador>,
    destino: EscenaId
  ) => Promise<PerillasMutacion>;
  private readonly actualizarPerfil?: (
    perfil: PerfilJugador,
    telemetria: TelemetriaRasgos
  ) => PerfilJugador;
  private readonly registrarDeclaracion?: (
    escena: EscenaId,
    decl: DeclaracionRasgos
  ) => void;
  private readonly construirInput: (escena: EscenaJugable) => InputUnificado;

  /** Escena jugable actualmente activa (para poder detenerla en la transición). */
  private escenaActual: EscenaId | null = null;
  /** Última telemetría reportada; seam para el Motor_Scoring de 11.3. */
  private ultimaTelemetria: TelemetriaRasgos | null = null;
  /** Evita transiciones solapadas si llegan varias solicitudes seguidas. */
  private transicionEnCurso = false;

  constructor(deps: DepsSceneManager) {
    this.gestor = deps.gestor;
    this.sesion = deps.sesion;
    this.registro = deps.registro ?? REGISTRO_ESCENAS;
    this.actualizarPerfil = deps.actualizarPerfil;
    this.registrarDeclaracion = deps.registrarDeclaracion;
    this.construirInput =
      deps.construirInput ?? ((escena) => InputTeclado.desdeEscena(escena));
    // SEAM 11.3: por defecto, la resolución es la heurística local (fallback),
    // que SIEMPRE produce perillas válidas del conjunto cerrado (Requirement 6.4).
    this.resolver =
      deps.resolverPerillas ??
      ((perfil) => Promise.resolve(calcularFallback(perfil as PerfilJugador)));
  }

  // ==========================================================================
  // Registro declarativo (Requirement 9.7)
  // ==========================================================================

  /**
   * Registra en el gestor de escenas de Phaser la pantalla de carga y todas las
   * Escenas `habilitada === true` del {@link REGISTRO_ESCENAS}, usando su
   * `EscenaId` como clave (Requirement 9.7).
   *
   * Itera el registro sin conocer las Escenas concretas: añadir una Escena nueva
   * (p. ej. `carreras` en 11.5) no requiere modificar este método.
   */
  registrarEscenas(): void {
    // Pantalla de carga (infraestructura del Shell, Requirement 8.2).
    this.gestor.add(ID_CARGA, new LoadingScene(), false);

    // Pantalla de resumen de perfil (infraestructura del Shell).
    this.gestor.add(ID_RESUMEN, new ResumenPerfilScene(), false);

    for (const entrada of this.registro) {
      if (!entrada.habilitada) continue;
      this.gestor.add(entrada.id, entrada.crear(), false);
    }
  }

  /** Ids de las Escenas habilitadas (útil para depuración y tests). */
  escenasHabilitadas(): EscenaId[] {
    return this.registro.filter((e) => e.habilitada).map((e) => e.id);
  }

  /** ¿Está habilitada (y por tanto registrada) la Escena indicada? */
  private estaHabilitada(id: EscenaId): boolean {
    return this.registro.some((e) => e.id === id && e.habilitada);
  }

  // ==========================================================================
  // Arranque y transiciones (Requirements 8.2, 8.4, 8.5)
  // ==========================================================================

  /**
   * Arranca la primera Escena jugable (`Nivel_Plataformas`, Requirement 1.1).
   *
   * No muestra pantalla de carga: el arranque inicial no es una transición
   * solicitada por una Escena (Requirement 8.2 aplica a transiciones). Resuelve
   * las perillas iniciales a partir del perfil neutro y las entrega a la Escena
   * antes de iniciarla (Requirement 8.4).
   */
  async iniciar(): Promise<void> {
    await this.transicionar(PRIMERA_ESCENA, { mostrarCarga: false });
  }

  /**
   * Ejecuta una transición hacia `destino`: opcionalmente muestra la pantalla de
   * carga, resuelve las `Perillas_Mutacion` (seam 11.3) y arranca la Escena
   * destino entregándole las perillas resueltas (Requirements 8.2, 8.4).
   *
   * El mismo camino cubre el retorno al `Nivel_Plataformas` al terminar un nivel
   * oculto (Requirement 8.5): la Escena oculta llama
   * `solicitarTransicion('plataformas')` y las perillas del retorno se resuelven
   * y aplican igual que en cualquier otra transición.
   *
   * @param destino Escena destino (por id lógico).
   * @param opciones Control de la pantalla de carga.
   */
  private async transicionar(
    destino: EscenaId,
    opciones: OpcionesTransicion
  ): Promise<void> {
    // Error handling (design.md): transición a un id no habilitado se ignora
    // para no romper el flujo si un feature flag está apagado.
    if (!this.estaHabilitada(destino)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[SceneManager] Transición ignorada: la Escena '${destino}' no está habilitada.`
      );
      return;
    }

    if (this.transicionEnCurso) {
      // eslint-disable-next-line no-console
      console.warn(
        `[SceneManager] Transición a '${destino}' descartada: ya hay una en curso.`
      );
      return;
    }
    this.transicionEnCurso = true;

    try {
      // 1) Mostrar pantalla de carga (Requirement 8.2): detiene la Escena actual
      //    y levanta la LoadingScene mientras se resuelven las perillas.
      if (opciones.mostrarCarga) {
        if (this.escenaActual) this.gestor.stop(this.escenaActual);
        this.gestor.start(ID_CARGA);
      }

      // 2) Resolver las perillas de la siguiente Escena (seam 11.3). El perfil
      //    es la única fuente de verdad de la sesión (Requirement 8.6).
      const perfil = this.obtenerPerfil();
      const perillas = await this.resolver(perfil, destino);

      // 3) Ocultar la carga e iniciar la Escena destino con sus perillas ya
      //    resueltas (Requirements 8.2, 8.4).
      if (opciones.mostrarCarga) {
        this.gestor.stop(ID_CARGA);
      }
      this.iniciarEscena(destino, perillas);
      this.escenaActual = destino;
    } finally {
      this.transicionEnCurso = false;
    }
  }

  /**
   * Registra e inicia la Escena destino entregándole sus `DatosInicioEscena`
   * (perillas resueltas + fachada del Shell) antes de `create()`
   * (Requirement 8.4), y programa la inyección de su {@link InputUnificado}.
   */
  private iniciarEscena(id: EscenaId, perillas: PerillasMutacion): void {
    const escena = this.gestor.getScene(id);
    if (escena) {
      this.programarInyeccionInput(escena);
      // SEAM 11.3: la Escena publica su declaración de Rasgos al Motor_Scoring
      // antes de medir (Requirement 4.2). Sólo si el seam está inyectado.
      this.registrarDeclaracionEscena(id, escena);
    }

    const datos: DatosInicioEscena = {
      perillas,
      shell: this,
      // El input real se inyecta vía setInput al crearse la Escena
      // (programarInyeccionInput). Se provee un placeholder tipado para
      // satisfacer el contrato; las Escenas lo reemplazan por el inyectado.
      input: this.inputPlaceholder(),
    };
    this.gestor.start(id, datos);
  }

  /**
   * Programa la construcción e inyección del {@link InputUnificado} de una
   * Escena en cuanto termina su `create()` (evento `CREATE` de Phaser), momento
   * en que su plugin de teclado ya está disponible. Se inyecta vía
   * `IEscena.setInput` antes del primer `update`, garantizando el mismo mapa de
   * teclas en las tres Escenas (Requirements 9.5, 9.6).
   *
   * Si el teclado no está disponible (p. ej. entorno sin DOM), la Escena degrada
   * sin romper: no recibe input inyectado.
   */
  private programarInyeccionInput(escena: EscenaJugable): void {
    const inyectar = (): void => {
      try {
        escena.setInput(this.construirInput(escena));
      } catch {
        // Teclado no disponible: la Escena degrada con gracia.
      }
    };

    const emisor = escena.sys?.events;
    if (emisor && typeof emisor.once === 'function') {
      emisor.once(Phaser.Scenes.Events.CREATE, inyectar);
    } else {
      // Sin emisor de eventos (doble de test u orden atípico): inyecta directo.
      inyectar();
    }
  }

  /**
   * Publica la {@link DeclaracionRasgos} de la Escena al Motor_Scoring vía el
   * seam {@link DepsSceneManager.registrarDeclaracion} antes de iniciarla
   * (Requirement 4.2). Es defensivo: no hace nada si el seam no está inyectado
   * o si la Escena (p. ej. un doble de test) no expone `declararRasgos`.
   */
  private registrarDeclaracionEscena(id: EscenaId, escena: EscenaJugable): void {
    if (!this.registrarDeclaracion) return;
    const declarar = (escena as Partial<EscenaJugable>).declararRasgos;
    if (typeof declarar !== 'function') return;
    try {
      this.registrarDeclaracion(id, declarar.call(escena));
    } catch {
      // La declaración no debe romper el arranque de la Escena.
    }
  }

  /**
   * Input placeholder neutro (sin efecto) usado sólo para satisfacer el tipo
   * {@link DatosInicioEscena} en el arranque de la Escena. El input operativo lo
   * inyecta {@link programarInyeccionInput} al terminar `create()`.
   */
  private inputPlaceholder(): InputUnificado {
    return {
      direccion: () => ({ x: 0, y: 0 }),
      accionPrimaria: () => false,
      accionPrimariaJustPressed: () => false,
      accionSecundaria: () => false,
      accionSecundariaJustPressed: () => false,
      pausa: () => false,
    };
  }

  // ==========================================================================
  // Fachada IShell
  // ==========================================================================

  /**
   * Una Escena solicita transición hacia otra (Requirement 8.2). Lanza la
   * transición de forma asíncrona (con pantalla de carga) sin bloquear el bucle
   * de frames (Requirement 5.6): `solicitarTransicion` retorna de inmediato.
   */
  solicitarTransicion(destino: EscenaId): void {
    void this.transicionar(destino, { mostrarCarga: true });
  }

  /**
   * Una Escena entrega su telemetría al terminar (Requirements 1.8, 8.3).
   *
   * En 11.2 se guarda como última telemetría (seam para el Motor_Scoring). Si se
   * inyectó {@link DepsSceneManager.actualizarPerfil} (tarea 11.3), además
   * actualiza el `Perfil_Jugador` en el almacén de sesión, manteniéndolo como
   * única fuente de verdad de la sesión (Requirement 8.6).
   */
  reportarTelemetria(telemetria: TelemetriaRasgos): void {
    this.ultimaTelemetria = telemetria;

    if (this.actualizarPerfil) {
      const actualizado = this.actualizarPerfil(
        this.obtenerPerfilMutable(),
        telemetria
      );
      this.sesion.set(CLAVE_PERFIL_JUGADOR, actualizado);
    }
  }

  /**
   * Acceso de sólo lectura al `Perfil_Jugador` acumulado (Requirement 8.6).
   * Lee la única fuente de verdad (el almacén de sesión); si aún no existe,
   * la inicializa en estado neutro y la publica.
   */
  obtenerPerfil(): Readonly<PerfilJugador> {
    return this.obtenerPerfilMutable();
  }

  /** Última telemetría reportada (seam para el Motor_Scoring de 11.3). */
  obtenerUltimaTelemetria(): TelemetriaRasgos | null {
    return this.ultimaTelemetria;
  }

  /**
   * Lee el `Perfil_Jugador` del almacén de sesión, inicializándolo en estado
   * neutro si falta (defensa: normalmente lo publica la BootScene).
   */
  private obtenerPerfilMutable(): PerfilJugador {
    const perfil = this.sesion.get(CLAVE_PERFIL_JUGADOR) as
      | PerfilJugador
      | undefined;
    if (perfil) return perfil;

    const inicial = crearPerfilInicial();
    this.sesion.set(CLAVE_PERFIL_JUGADOR, inicial);
    return inicial;
  }
}
