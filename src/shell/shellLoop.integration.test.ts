/**
 * Test de integración del loop del Shell (Task 11.4).
 *
 * Cablea los colaboradores REALES del loop de transición del Shell —
 * {@link SceneManager} real + {@link MotorScoring} real + {@link resolverPerillas}
 * real + {@link ClienteBackend} real— y mockea SÓLO las fronteras externas:
 * Phaser (entorno `node`, sin DOM/canvas) y el HTTP del backend (`fetchImpl`
 * inyectado). Es un test de ejemplo end-to-end (NO property-based).
 *
 * Verifica el flujo completo del diagrama de secuencia del loop de transición
 * (design.md):
 *
 *   escena termina → reporta Telemetria_Rasgos → Motor_Scoring actualiza el
 *   Perfil_Jugador en la sesión (Req 8.3) → se solicita una transición →
 *   pantalla de carga (Req 8.2) → resolución de perillas durante la carga
 *   (Req 5.1, 5.6) → la siguiente Escena arranca con las perillas resueltas,
 *   entregadas antes de iniciarla (Req 8.4).
 *
 * Escenarios de la frontera de red:
 *   (a) backend responde JSON de perillas VÁLIDO → la Escena recibe ESAS
 *       perillas remotas (Req 5.1) y satisfacen `esPerillasValidas`.
 *   (b) backend falla (rechazo de red / 5xx) → la Escena recibe la
 *       Mutacion_Fallback (siempre válida), probando que el juego avanza sin
 *       backend (Req 5.6 / fallback).
 *
 * _Requirements: 8.2, 8.3, 8.4, 5.1, 5.6_
 */

import { describe, it, expect, vi } from 'vitest';

// Mock mínimo de Phaser (mismo patrón que SceneManager.test.ts): el entorno de
// test es `node` (sin DOM/canvas). Se sustituye Phaser por un doble con lo que
// consume esta cadena de imports: la clase base `Scene`, el evento
// `Scenes.Events.CREATE` y helpers de `Math` referenciados al importar módulos.
vi.mock('phaser', () => {
  class Scene {
    constructor(_config?: unknown) {
      // no-op: no arrancamos el ciclo de vida de Phaser en los tests.
    }
  }
  const Clamp = (v: number, min: number, max: number): number =>
    globalThis.Math.min(globalThis.Math.max(v, min), max);
  return {
    default: {
      Scene,
      Math: { Clamp, Distance: { Between: () => 0 } },
      Scenes: { Events: { CREATE: 'create' } },
    },
  };
});

import {
  SceneManager,
  type IGestorEscenas,
  type IAlmacenSesion,
} from './SceneManager';
import { ID_CARGA } from './LoadingScene';
import { CLAVE_PERFIL_JUGADOR } from './BootScene';
import { resolverPerillas } from './resolucionPerillas';
import type { RegistroEscena, EscenaJugable } from './registroEscenas';
import { ClienteBackend } from '../backend/cliente';
import { MotorScoring, crearPerfilInicial } from '../motor';
import { calcularFallback, esPerillasValidas } from '../mutacion';
import type {
  EscenaId,
  InputUnificado,
  PerillasMutacion,
  PerfilJugador,
  TelemetriaRasgos,
} from '../contrato';

// ============================================================================
// Dobles de test (mismo patrón que SceneManager.test.ts)
// ============================================================================

/** Registro de una llamada al gestor de escenas (para aserciones de orden). */
interface LlamadaGestor {
  metodo: 'add' | 'start' | 'stop';
  clave: string;
  datos?: object;
}

/**
 * Doble de una Escena jugable: invoca el callback de `CREATE` de inmediato
 * (simula el fin de `create()`, donde se inyecta el input) y declara rasgos para
 * ejercitar el registro en el Motor_Scoring real (Requirement 4.2).
 */
function crearEscenaDoble(
  id: EscenaId
): EscenaJugable & { setInput: ReturnType<typeof vi.fn> } {
  const setInput = vi.fn();
  const escena = {
    id,
    setInput,
    declararRasgos: () => ({
      oportunidadMaxima: { furia: 4, curiosidad: 4, logro: 4, riesgo: 4 },
    }),
    sys: {
      events: {
        // Ejecuta el listener de CREATE inmediatamente (simula create() hecho).
        once: (_evento: string, cb: () => void) => cb(),
      },
    },
  };
  return escena as unknown as EscenaJugable & { setInput: typeof setInput };
}

