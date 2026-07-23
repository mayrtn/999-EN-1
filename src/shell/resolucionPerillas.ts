/**
 * Resolución de Perillas_Mutacion del Shell (orquestación Bedrock + Fallback).
 *
 * Implementa el paso central del loop de transición del Shell: durante la
 * pantalla de carga se pide al Servicio_Backend (Bedrock) unas
 * `Perillas_Mutacion` para la próxima Escena y, **en paralelo**, se calcula una
 * `Mutacion_Fallback` heurística local. La resolución elige la respuesta remota
 * solo si es válida y llega a tiempo; en cualquier otro caso (inválida, error,
 * red caída, timeout) usa el fallback. Nunca bloquea el bucle de frames: todo es
 * asíncrono (Promise) y siempre completa dentro de la ventana de timeout con
 * unas perillas válidas.
 *
 * Diseño de referencia: sección "Integración Bedrock + Fallback" y el diagrama
 * de secuencia del loop de transición de design.md.
 *
 * Esta lógica es **pura orquestación** sobre sus colaboradores (no depende de
 * Phaser), por lo que es unit/property-testeable con un {@link IClienteBackend}
 * falso (respuestas lentas, rechazos, válidas, inválidas o malformadas).
 *
 * @module shell/resolucionPerillas
 * @see Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 6.2, 6.3, 6.5
 */

import type {
  IClienteBackend,
  PerfilJugador,
  EscenaId,
  PerillasMutacion,
} from '../contrato';
import { calcularFallback, sanitizarPerillas } from '../mutacion';

/**
 * Colaboradores inyectables de la resolución de perillas.
 *
 * El {@link IClienteBackend} es obligatorio; las funciones puras
 * ({@link calcularFallback}, {@link sanitizarPerillas}) se inyectan de forma
 * opcional para facilitar el testing (por defecto usan las implementaciones
 * reales del módulo `mutacion`).
 */
export interface DepsResolucionPerillas {
  /** Cliente del Servicio_Backend (Requirement 5.1). Devuelve `unknown`. */
  cliente: IClienteBackend;
  /**
   * Heurística local `PerfilJugador → PerillasMutacion` (Requirements 6.1, 6.4).
   * Por defecto {@link calcularFallback}. Siempre produce perillas válidas.
   */
  calcularFallback?: (perfil: PerfilJugador) => PerillasMutacion;
  /**
   * Saneador/validador estricto de la respuesta remota (Requirements 5.4, 5.5).
   * Por defecto {@link sanitizarPerillas}: recorta un `mensaje` demasiado largo
   * de forma defensiva y valida contra el conjunto cerrado; devuelve `null` si
   * la respuesta no es válida por cualquier otro motivo.
   */
  sanitizar?: (x: unknown) => PerillasMutacion | null;
}

/**
 * Argumentos de una resolución de perillas para una transición concreta.
 */
export interface ArgsResolucionPerillas {
  /** Perfil_Jugador acumulado a enviar al backend y a la heurística. */
  perfil: PerfilJugador;
  /** Escena hacia la que se transiciona (contexto para la IA). */
  proximaEscena: EscenaId;
  /**
   * Presupuesto de tiempo para la respuesta remota (Requirements 5.6, 6.2, 6.5).
   * Al vencer, la resolución completa con la `Mutacion_Fallback`.
   */
  timeoutMs: number;
  /** Señal externa opcional para cancelar la resolución desde el llamador. */
  signal?: AbortSignal;
}

/** Centinela interno para distinguir el vencimiento del timeout en la carrera. */
const TIMEOUT = Symbol('resolucionPerillas.timeout');

