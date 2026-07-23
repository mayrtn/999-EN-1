import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { PerfilJugador, EscenaId } from '../contrato';
import { ClienteBackend, crearClienteBackend } from './cliente';

// ---------------------------------------------------------------------------
// Task 6.5 — Unit tests de ejemplo del Cliente Backend
// (fetch mockeado: respuesta válida, error 5xx, red caída, timeout)
// _Requirements: 5.1, 5.6, 6.2, 6.3_
// ---------------------------------------------------------------------------

const ENDPOINT = 'https://backend.example.com/mutacion';
const API_KEY = 'clave-de-prueba-123';

/** Perfil_Jugador de ejemplo (neutro) para las solicitudes de prueba. */
function perfilBase(): PerfilJugador {
  return {
    rasgos: { furia: 0.2, curiosidad: 0.4, logro: 0.6, riesgo: 0.1 },
    pesoAcumulado: { furia: 1, curiosidad: 1, logro: 1, riesgo: 1 },
  };
}

const PROXIMA_ESCENA: EscenaId = 'ritmo';

/**
 * Construye un objeto tipo `Response` mínimo suficiente para el cliente:
 * el cliente solo usa `ok`, `status` y `json()`.
 */
function respuestaFalsa(init: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: init.json ?? (async () => ({})),
  } as unknown as Response;
}

describe('ClienteBackend.pedirMutacion — ejemplos con fetch mockeado', () => {
  // -------------------------------------------------------------------------
  // Respuesta válida (Requirement 5.1)
  // -------------------------------------------------------------------------
  it('resuelve con el JSON parseado y envía POST con headers y body correctos', async () => {
    // Validates: Requirement 5.1
    const perillas = {
      paleta: 'neon',
      intensidad_enemigos: 0.7,
      agresividad: 0.3,
      clima: 'lluvia',
      mood_musica: 'tenso',
      mensaje: 'te observo',
    };

    const fetchImpl = vi.fn(async () =>
      respuestaFalsa({ ok: true, status: 200, json: async () => perillas }),
    );

    const cliente = crearClienteBackend({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const perfil = perfilBase();
    const resultado = await cliente.pedirMutacion(perfil, PROXIMA_ESCENA, {
      timeoutMs: 1000,
    });

    // La respuesta se devuelve tal cual, sin validar su forma.
    expect(resultado).toEqual(perillas);

    // Se llamó exactamente una vez al endpoint configurado.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(ENDPOINT);
    expect(opciones.method).toBe('POST');

    // Headers: content-type json + x-api-key con la API key inyectada.
    const headers = opciones.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['x-api-key']).toBe(API_KEY);

    // Body: JSON con perfil + proximaEscena.
    expect(typeof opciones.body).toBe('string');
    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo).toEqual({ perfil, proximaEscena: PROXIMA_ESCENA });

    // Se pasó una señal de aborto para el timeout.
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
  });

  // -------------------------------------------------------------------------
  // Error 5xx (contexto Requirements 6.2, 6.3)
  // -------------------------------------------------------------------------
  it('rechaza cuando el backend responde con estado 5xx', async () => {
    // Validates: Requirements 6.2, 6.3
    const fetchImpl = vi.fn(async () =>
      respuestaFalsa({ ok: false, status: 500 }),
    );

    const cliente = new ClienteBackend({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      cliente.pedirMutacion(perfilBase(), PROXIMA_ESCENA, { timeoutMs: 1000 }),
    ).rejects.toThrow(/500/);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Red caída / error de red (contexto Requirements 6.2, 6.3)
  // -------------------------------------------------------------------------
  it('rechaza cuando fetch falla por error de red', async () => {
    // Validates: Requirements 6.2, 6.3
    const errorRed = new Error('Failed to fetch');
    const fetchImpl = vi.fn(async () => {
      throw errorRed;
    });

    const cliente = new ClienteBackend({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      cliente.pedirMutacion(perfilBase(), PROXIMA_ESCENA, { timeoutMs: 1000 }),
    ).rejects.toBe(errorRed);
  });
});

// ---------------------------------------------------------------------------
// Respuesta lenta / timeout (Requirement 5.6) — con fake timers
// ---------------------------------------------------------------------------
describe('ClienteBackend.pedirMutacion — timeout y aborto (Requirement 5.6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rechaza por timeout cuando la respuesta tarda más que timeoutMs', async () => {
    // Validates: Requirement 5.6
    // fetch que solo resuelve si NO se aborta; si la señal aborta, rechaza.
    const fetchImpl = vi.fn(
      (_url: string, opciones: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const signal = opciones.signal as AbortSignal;
          if (signal.aborted) {
            reject(signal.reason ?? new Error('aborted'));
            return;
          }
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('aborted')),
            { once: true },
          );
          // Respuesta "lenta": resuelve mucho después del timeout.
          setTimeout(
            () => resolve(respuestaFalsa({ ok: true, status: 200 })),
            10_000,
          );
        }),
    );

    const cliente = new ClienteBackend({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const promesa = cliente.pedirMutacion(perfilBase(), PROXIMA_ESCENA, {
      timeoutMs: 2000,
    });
    // Evita rechazo no manejado antes de aserción.
    const asercion = expect(promesa).rejects.toBeInstanceOf(DOMException);

    // Avanza el tiempo más allá del timeout para disparar el aborto.
    await vi.advanceTimersByTimeAsync(2000);

    await asercion;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rechaza inmediatamente cuando se pasa una señal externa ya abortada', async () => {
    // Validates: Requirement 5.6
    const fetchImpl = vi.fn(
      (_url: string, opciones: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const signal = opciones.signal as AbortSignal;
          if (signal.aborted) {
            reject(signal.reason ?? new Error('aborted'));
            return;
          }
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('aborted')),
            { once: true },
          );
          setTimeout(
            () => resolve(respuestaFalsa({ ok: true, status: 200 })),
            10_000,
          );
        }),
    );

    const cliente = new ClienteBackend({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const externo = new AbortController();
    externo.abort(new Error('cancelado por el llamante'));

    await expect(
      cliente.pedirMutacion(perfilBase(), PROXIMA_ESCENA, {
        timeoutMs: 5000,
        signal: externo.signal,
      }),
    ).rejects.toThrow(/cancelado por el llamante/);
  });

  it('rechaza cuando una señal externa se aborta después de iniciar la solicitud', async () => {
    // Validates: Requirement 5.6
    const fetchImpl = vi.fn(
      (_url: string, opciones: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const signal = opciones.signal as AbortSignal;
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new Error('aborted')),
            { once: true },
          );
          setTimeout(
            () => resolve(respuestaFalsa({ ok: true, status: 200 })),
            10_000,
          );
        }),
    );

    const cliente = new ClienteBackend({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const externo = new AbortController();
    const promesa = cliente.pedirMutacion(perfilBase(), PROXIMA_ESCENA, {
      timeoutMs: 5000,
      signal: externo.signal,
    });
    const asercion = expect(promesa).rejects.toThrow(/interrumpido/);

    externo.abort(new Error('interrumpido por el usuario'));
    await vi.advanceTimersByTimeAsync(0);

    await asercion;
  });
});
