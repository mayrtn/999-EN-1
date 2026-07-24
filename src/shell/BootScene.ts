/**
 * BootScene — Arranque del Juego e inicialización del Perfil_Jugador (Shell).
 *
 * Primera `Phaser.Scene` del juego (key `'boot'`). Es responsable de:
 * - Precargar los assets comunes a todas las Escenas (Requirement 8.1, parte de
 *   la responsabilidad de arranque del Shell). En Fase 1 no existen assets de
 *   arte reales (los CC0 se cargan en Fase 3), por lo que `preload()` es un
 *   no-op seguro con la salvedad documentada.
 * - Inicializar el {@link PerfilJugador} en su estado neutro: los cuatro Rasgos
 *   (Furia, Curiosidad, Logro, Riesgo) en `0` y su peso acumulado en `0`, vía
 *   {@link crearPerfilInicial} (Requirement 8.1).
 * - Cargar el {@link NivelPlataformas} como primera Escena jugable
 *   (Requirement 1.1).
 *
 * ## Propiedad del Perfil_Jugador y acoplamiento con la tarea 11.2
 *
 * El SceneManager, el registro declarativo de escenas y la lógica de transición
 * pertenecen a la tarea 11.2 (que se ejecuta a continuación). Para no acoplar
 * este arranque a esos componentes aún inexistentes, el Perfil_Jugador neutro se
 * publica en el **registro global del juego** (`this.registry`, que es el
 * `DataManager` compartido entre todas las Escenas) bajo la clave
 * {@link CLAVE_PERFIL_JUGADOR}. Así, cuando 11.2 construya el SceneManager, podrá
 * leer y actualizar el perfil (`this.game.registry.get(CLAVE_PERFIL_JUGADOR)`)
 * sin depender de la estructura interna de la BootScene.
 *
 * Como el SceneManager todavía no existe, la BootScene hace lo mínimo correcto
 * para que el juego sea ejecutable hoy: inicia directamente la Escena
 * `'plataformas'`. La tarea 11.2 refinará este lanzamiento (pantalla de carga,
 * resolución de perillas, etc.) reemplazando el `iniciarPrimeraEscena()`.
 *
 * @module shell/BootScene
 * @see Requirements 8.1, 1.1
 */

import Phaser from 'phaser';
import type { PerfilJugador } from '../contrato';
import { crearPerfilInicial, MotorScoring } from '../motor';
import {
  SceneManager,
  CLAVE_SCENE_MANAGER,
  type IGestorEscenas,
  type IAlmacenSesion,
} from './SceneManager';
import { crearResolverPerillas } from './configBackend';

/**
 * Clave bajo la que se publica el {@link PerfilJugador} en el registro global del
 * juego (`Phaser.Game.registry`). El Shell/SceneManager (tarea 11.2) la usa como
 * punto de encuentro para leer y actualizar el perfil durante toda la sesión
 * (Requirement 8.6), sin acoplarse a la BootScene.
 */
export const CLAVE_PERFIL_JUGADOR = 'perfilJugador';

/** Id lógico de esta escena de arranque dentro del Shell. */
export const ID_BOOT = 'boot';