/**
 * Resuelve las `Perillas_Mutacion` de una transición combinando la llamada
 * remota a Bedrock con la `Mutacion_Fallback` local (Requirements 5.2–5.6, 6.2,
 * 6.3, 6.5).
 *
 * Comportamiento garantizado:
 * - Calcula el fallback **sincrónicamente al inicio**: es la respuesta siempre
 *   lista y siempre válida (Requirements 6.1, 6.4).
 * - Lanza la llamada remota `cliente.pedirMutacion(...)` en paralelo, sin
 *   esperar de forma bloqueante (Requirement 5.6).
 * - Si la respuesta remota resuelve, la valida con `sanitizar`
 *   ({@link sanitizarPerillas}): si es válida (y llegó dentro del timeout) usa la
 *   remota (Requirements 5.3, 5.4); si es inválida usa el fallback
 *   (Requirement 5.5).
 * - Si la remota rechaza (timeout, red, 5xx, 401) usa el fallback
 *   (Requirements 6.2, 6.3).
 * - Aunque `pedirMutacion` arroje de forma síncrona, se devuelve el fallback.
 * - La resolución **siempre** completa dentro de `timeoutMs` con perillas
 *   válidas: nunca queda colgada esperando a Bedrock (Requirements 5.6, 6.5).
 *   Aun si el cliente ignora su propio timeout, esta función corta la espera con
 *   una carrera interna y aborta la solicitud pendiente.
 *
 * El `PerillasMutacion` devuelto es **siempre válido**: proviene de una respuesta
 * remota validada o del fallback.
 *
 * @param deps - Colaboradores inyectables (cliente + funciones puras).
 * @param args - Perfil, escena destino, timeout y señal opcional.
 * @returns Perillas válidas (remotas validadas o del fallback). Nunca rechaza.
 */
export async function resolverPerillas(
  deps: DepsResolucionPerillas,
  args: ArgsResolucionPerillas
): Promise<PerillasMutacion> {
  const calcularFb = deps.calcularFallback ?? calcularFallback;
  const sanitizar = deps.sanitizar ?? sanitizarPerillas;
  const { perfil, proximaEscena, timeoutMs, signal } = args;

  // 1) Respuesta garantizada: se calcula al inicio, siempre lista y válida
  //    (Requirements 6.1, 6.4). Si todo lo remoto falla, esta es la respuesta.
  const fallback = calcularFb(perfil);

  // 2) Controlador propio para poder abortar la solicitud remota al vencer el
  //    timeout interno o al abortar la señal externa (Requirement 5.6).
  const controller = new AbortController();
  const abortarPorExterno = (): void => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener('abort', abortarPorExterno, { once: true });
    }
  }

  // 3) Llamada remota en paralelo (Requirement 5.2). El envoltorio `async`
  //    captura incluso un throw síncrono de `pedirMutacion` como rechazo, de
  //    modo que el `catch` de la carrera devuelva el fallback de forma robusta.
  const remota: Promise<{ ok: true; valor: unknown } | { ok: false }> = (async () =>
    deps.cliente.pedirMutacion(perfil, proximaEscena, {
      timeoutMs,
      signal: controller.signal,
    }))()
    .then((valor) => ({ ok: true as const, valor }))
    .catch(() => ({ ok: false as const }));

  // 4) Carrera contra el timeout: la resolución nunca se cuelga esperando a
  //    Bedrock (Requirements 5.6, 6.5), aun si el cliente ignora su timeout.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const carreraTimeout = new Promise<typeof TIMEOUT>((resolve) => {
    timeoutId = setTimeout(() => resolve(TIMEOUT), timeoutMs);
  });

  try {
    const resultado = await Promise.race([remota, carreraTimeout]);

    // 4a) Venció el timeout antes de que la remota resolviera → fallback y
    //     aborta la solicitud pendiente (Requirements 6.2, 6.5).
    if (resultado === TIMEOUT) {
      controller.abort(
        new DOMException('Timeout resolviendo Perillas_Mutacion', 'TimeoutError')
      );
      return fallback;
    }

    // 4b) La remota rechazó (red, 5xx, 401, abort) → fallback
    //     (Requirements 6.2, 6.3).
    if (!resultado.ok) {
      return fallback;
    }

    // 4c) La remota resolvió a tiempo: validar contra el conjunto cerrado
    //     (Requirements 5.3, 5.4). Si es válida se usa; si no, fallback
    //     (Requirement 5.5). `sanitizar` recorta defensivamente el mensaje.
    const validas = sanitizar(resultado.valor);
    return validas ?? fallback;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', abortarPorExterno);
  }
}