/** Doble del gestor de escenas de Phaser que registra las llamadas. */
function crearGestorDoble(): {
  gestor: IGestorEscenas;
  llamadas: LlamadaGestor[];
  escenas: Map<string, EscenaJugable & { setInput: ReturnType<typeof vi.fn> }>;
} {
  const llamadas: LlamadaGestor[] = [];
  const escenas = new Map<
    string,
    EscenaJugable & { setInput: ReturnType<typeof vi.fn> }
  >();

  const gestor: IGestorEscenas = {
    add(clave, _escena, _iniciar) {
      llamadas.push({ metodo: 'add', clave });
      if (clave !== ID_CARGA) {
        escenas.set(clave, crearEscenaDoble(clave as EscenaId));
      }
      return undefined;
    },
    start(clave, datos) {
      llamadas.push({ metodo: 'start', clave, datos });
      return undefined;
    },
    stop(clave) {
      llamadas.push({ metodo: 'stop', clave });
      return undefined;
    },
    getScene(clave) {
      return escenas.get(clave) ?? null;
    },
  };

  return { gestor, llamadas, escenas };
}

/** Doble del almacén de sesión (equivalente a `game.registry`), Map-backed. */
function crearSesionDoble(): IAlmacenSesion {
  const datos = new Map<string, unknown>();
  return {
    get: (clave) => datos.get(clave),
    set: (clave, valor) => {
      datos.set(clave, valor);
    },
  };
}

/** Registro de prueba: plataformas + ritmo habilitadas (shooter también, útil). */
const REGISTRO_PRUEBA: RegistroEscena[] = [
  { id: 'plataformas', crear: () => crearEscenaDoble('plataformas'), habilitada: true },
  { id: 'ritmo', crear: () => crearEscenaDoble('ritmo'), habilitada: true },
  { id: 'shooter', crear: () => crearEscenaDoble('shooter'), habilitada: true },
];

/** Input de prueba neutro (sustituye al InputTeclado real, sin DOM). */
const inputDoble: InputUnificado = {
  direccion: () => ({ x: 0, y: 0 }),
  accionPrimaria: () => false,
  accionPrimariaJustPressed: () => false,
  accionSecundaria: () => false,
  accionSecundariaJustPressed: () => false,
  pausa: () => false,
};

// ============================================================================
// Frontera HTTP mockeada: dobles de `fetch` (única frontera externa mockeada)
// ============================================================================

/** `fetch` que responde 200 OK con `json` como cuerpo (backend disponible). */
function fetchQueResponde(json: unknown): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => json,
  })) as unknown as typeof fetch;
}

/** `fetch` que rechaza (red caída / error de conexión). */
function fetchQueRechaza(): typeof fetch {
  return vi.fn(async () => {
    throw new TypeError('Servicio_Backend inalcanzable (red caída)');
  }) as unknown as typeof fetch;
}

/** `fetch` que responde 5xx (el cliente lo trata como fallo → fallback). */
function fetchQueFalla5xx(): typeof fetch {
  return vi.fn(async () => ({
    ok: false,
    status: 503,
    json: async () => ({}),
  })) as unknown as typeof fetch;
}

// ============================================================================
// Cableado real del loop del Shell (como lo hace BootScene), backend mockeado
// ============================================================================

const TIMEOUT_MS = 2000;

/**
 * Construye un SceneManager con los colaboradores REALES (Motor_Scoring,
 * resolverPerillas, ClienteBackend), inyectando sólo el `fetchImpl` de la
 * frontera HTTP y dobles de Phaser. Réplica del cableado de `BootScene`.
 */