/**
 * Escena de arranque del Shell (Requirements 8.1, 1.1).
 *
 * No implementa {@link IEscena}: no es una escena jugable ni participa del
 * Contrato_Compartido (no declara rasgos ni emite telemetría). Es una escena de
 * infraestructura del Shell.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: ID_BOOT });
  }

  /**
   * Precarga de assets COMUNES a todas las Escenas.
   *
   * Carga los spritesheets idle de los tres personajes seleccionables
   * (Requirement 5.1) antes de que la Escena_Seleccion inicie, garantizando
   * reproducción inmediata de las animaciones. Cada spritesheet contiene 4 frames
   * de 32×32 píxeles.
   *
   * Si un asset falla al cargar, se registra el error en consola y la carga
   * continúa sin interrumpir el arranque (Requirement 5.3).
   */
  preload(): void {
    // Registrar handler de error de carga para que un fallo en un spritesheet
    // no interrumpa la transición a la Escena_Seleccion (Requirement 5.3).
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(
        `[BootScene] Failed to load asset: "${file.key}" (${file.url})`,
      );
    });

    // Spritesheets idle para la pantalla de selección de personaje (Requirement 5.1).
    // Cada spritesheet tiene 4 frames de 32×32 píxeles.
    this.load.spritesheet(
      'pink_monster_idle',
      'src/assets/personajes/1 Pink_Monster/Pink_Monster_Idle_4.png',
      { frameWidth: 32, frameHeight: 32 },
    );
    this.load.spritesheet(
      'owlet_monster_idle',
      'src/assets/personajes/2 Owlet_Monster/Owlet_Monster_Idle_4.png',
      { frameWidth: 32, frameHeight: 32 },
    );
    this.load.spritesheet(
      'dude_monster_idle',
      'src/assets/personajes/3 Dude_Monster/Dude_Monster_Idle_4.png',
      { frameWidth: 32, frameHeight: 32 },
    );

    // Spritesheets Run para la pantalla de selección (6 frames de 32×32 cada uno).
    this.load.spritesheet(
      'pink_monster_run',
      'src/assets/personajes/1 Pink_Monster/Pink_Monster_Run_6.png',
      { frameWidth: 32, frameHeight: 32 },
    );
    this.load.spritesheet(
      'owlet_monster_run',
      'src/assets/personajes/2 Owlet_Monster/Owlet_Monster_Run_6.png',
      { frameWidth: 32, frameHeight: 32 },
    );
    this.load.spritesheet(
      'dude_monster_run',
      'src/assets/personajes/3 Dude_Monster/Dude_Monster_Run_6.png',
      { frameWidth: 32, frameHeight: 32 },
    );
  }

  /**
   * Inicializa el Perfil_Jugador neutro, construye el {@link SceneManager} del
   * Shell y arranca la primera Escena a través de él.
   *
   * Se ejecuta una vez completada la precarga. Publica el perfil neutro en el
   * registro global (Requirement 8.1), crea y publica el {@link SceneManager}
   * (que vive toda la sesión — Requirement 8.6), registra las Escenas del
   * {@link REGISTRO_ESCENAS} (Requirement 9.7) y lanza `Nivel_Plataformas`
   * (Requirement 1.1).
   */
  create(): void {
    this.inicializarPerfil();
    this.iniciarPrimeraEscena();
  }

  /**
   * Crea el {@link PerfilJugador} en estado neutro (cuatro Rasgos en `0`,
   * `pesoAcumulado` en `0`) y lo publica en el registro global del juego bajo
   * {@link CLAVE_PERFIL_JUGADOR} (Requirement 8.1).
   *
   * @returns el perfil neutro publicado (útil para pruebas/depuración).
   */
  inicializarPerfil(): PerfilJugador {
    const perfil = crearPerfilInicial();
    this.registry.set(CLAVE_PERFIL_JUGADOR, perfil);
    return perfil;
  }

  /**
   * Construye el {@link SceneManager} del Shell, registra las Escenas y arranca
   * la primera (`Nivel_Plataformas`, Requirement 1.1) a través del flujo del
   * SceneManager (registro declarativo + resolución de perillas + entrega antes
   * de iniciar).
   *
   * El SceneManager se publica en el registro global bajo
   * {@link CLAVE_SCENE_MANAGER} para que persista durante toda la sesión
   * (Requirement 8.6) y quede disponible para depuración.
   *
   * @returns el {@link SceneManager} creado (útil para pruebas/depuración).
   */
  iniciarPrimeraEscena(): SceneManager {
    // Única instancia del Motor_Scoring de la sesión, propiedad del Shell
    // (Requirement 8.3). Registra las declaraciones de las Escenas (Requirement
    // 4.2) y actualiza el Perfil_Jugador acumulado a partir de la telemetría
    // (Requirements 4.3–4.6). El perfil vive en el registro de sesión, que es su
    // única fuente de verdad (Requirement 8.6); el motor es una función pura.
    const motor = new MotorScoring();

    // Hook de resolución real de Perillas_Mutacion (Bedrock + Fallback) que el
    // SceneManager dispara durante la pantalla de carga (Requirements 5.1, 5.6,
    // 8.4). Se construye desde la configuración de entorno: sin backend
    // desplegado (Fase 1) resuelve con la Mutacion_Fallback local y el juego
    // permanece 100% jugable offline (ver shell/configBackend).
    const resolverPerillas = crearResolverPerillas();

    const sceneManager = new SceneManager({
      // `game.scene` y `game.registry` satisfacen estructuralmente las vistas
      // acotadas que el SceneManager consume.
      gestor: this.game.scene as unknown as IGestorEscenas,
      sesion: this.game.registry as unknown as IAlmacenSesion,
      // SEAM 11.3 — Motor_Scoring: actualiza el Perfil_Jugador con la telemetría
      // (Requirements 8.3, 4.3–4.6) y registra qué mide cada Escena (Requirement
      // 4.2).
      actualizarPerfil: (perfil, telemetria) =>
        motor.actualizarPerfil(perfil, telemetria),
      registrarDeclaracion: (escena, decl) =>
        motor.registrarDeclaracion(escena, decl),
      // SEAM 11.3 — Resolución de perillas real durante la carga (Requirements
      // 5.1, 5.6, 8.4). Las perillas resueltas se entregan a la siguiente Escena
      // antes de iniciarla; la Escena las aplica vía su Sistema_Mutacion
      // (Requirement 7.*).
      resolverPerillas,
    });

    this.game.registry.set(CLAVE_SCENE_MANAGER, sceneManager);

    sceneManager.registrarEscenas();
    void sceneManager.iniciar();

    return sceneManager;
  }
}
