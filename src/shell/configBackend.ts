/**
 * Configuración del Servicio_Backend y factoría del resolver de perillas (Shell).
 *
 * Este módulo cablea la **resolución real de Perillas_Mutacion** del Shell
 * (tarea 11.3): construye el {@link ClienteBackend} a partir de la configuración
 * de despliegue y expone una factoría {@link crearResolverPerillas} que produce
 * el *hook* de resolución que el {@link SceneManager} dispara durante la pantalla
 * de carga de cada transición (Requirements 5.1, 5.6, 8.4).
 *
 * ## Configuración por entorno (Requirement 10.6)
 *
 * El endpoint y la API key **no se hardcodean**: se leen de las variables de
 * entorno de build de Vite `import.meta.env.VITE_MUTACION_ENDPOINT` y
 * `VITE_MUTACION_API_KEY` (ver `src/vite-env.d.ts`). Así, un secreto nunca vive
 * en el código fuente y el despliegue inyecta ambos valores.
 *
 * ## Fase 1 sin backend desplegado — juego 100% jugable offline
 *
 * En Fase 1 no hay backend (Bedrock) desplegado, por lo que estas variables
 * quedan indefinidas. El enfoque elegido (documentado) es **omitir el cliente
 * por completo** cuando no hay configuración válida: la factoría devuelve un
 * resolver que va directo a la {@link calcularFallback} local (heurística que
 * SIEMPRE produce perillas válidas del conjunto cerrado — Requirements 6.1, 6.4).
 * Se prefiere esta vía a "un cliente cuyo fetch rechaza" porque evita trabajo
 * asíncrono inútil (una llamada de red destinada a fallar) y deja explícito que
 * la resolución es puramente local. El resultado observable es idéntico: el
 * juego avanza sin bloquearse (Requirement 5.6) con perillas válidas.
 *
 * Cuando el backend exista (Fase 3), basta con definir ambas variables de
 * entorno: la misma factoría construirá el cliente real y `resolverPerillas`
 * correrá la llamada a Bedrock en paralelo con el fallback, eligiendo la remota
 * sólo si es válida y llega a tiempo (Requirements 5.2–5.5).
 *
 * @module shell/configBackend
 * @see Requirements 5.1, 5.6, 6.1, 6.4, 10.6
 */

import type {
  EscenaId,
  PerfilJugador,
  PerillasMutacion,
} from '../contrato';
import { crearClienteBackend, type ConfigClienteBackend } from '../backend/cliente';
import { calcularFallback } from '../mutacion';
import { resolverPerillas } from './resolucionPerillas';

/**
 * Presupuesto de tiempo por defecto para la respuesta remota, dentro de la
 * ventana de la pantalla de carga (design.md recomienda 1500–2500 ms). Al
 * vencer, la resolución completa con la `Mutacion_Fallback` (Requirements 5.6,
 * 6.2, 6.5).
 */
export const TIMEOUT_MUTACION_MS = 2000;

/**
 * Firma del *hook* de resolución de perillas que consume el {@link SceneManager}
 * (seam {@link DepsSceneManager.resolverPerillas}). Recibe el perfil acumulado y
 * la Escena destino, y resuelve —sin bloquear— con perillas válidas.
 */
export type ResolverPerillasHook = (
  perfil: Readonly<PerfilJugador>,
  destino: EscenaId
) => Promise<PerillasMutacion>;

/**
 * Lee la configuración del Servicio_Backend desde el entorno de build de Vite
 * (Requirement 10.6). Devuelve `null` si falta el endpoint o la API key (caso
 * Fase 1 sin backend): el llamador debe entonces resolver sólo con el fallback.
 *
 * Acceso defensivo a `import.meta.env` para no romper en entornos que no lo
 * definan.
 *
 * @returns La configuración con `endpoint` y `apiKey`, o `null` si no está
 *   completamente configurada.
 */
export function leerConfigBackend(): ConfigClienteBackend | null {
  const env: Partial<ImportMetaEnv> = import.meta.env ?? {};
  const endpoint = env.VITE_MUTACION_ENDPOINT;
  const apiKey = env.VITE_MUTACION_API_KEY;

  if (
    typeof endpoint === 'string' &&
    endpoint.length > 0 &&
    typeof apiKey === 'string' &&
    apiKey.length > 0
  ) {
    return { endpoint, apiKey };
  }
  return null;
}

/**
 * Opciones de la factoría del resolver.
 */
export interface OpcionesResolver {
  /**
   * Configuración explícita del backend. Por defecto se lee del entorno con
   * {@link leerConfigBackend}. Inyectable para pruebas o para forzar un cliente.
   */
  config?: ConfigClienteBackend | null;
  /**
   * Presupuesto de tiempo de la llamada remota. Por defecto
   * {@link TIMEOUT_MUTACION_MS}.
   */
  timeoutMs?: number;
}

/**
 * Construye el *hook* de resolución de perillas que el {@link SceneManager} usa
 * durante la carga (Requirements 5.1, 5.6, 8.4).
 *
 * - Si hay configuración de backend válida (endpoint + API key), construye un
 *   {@link ClienteBackend} y devuelve un resolver que ejecuta la orquestación
 *   real {@link resolverPerillas}: llamada a Bedrock en paralelo con el fallback,
 *   validación estricta de la respuesta y elección de la remota sólo si es válida
 *   y llega a tiempo (Requirements 5.2–5.6).
 * - Si NO hay configuración (Fase 1 offline), devuelve un resolver que va directo
 *   a {@link calcularFallback} (siempre válido, sin trabajo de red inútil): el
 *   juego permanece 100% jugable sin backend.
 *
 * En ambos casos el resolver **nunca bloquea** el bucle de frames y **siempre**
 * resuelve con perillas válidas del conjunto cerrado (Requirements 5.6, 6.4).
 *
 * @param opciones - Configuración opcional (por defecto se lee del entorno).
 * @returns El *hook* listo para inyectar en {@link DepsSceneManager.resolverPerillas}.
 */
export function crearResolverPerillas(
  opciones: OpcionesResolver = {}
): ResolverPerillasHook {
  const config = opciones.config ?? leerConfigBackend();
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MUTACION_MS;

  // Sin backend configurado (Fase 1): resolución puramente local con el fallback
  // heurístico, siempre válido (Requirements 6.1, 6.4). Documentado arriba.
  if (!config) {
    return (perfil) =>
      Promise.resolve(calcularFallback(perfil as PerfilJugador));
  }

  // Backend configurado: orquestación real Bedrock + Fallback (Requirements 5.2–5.6).
  const cliente = crearClienteBackend(config);
  return (perfil, destino) =>
    resolverPerillas(
      { cliente },
      {
        perfil: perfil as PerfilJugador,
        proximaEscena: destino,
        timeoutMs,
      }
    );
}