function crearEntorno(fetchImpl: typeof fetch) {
  const { gestor, llamadas, escenas } = crearGestorDoble();
  const sesion = crearSesionDoble();
  // Perfil neutro inicial (todos los rasgos en 0), como haría la BootScene.
  sesion.set(CLAVE_PERFIL_JUGADOR, crearPerfilInicial());

  // Motor_Scoring real: única instancia de la sesión (como en BootScene).
  const motor = new MotorScoring();

  // Cliente del Servicio_Backend REAL, con la frontera HTTP mockeada.
  const cliente = new ClienteBackend({
    endpoint: 'https://test.local/mutacion',
    apiKey: 'test-api-key',
    fetchImpl,
  });

  // Hook de resolución REAL (Bedrock + Fallback en paralelo), como BootScene.
  const resolverPerillasHook = (
    perfil: Readonly<PerfilJugador>,
    destino: EscenaId
  ): Promise<PerillasMutacion> =>
    resolverPerillas(
      { cliente },
      { perfil: perfil as PerfilJugador, proximaEscena: destino, timeoutMs: TIMEOUT_MS }
    );

  const sm = new SceneManager({
    gestor,
    sesion,
    registro: REGISTRO_PRUEBA,
    // Motor_Scoring real cableado (Requirements 8.3, 4.2, 4.3–4.6).
    actualizarPerfil: (perfil, telemetria) => motor.actualizarPerfil(perfil, telemetria),
    registrarDeclaracion: (escena, decl) => motor.registrarDeclaracion(escena, decl),
    // Resolución real de perillas durante la carga (Requirements 5.1, 5.6, 8.4).
    resolverPerillas: resolverPerillasHook,
    // Input neutro (sin teclado de Phaser en entorno node).
    construirInput: () => inputDoble,
  });

  return { sm, gestor, llamadas, escenas, sesion, motor };
}

/** Telemetría con señal/oportunidad no nulas (una escena "que terminó"). */
function telemetriaConSenal(escena: EscenaId): TelemetriaRasgos {
  return {
    escena,
    porRasgo: {
      furia: { senal: 2, oportunidad: 4 }, // score 0.5
      curiosidad: { senal: 0, oportunidad: 0 }, // no medido (peso 0)
      logro: { senal: 10, oportunidad: 20 }, // score 0.5
      riesgo: { senal: 3, oportunidad: 6 }, // score 0.5
    },
  };
}

/** Extrae las perillas entregadas en el último `start` de una Escena. */
function perillasEntregadas(
  llamadas: LlamadaGestor[],
  clave: EscenaId
): PerillasMutacion | undefined {
  const starts = llamadas.filter((l) => l.metodo === 'start' && l.clave === clave);
  const ultimo = starts[starts.length - 1];
  const datos = ultimo?.datos as { perillas?: PerillasMutacion } | undefined;
  return datos?.perillas;
}

// ============================================================================
// Tests
// ============================================================================

