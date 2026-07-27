/**
 * Unit tests del {@link SceneManager} (Task 11.2).
 *
 * Cubren la orquestación pura del Shell con dobles de test (sin Phaser real):
 * - Registro declarativo: sólo se registran las Escenas habilitadas + la carga
 *   (Requirement 9.7).
 * - Arranque: la primera Escena recibe perillas resueltas antes de iniciarse
 *   (Requirements 1.1, 8.4) y NO muestra pantalla de carga.
 * - Transiciones solicitadas: muestran la pantalla de carga, detienen la Escena
 *   actual y arrancan el destino con sus perillas (Requirements 8.2, 8.4).
 * - Retorno al Nivel_Plataformas desde un nivel oculto (Requirement 8.5).
 * - Perfil_Jugador como única fuente de verdad en el almacén de sesión
 *   (Requirement 8.6) y seam del Motor_Scoring en `reportarTelemetria`.
 * - Inyección del InputUnificado vía `setInput` al crearse la Escena.
 * - Transición a Escena no habilitada: se ignora sin romper el flujo.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock mínimo de Phaser: el entorno de test es `node` (sin DOM/canvas), así que
// se sustituye Phaser por un doble con lo que consume esta cadena de imports:
// la clase base `Scene`, el constante de evento `Scenes.Events.CREATE` y helpers
// de `Math` referenciados por las Escenas al importarse.
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
  CLAVE_SCENE_MANAGER,
  PRIMERA_ESCENA,
  type IGestorEscenas,
  type IAlmacenSesion,
} from './SceneManager';
import { ID_CARGA } from './LoadingScene';
import { CLAVE_PERFIL_JUGADOR } from './BootScene';
import type { RegistroEscena, EscenaJugable } from './registroEscenas';
import { crearPerfilInicial } from '../motor';
import { esPerillasValidas } from '../mutacion';
import type {
  EscenaId,
  InputUnificado,
  PerillasMutacion,
  TelemetriaRasgos,
} from '../contrato';

/** Registro de una llamada al gestor de escenas (para aserciones de orden). */
interface LlamadaGestor {
  metodo: 'add' | 'start' | 'stop';
  clave: string;
  datos?: object;
}

/**
 * Doble del emisor de eventos de una Escena: invoca el callback de `CREATE` de
 * inmediato para simular el fin de `create()` (donde se inyecta el input).
 */
