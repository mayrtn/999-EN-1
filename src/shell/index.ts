/**
 * Módulo Shell — orquestación de escenas, transiciones y resolución de perillas.
 *
 * Punto único de importación de la lógica del Shell del cliente. Por ahora
 * expone la resolución de `Perillas_Mutacion` (Bedrock + Fallback) que se dispara
 * durante la pantalla de carga de cada transición (Requirements 5.2–5.6, 6.2,
 * 6.3, 6.5).
 *
 * @module shell
 */

export { resolverPerillas } from './resolucionPerillas';
export type {
  DepsResolucionPerillas,
  ArgsResolucionPerillas,
} from './resolucionPerillas';

export {
  crearResolverPerillas,
  leerConfigBackend,
  TIMEOUT_MUTACION_MS,
} from './configBackend';
export type {
  ResolverPerillasHook,
  OpcionesResolver,
} from './configBackend';

export { BootScene, CLAVE_PERFIL_JUGADOR, ID_BOOT } from './BootScene';

export { LoadingScene, ID_CARGA } from './LoadingScene';

export {
  REGISTRO_ESCENAS,
} from './registroEscenas';
export type { RegistroEscena, EscenaJugable } from './registroEscenas';

export {
  SceneManager,
  PRIMERA_ESCENA,
  CLAVE_SCENE_MANAGER,
} from './SceneManager';
export type {
  IGestorEscenas,
  IAlmacenSesion,
  DepsSceneManager,
} from './SceneManager';