describe('Shell loop — integración end-to-end (backend mockeado)', () => {
  // Perillas remotas válidas que "devuelve Bedrock" en el escenario (a).
  const perillasRemotas: PerillasMutacion = {
    paleta: 'neon',
    intensidad_enemigos: 0.25,
    agresividad: 0.75,
    clima: 'lluvia',
    mood_musica: 'epico',
    mensaje: 'El neón late con tu ritmo.',
  };

  it('(a) flujo completo con backend VÁLIDO: telemetría → perfil → carga → perillas remotas aplicadas', async () => {
    const { sm, llamadas } = crearEntorno(fetchQueResponde(perillasRemotas));
    sm.registrarEscenas();

    // Arranca la primera Escena (plataformas) con perillas resueltas y SIN carga
    // (el arranque inicial no es una transición solicitada, Requirement 8.2).
    await sm.iniciar();
    expect(llamadas.some((l) => l.metodo === 'start' && l.clave === 'plataformas')).toBe(true);
    expect(
      llamadas.some((l) => l.metodo === 'start' && l.clave === ID_CARGA)
    ).toBe(false);

    // La escena "termina": reporta su telemetría y solicita transición a ritmo.
    sm.reportarTelemetria(telemetriaConSenal('plataformas'));
    sm.solicitarTransicion('ritmo');

    // Espera a que la transición asíncrona arranque la Escena destino.
    await vi.waitFor(() =>
      expect(llamadas.some((l) => l.metodo === 'start' && l.clave === 'ritmo')).toBe(true)
    );

    // (Req 8.3) El Motor_Scoring actualizó el Perfil_Jugador en la sesión: un
    // rasgo medido pasó de 0 a su score (logro: 10/20 = 0.5).
    const perfil = sm.obtenerPerfil();
    expect(perfil.rasgos.logro).toBeCloseTo(0.5, 10);
    expect(perfil.rasgos.furia).toBeCloseTo(0.5, 10);
    // curiosidad no fue medido (oportunidad 0) → permanece en 0 (Requirement 4.5).
    expect(perfil.rasgos.curiosidad).toBe(0);

    // (Req 8.2) Se mostró la pantalla de carga y luego se ocultó, en orden:
    // detener actual → mostrar carga → arrancar destino.
    const idxStop = llamadas.findIndex((l) => l.metodo === 'stop' && l.clave === 'plataformas');
    const idxCargaOn = llamadas.findIndex((l) => l.metodo === 'start' && l.clave === ID_CARGA);
    const idxCargaOff = llamadas.findIndex((l) => l.metodo === 'stop' && l.clave === ID_CARGA);
    const idxDestino = llamadas.findIndex((l) => l.metodo === 'start' && l.clave === 'ritmo');
    expect(idxStop).toBeGreaterThanOrEqual(0);
    expect(idxCargaOn).toBeGreaterThan(idxStop);
    expect(idxDestino).toBeGreaterThan(idxCargaOn);
    expect(idxCargaOff).toBeGreaterThan(idxCargaOn);
    expect(idxCargaOff).toBeLessThanOrEqual(idxDestino);

    // (Req 8.4 / 5.1) La Escena destino recibió las perillas resueltas ANTES de
    // iniciarla, y son EXACTAMENTE las remotas válidas (validadas por el Shell).
    const entregadas = perillasEntregadas(llamadas, 'ritmo');
    expect(entregadas && esPerillasValidas(entregadas)).toBe(true);
    expect(entregadas).toEqual(perillasRemotas);
  });

  it('(b) flujo completo con backend caído (red): la Escena recibe el fallback válido', async () => {
    const { sm, llamadas } = crearEntorno(fetchQueRechaza());
    sm.registrarEscenas();
    await sm.iniciar();

    sm.reportarTelemetria(telemetriaConSenal('plataformas'));
    sm.solicitarTransicion('ritmo');

    await vi.waitFor(() =>
      expect(llamadas.some((l) => l.metodo === 'start' && l.clave === 'ritmo')).toBe(true)
    );

    // (Req 8.3) El perfil se actualizó igual (independiente del backend).
    const perfil = sm.obtenerPerfil();
    expect(perfil.rasgos.logro).toBeCloseTo(0.5, 10);

    // (Req 5.6 / fallback) El juego avanzó sin backend: la Escena recibió las
    // perillas del fallback heurístico local, que son válidas y coinciden con
    // calcularFallback(perfil) — probando que se usó el fallback, no lo remoto.
    const entregadas = perillasEntregadas(llamadas, 'ritmo');
    expect(entregadas && esPerillasValidas(entregadas)).toBe(true);
    expect(entregadas).toEqual(calcularFallback(perfil as PerfilJugador));
  });

  it('(b) flujo completo con backend 5xx: la Escena recibe el fallback válido', async () => {
    const { sm, llamadas } = crearEntorno(fetchQueFalla5xx());
    sm.registrarEscenas();
    await sm.iniciar();

    sm.reportarTelemetria(telemetriaConSenal('plataformas'));
    sm.solicitarTransicion('ritmo');

    await vi.waitFor(() =>
      expect(llamadas.some((l) => l.metodo === 'start' && l.clave === 'ritmo')).toBe(true)
    );

    const perfil = sm.obtenerPerfil();
    const entregadas = perillasEntregadas(llamadas, 'ritmo');
    expect(entregadas && esPerillasValidas(entregadas)).toBe(true);
    expect(entregadas).toEqual(calcularFallback(perfil as PerfilJugador));
    // No es (necesariamente) igual a las remotas: nunca llegaron.
    expect(entregadas).not.toEqual(perillasRemotas);
  });

  it('(Req 8.5) retorno al Nivel_Plataformas tras un nivel oculto, con perillas resueltas', async () => {
    const { sm, llamadas } = crearEntorno(fetchQueResponde(perillasRemotas));
    sm.registrarEscenas();
    await sm.iniciar();

    // Entra al nivel oculto 'ritmo'.
    sm.reportarTelemetria(telemetriaConSenal('plataformas'));
    sm.solicitarTransicion('ritmo');
    await vi.waitFor(() =>
      expect(llamadas.some((l) => l.metodo === 'start' && l.clave === 'ritmo')).toBe(true)
    );

    // El nivel oculto termina y solicita retorno a 'plataformas'.
    sm.reportarTelemetria(telemetriaConSenal('ritmo'));
    sm.solicitarTransicion('plataformas');
    await vi.waitFor(() =>
      expect(
        llamadas.filter((l) => l.metodo === 'start' && l.clave === 'plataformas').length
      ).toBeGreaterThanOrEqual(2)
    );

    // El retorno arranca 'plataformas' con perillas resueltas y válidas.
    const entregadas = perillasEntregadas(llamadas, 'plataformas');
    expect(entregadas && esPerillasValidas(entregadas)).toBe(true);
    expect(entregadas).toEqual(perillasRemotas);
  });
});
