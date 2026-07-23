/**
 * Cliente del Servicio_Backend (lado navegador).
 *
 * Implementa {@link IClienteBackend} pidiendo las `Perillas_Mutacion` al
 * Servicio_Backend (API Gateway + Lambda + Bedrock) durante la pantalla de carga
 * del Shell (Requirement 5.1). La resolución es asíncrona (Promise) y usa
 * `fetch` + `AbortController` con un `timeoutMs` configurable, de modo que el
 * bucle de frames de Phaser nunca se bloquea esperando a Bedrock
 * (Requirement 5.6).
 *
 * Devuelve `unknown` a propósito: la respuesta del backend es **no confiable**
 * hasta que el Shell la valide contra el conjunto cerrado (Requirements 5.4,
 * 5.5); este cliente NO valida la forma de la respuesta.
 *
 * @module backend/cliente
 */

import type { IClienteBackend, PerfilJugador, EscenaId } from '../contrato';

/**
 * Configuración del cliente. El endpoint y la API key se inyectan; **no se
 * hardcodean secretos** aquí (Requirement 10.6). Ambos provienen de la
 * configuración de despliegue (build/env) y se pasan al construir el cliente.
 */
export interface ConfigClienteBackend {
  /** URL absoluta del endpoint de mutación del Servicio_Backend. */
  endpoint: string;
  /** API key enviada en el header `x-api-key` para autorizar la solicitud. */
  apiKey: string;
  /**
   * Implementación de `fetch` a usar. Por defecto el `fetch` global del
   * navegador; inyectable para pruebas.
   */
  fetchImpl?: typeof fetch;
}

/**
 * Cliente HTTP del Servicio_Backend.
 *
 * @see IClienteBackend
 */
export class ClienteBackend implements IClienteBackend {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ConfigClienteBackend) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Solicita las `Perillas_Mutacion` remotas para la próxima Escena
   * (Requirement 5.1).
   *
   * Realiza un `POST` JSON `{ perfil, proximaEscena }` al endpoint configurado,
   * incluyendo el header `x-api-key`. Aborta la solicitud cuando transcurre
   * `timeoutMs`; si se pasa un `signal` externo, cualquiera de los dos puede
   * abortar. La respuesta se devuelve como `unknown` (no confiable) para que la
   * validación ocurra en el Shell (Requirements 5.4, 5.5).
   *
   * @param perfil - Perfil_Jugador acumulado a enviar al backend.
   * @param proximaEscena - Escena hacia la que se transiciona.
   * @param opts - `timeoutMs` obligatorio y `signal` opcional del llamante.
   * @returns La respuesta JSON parseada como `unknown`.
   * @throws Rechaza en timeout (abort), error de red o estado HTTP no OK (>=400).
   */
  async pedirMutacion(
    perfil: PerfilJugador,
    proximaEscena: EscenaId,
    opts: { timeoutMs: number; signal?: AbortSignal }
  ): Promise<unknown> {
    const controller = new AbortController();

    // Combina la señal externa (si existe) con el aborto por timeout: cualquiera
    // de los dos puede cancelar la solicitud (Requirement 5.6).
    const abortarPorExterno = (): void => {
      controller.abort(opts.signal?.reason);
    };
    if (opts.signal) {
      if (opts.signal.aborted) {
        controller.abort(opts.signal.reason);
      } else {
        opts.signal.addEventListener('abort', abortarPorExterno, { once: true });
      }
    }

    const timeoutId = setTimeout(() => {
      controller.abort(new DOMException('Timeout esperando al Servicio_Backend', 'TimeoutError'));
    }, opts.timeoutMs);

    try {
      const respuesta = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({ perfil, proximaEscena }),
        signal: controller.signal,
      });

      // Estado HTTP no OK (>=400): 4xx/5xx se tratan como fallo → el Shell
      // caerá a la Mutacion_Fallback (Requirements 6.2, 6.3).
      if (!respuesta.ok) {
        throw new Error(
          `Servicio_Backend respondió con estado HTTP ${respuesta.status}`
        );
      }

      // La respuesta es deliberadamente `unknown`: no se valida su forma aquí.
      return (await respuesta.json()) as unknown;
    } finally {
      // Limpieza del timeout para evitar fugas (Requirement 5.6).
      clearTimeout(timeoutId);
      if (opts.signal) {
        opts.signal.removeEventListener('abort', abortarPorExterno);
      }
    }
  }
}

/**
 * Factory de conveniencia para crear un {@link ClienteBackend}.
 *
 * @param config - Configuración con endpoint y API key inyectados.
 */
export function crearClienteBackend(
  config: ConfigClienteBackend
): IClienteBackend {
  return new ClienteBackend(config);
}