function crearEscenaDoble(id: EscenaId): EscenaJugable & { setInput: ReturnType<typeof vi.fn> } {
  const setInput = vi.fn();
  const escena = {
    id,
    setInput,
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
      if (clave !== ID_CARGA) escenas.set(clave, crearEscenaDoble(clave as EscenaId));
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

/** Doble del almacén de sesión (equivalente a `game.registry`). */
function crearSesionDoble(): IAlmacenSesion {
  const datos = new Map<string, unknown>();
  return {
    get: (clave) => datos.get(clave),
    set: (clave, valor) => {
      datos.set(clave, valor);
    },
  };
}

/** Registro de prueba con `carreras` habilitada (Tarea 11.2). */
const REGISTRO_PRUEBA: RegistroEscena[] = [
  { id: 'portada', crear: () => crearEscenaDoble('portada'), habilitada: true },
  { id: 'seleccion_personaje', crear: () => crearEscenaDoble('seleccion_personaje'), habilitada: true },
  { id: 'plataformas', crear: () => crearEscenaDoble('plataformas'), habilitada: true },
  { id: 'ritmo', crear: () => crearEscenaDoble('ritmo'), habilitada: true },
  { id: 'shooter', crear: () => crearEscenaDoble('shooter'), habilitada: true },
  { id: 'carreras', crear: () => crearEscenaDoble('carreras'), habilitada: true },
];

/** Input de prueba neutro. */
const inputDoble: InputUnificado = {
  direccion: () => ({ x: 0, y: 0 }),
  accionPrimaria: () => false,
  accionPrimariaJustPressed: () => false,
  accionSecundaria: () => false,
  accionSecundariaJustPressed: () => false,
  pausa: () => false,
};

function crearSceneManager(overrides: Partial<{
  resolverPerillas: (perfil: unknown, destino: EscenaId) => Promise<PerillasMutacion>;
  actualizarPerfil: NonNullable<
    ConstructorParameters<typeof SceneManager>[0]['actualizarPerfil']
  >;
}> = {}) {
  const { gestor, llamadas, escenas } = crearGestorDoble();
  const sesion = crearSesionDoble();
  sesion.set(CLAVE_PERFIL_JUGADOR, crearPerfilInicial());

  const sm = new SceneManager({
    gestor,
    sesion,
    registro: REGISTRO_PRUEBA,
    construirInput: () => inputDoble,
    ...overrides,
  });

  return { sm, gestor, llamadas, escenas, sesion };
}

describe('SceneManager — registro declarativo (Requirement 9.7)', () => {
  it('registra la pantalla de carga y sólo las Escenas habilitadas', () => {
    const { sm, llamadas } = crearSceneManager();
    sm.registrarEscenas();

    const registradas = llamadas.filter((l) => l.metodo === 'add').map((l) => l.clave);
    expect(registradas).toContain(ID_CARGA);
    expect(registradas).toContain('plataformas');
    expect(registradas).toContain('ritmo');
    expect(registradas).toContain('shooter');
    // 'carreras' está habilitada (Tarea 11.2): debe registrarse (Requirement 9.7, 7.6).
    expect(registradas).toContain('carreras');
  });

  it('expone las Escenas habilitadas incluyendo carreras', () => {
    const { sm } = crearSceneManager();
    expect(sm.escenasHabilitadas()).toEqual(['portada', 'seleccion_personaje', 'plataformas', 'ritmo', 'shooter', 'carreras']);
  });
});

describe('SceneManager — arranque (Requirements 1.1, 8.4)', () => {
  it('arranca Nivel_Plataformas con perillas resueltas y sin pantalla de carga', async () => {
    const { sm, llamadas } = crearSceneManager();
    sm.registrarEscenas();
    await sm.iniciar();

    const start = llamadas.find((l) => l.metodo === 'start' && l.clave === PRIMERA_ESCENA);
    expect(start).toBeDefined();

    // No se muestra la pantalla de carga en el arranque inicial (Requirement 8.2
    // aplica a transiciones solicitadas por una Escena).
    const cargaMostrada = llamadas.some((l) => l.metodo === 'start' && l.clave === ID_CARGA);
    expect(cargaMostrada).toBe(false);

    // Las perillas entregadas son válidas (fallback por defecto, Requirement 6.4).
    const datos = start?.datos as { perillas: PerillasMutacion } | undefined;
    expect(datos && esPerillasValidas(datos.perillas)).toBe(true);
  });

  it('inyecta el InputUnificado en la Escena al crearse (setInput)', async () => {
    const { sm, escenas } = crearSceneManager();
    sm.registrarEscenas();
    await sm.iniciar();

    const portada = escenas.get('portada');
    expect(portada?.setInput).toHaveBeenCalledWith(inputDoble);
  });
});

describe('SceneManager — transiciones (Requirements 8.2, 8.4, 8.5)', () => {
  it('muestra la carga, detiene la Escena actual y arranca el destino con perillas', async () => {
    const { sm, gestor, llamadas } = crearSceneManager();
    sm.registrarEscenas();
    await sm.iniciar(); // deja 'portada' como escena actual

    // Una Escena solicita ir a 'ritmo' (acceso oculto).
    sm.solicitarTransicion('ritmo');
    // solicitarTransicion es asíncrona internamente; esperamos el microtask.
    await vi.waitFor(() =>
      expect(llamadas.some((l) => l.metodo === 'start' && l.clave === 'ritmo')).toBe(true)
    );
    void gestor;

    const idxStop = llamadas.findIndex((l) => l.metodo === 'stop' && l.clave === 'portada');
    const idxCarga = llamadas.findIndex((l) => l.metodo === 'start' && l.clave === ID_CARGA);
    const idxDestino = llamadas.findIndex((l) => l.metodo === 'start' && l.clave === 'ritmo');

    // Orden: detiene la actual → muestra carga → arranca destino (Requirement 8.2).
    expect(idxStop).toBeGreaterThanOrEqual(0);
    expect(idxCarga).toBeGreaterThan(idxStop);
    expect(idxDestino).toBeGreaterThan(idxCarga);

    // Se oculta la carga (stop ID_CARGA) durante la transición.
    expect(llamadas.some((l) => l.metodo === 'stop' && l.clave === ID_CARGA)).toBe(true);

    const start = llamadas.find((l) => l.metodo === 'start' && l.clave === 'ritmo');
    const datos = start?.datos as { perillas: PerillasMutacion } | undefined;
    expect(datos && esPerillasValidas(datos.perillas)).toBe(true);
  });

  it('retorna a Nivel_Plataformas al terminar un nivel oculto (Requirement 8.5)', async () => {
    const { sm, llamadas } = crearSceneManager();
    sm.registrarEscenas();
    await sm.iniciar();

    // Ir a 'plataformas' primero (simula la transición desde selección de personaje).
    sm.solicitarTransicion('plataformas');
    await vi.waitFor(() =>
      expect(llamadas.some((l) => l.metodo === 'start' && l.clave === 'plataformas')).toBe(true)
    );

    // Ir a 'shooter' y luego solicitar retorno a 'plataformas'.
    sm.solicitarTransicion('shooter');
    await vi.waitFor(() =>
      expect(llamadas.some((l) => l.metodo === 'start' && l.clave === 'shooter')).toBe(true)
    );

    sm.solicitarTransicion('plataformas');
    await vi.waitFor(() =>
      expect(
        llamadas.filter((l) => l.metodo === 'start' && l.clave === 'plataformas').length
      ).toBeGreaterThanOrEqual(2)
    );

    // El retorno arranca 'plataformas' con perillas resueltas (Requirement 8.5).
    const starts = llamadas.filter((l) => l.metodo === 'start' && l.clave === 'plataformas');
    const ultimo = starts[starts.length - 1];
    const datos = ultimo?.datos as { perillas: PerillasMutacion } | undefined;
    expect(datos && esPerillasValidas(datos.perillas)).toBe(true);
  });

  it('ignora una transición a una Escena no registrada sin romper el flujo', async () => {
    const { sm, llamadas } = crearSceneManager();
    sm.registrarEscenas();
    await sm.iniciar();

    // Solicitar transición a un id que no existe en el registro.
    sm.solicitarTransicion('inexistente' as EscenaId);
    // Damos margen a un posible microtask.
    await Promise.resolve();
    await Promise.resolve();

    expect(llamadas.some((l) => l.metodo === 'start' && l.clave === 'inexistente')).toBe(false);
  });
});

describe('SceneManager — Perfil_Jugador de sesión y telemetría (Requirements 8.3, 8.6)', () => {
  it('obtenerPerfil lee la única fuente de verdad del almacén de sesión', () => {
    const { sm, sesion } = crearSceneManager();
    const perfil = crearPerfilInicial();
    perfil.rasgos.furia = 0.42;
    sesion.set(CLAVE_PERFIL_JUGADOR, perfil);

    expect(sm.obtenerPerfil().rasgos.furia).toBe(0.42);
  });

  it('reportarTelemetria guarda la última telemetría (seam del Motor_Scoring)', () => {
    const { sm } = crearSceneManager();
    const telemetria: TelemetriaRasgos = {
      escena: 'ritmo',
      porRasgo: {
        furia: { senal: 0, oportunidad: 0 },
        curiosidad: { senal: 1, oportunidad: 3 },
        logro: { senal: 10, oportunidad: 20 },
        riesgo: { senal: 2, oportunidad: 20 },
      },
    };

    sm.reportarTelemetria(telemetria);
    expect(sm.obtenerUltimaTelemetria()).toBe(telemetria);
  });

  it('si se inyecta actualizarPerfil (seam 11.3), actualiza el perfil de sesión', () => {
    const perfilActualizado = crearPerfilInicial();
    perfilActualizado.rasgos.logro = 0.9;
    const actualizarPerfil = vi.fn(() => perfilActualizado);

    const { sm, sesion } = crearSceneManager({ actualizarPerfil });
    const telemetria: TelemetriaRasgos = {
      escena: 'plataformas',
      porRasgo: {
        furia: { senal: 1, oportunidad: 4 },
        curiosidad: { senal: 2, oportunidad: 5 },
        logro: { senal: 8, oportunidad: 8 },
        riesgo: { senal: 3, oportunidad: 6 },
      },
    };

    sm.reportarTelemetria(telemetria);

    expect(actualizarPerfil).toHaveBeenCalledOnce();
    expect((sesion.get(CLAVE_PERFIL_JUGADOR) as { rasgos: { logro: number } }).rasgos.logro).toBe(0.9);
  });
});

describe('SceneManager — publicación en sesión', () => {
  it('la clave de publicación del SceneManager está definida', () => {
    expect(CLAVE_SCENE_MANAGER).toBe('sceneManager');
  });
});
