/**
 * Tests del Servicio_Backend (Lambda) — `handler`.
 *
 * Cubre las tareas 12.2 (unit tests del handler) y 12.3 (test de integración
 * con un mock local de Bedrock). Verifica el contrato del handler sin realizar
 * NINGUNA llamada real a AWS: el módulo `@aws-sdk/client-bedrock-runtime` está
 * mockeado con `vi.mock`, de modo que `BedrockRuntimeClient#send` es un
 * `vi.fn()` controlable y asertable.
 *
 * Requisitos verificados:
 *  - 10.6: autorización ANTES de invocar Bedrock (rechazo sin API key sin tocar
 *    el Servicio_IA).
 *  - 5.3: la respuesta válida devuelve JSON conforme al conjunto cerrado; la
 *    salida inválida de Bedrock se maneja (502) sin lanzar.
 *  - 10.4: se invoca Bedrock ante una solicitud autorizada y válida.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';

import type { APIGatewayProxyEvent } from 'aws-lambda';

import { esPerillasValidas } from '../mutacion/validador';

// ---------------------------------------------------------------------------
// Mock de Bedrock (hoisted) — NINGUNA llamada real a AWS.
// ---------------------------------------------------------------------------

// `vi.hoisted` garantiza que el `send` compartido exista antes de que la fábrica
// del `vi.mock` (también hoisteada) lo capture, y antes de que el handler
// construya `new BedrockRuntimeClient({})` en el top-level del módulo.
const { send } = vi.hoisted(() => {
  // `ALLOWED_ORIGIN` se lee en el top-level del módulo del handler (al importar),
  // por eso lo fijamos aquí, ANTES de que el handler se cargue. `SHARED_SECRET`
  // y demás se leen en cada invocación, así que se manejan en beforeEach.
  process.env.ALLOWED_ORIGIN = 'https://arcade.example';
  process.env.BEDROCK_MODEL_ID = 'test-model';
  return { send: vi.fn() };
});

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(() => ({ send })),
  // InvokeModelCommand passthrough: guarda el input para poder inspeccionarlo.
  InvokeModelCommand: vi.fn((input: unknown) => ({ input })),
}));

// El handler debe importarse DESPUÉS de declarar el mock (se resuelve hoisteado).
import { handler } from './handler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Perillas válidas de referencia (pertenecen al conjunto cerrado). */
const perillasValidas = {
  paleta: 'neon',
  intensidad_enemigos: 0.5,
  agresividad: 0.3,
  clima: 'lluvia',
  mood_musica: 'epico',
  mensaje: '¡A moverse!',
} as const;

/** Cuerpo de solicitud válido `{ perfil, proximaEscena }`. */
const cuerpoValido = {
  perfil: {
    rasgos: { furia: 0.4, curiosidad: 0.6, logro: 0.5, riesgo: 0.7 },
    pesoAcumulado: { furia: 1, curiosidad: 1, logro: 1, riesgo: 1 },
  },
  proximaEscena: 'plataformas',
};

/**
 * Construye un evento mínimo de API Gateway (integración proxy). Por defecto
 * incluye un cuerpo válido; los parámetros permiten variar autorización,
 * headers y cuerpo por caso de prueba.
 */
function construirEvento(opciones?: {
  apiKeyEnContexto?: string | null;
  headers?: Record<string, string>;
  body?: string | null;
  httpMethod?: string;
}): APIGatewayProxyEvent {
  const {
    apiKeyEnContexto = null,
    headers = {},
    body = JSON.stringify(cuerpoValido),
    httpMethod = 'POST',
  } = opciones ?? {};

  return {
    httpMethod,
    headers,
    body,
    // Solo poblamos lo que el handler realmente lee de requestContext.
    requestContext: {
      identity: { apiKey: apiKeyEnContexto },
    },
  } as unknown as APIGatewayProxyEvent;
}

/**
 * Envuelve un objeto JSON de perillas en el formato de respuesta de Bedrock
 * (Anthropic Messages API): `body` es un Uint8Array con
 * `{ content: [{ type: 'text', text: '<json>' }] }`.
 */
function respuestaBedrockConTexto(textoJson: string): { body: Uint8Array } {
  const payload = {
    content: [{ type: 'text', text: textoJson }],
  };
  return { body: new TextEncoder().encode(JSON.stringify(payload)) };
}

// Guardamos el entorno para restaurarlo tras cada test.
const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  send.mockReset();
  // Sin secreto compartido por defecto (se lee por invocación).
  delete process.env.SHARED_SECRET;
});

afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

// ---------------------------------------------------------------------------
// 12.2 — Unit tests del handler
// ---------------------------------------------------------------------------

describe('handler — autorización (Requirement 10.6)', () => {
  it('rechaza sin API key y NO invoca Bedrock', async () => {
    const evento = construirEvento({
      apiKeyEnContexto: null,
      headers: {}, // sin x-api-key
      // sin SHARED_SECRET en el entorno
    });

    const res = await handler(evento);

    expect([401, 403]).toContain(res.statusCode);
    expect(send).not.toHaveBeenCalled();
    // Responde JSON (nunca lanza) y con CORS.
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe(
      'https://arcade.example'
    );
    const cuerpo = JSON.parse(res.body);
    expect(cuerpo.error).toBe('no_autorizado');
  });

  it('autoriza vía header x-api-key', async () => {
    send.mockResolvedValue(
      respuestaBedrockConTexto(JSON.stringify(perillasValidas))
    );

    const evento = construirEvento({
      apiKeyEnContexto: null,
      headers: { 'x-api-key': 'clave-de-prueba' },
    });

    const res = await handler(evento);

    expect(res.statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('handler — respuesta válida devuelve JSON conforme (Requirements 5.3, 10.4)', () => {
  it('con salida válida de Bedrock devuelve 200 y PerillasMutacion conformes', async () => {
    send.mockResolvedValue(
      respuestaBedrockConTexto(JSON.stringify(perillasValidas))
    );

    const evento = construirEvento({ apiKeyEnContexto: 'apikey-de-contexto' });

    const res = await handler(evento);

    expect(res.statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);

    const cuerpo = JSON.parse(res.body);
    // El cuerpo debe pertenecer al conjunto cerrado.
    expect(esPerillasValidas(cuerpo)).toBe(true);
    expect(cuerpo.paleta).toBe('neon');
    expect(cuerpo.clima).toBe('lluvia');
    expect(cuerpo.mood_musica).toBe('epico');

    // CORS presente (Requirement 10.6, defensa en profundidad).
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe(
      'https://arcade.example'
    );
    expect(res.headers?.['Content-Type']).toBe('application/json');
  });
});

describe('handler — entrada inválida (Requirement 5.2)', () => {
  it('devuelve 400 y NO invoca Bedrock cuando el body es inválido', async () => {
    const evento = construirEvento({
      apiKeyEnContexto: 'apikey-de-contexto',
      body: JSON.stringify({ algo: 'incorrecto' }), // sin perfil ni proximaEscena
    });

    const res = await handler(evento);

    expect(res.statusCode).toBe(400);
    expect(send).not.toHaveBeenCalled();
    const cuerpo = JSON.parse(res.body);
    expect(cuerpo.error).toBe('solicitud_invalida');
  });

  it('devuelve 400 cuando el body es null', async () => {
    const evento = construirEvento({
      apiKeyEnContexto: 'apikey-de-contexto',
      body: null,
    });

    const res = await handler(evento);

    expect(res.statusCode).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('handler — salida inválida de Bedrock se maneja (Requirement 5.3)', () => {
  it('devuelve 502 cuando el modelo emite un enum fuera del conjunto cerrado', async () => {
    const perillasInvalidas = {
      ...perillasValidas,
      paleta: 'arcoiris', // fuera del conjunto cerrado
    };
    send.mockResolvedValue(
      respuestaBedrockConTexto(JSON.stringify(perillasInvalidas))
    );

    const evento = construirEvento({ apiKeyEnContexto: 'apikey-de-contexto' });

    const res = await handler(evento);

    expect(res.statusCode).toBe(502);
    expect(send).toHaveBeenCalledTimes(1);
    const cuerpo = JSON.parse(res.body);
    expect(cuerpo.error).toBe('salida_ia_invalida');
  });

  it('devuelve 502 cuando el texto del modelo no contiene JSON parseable', async () => {
    send.mockResolvedValue(
      respuestaBedrockConTexto('lo siento, no puedo ayudar con eso')
    );

    const evento = construirEvento({ apiKeyEnContexto: 'apikey-de-contexto' });

    const res = await handler(evento);

    expect(res.statusCode).toBe(502);
  });
});

describe('handler — errores de Bedrock nunca lanzan sin capturar (Requirement 5.5)', () => {
  it('devuelve 502 cuando send rechaza', async () => {
    send.mockRejectedValue(new Error('Bedrock caído'));

    const evento = construirEvento({ apiKeyEnContexto: 'apikey-de-contexto' });

    // No debe lanzar: siempre responde con JSON + CORS.
    const res = await handler(evento);

    expect(res.statusCode).toBe(502);
    const cuerpo = JSON.parse(res.body);
    expect(cuerpo.error).toBe('error_servicio_ia');
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe(
      'https://arcade.example'
    );
  });
});

// ---------------------------------------------------------------------------
// 12.3 — Test de integración del backend (mock local de Bedrock)
// ---------------------------------------------------------------------------

describe('integración backend (mock local de Bedrock) — Requirements 5.3, 10.4, 10.6', () => {
  it('flujo autorizado completo: recorta mensaje largo y devuelve JSON válido', async () => {
    // El modelo devuelve un mensaje demasiado largo pero por lo demás válido:
    // el handler lo sanea (recorte) y responde 200 conforme al conjunto cerrado.
    const mensajeLargo = 'x'.repeat(200);
    const salidaModelo = { ...perillasValidas, mensaje: mensajeLargo };
    send.mockResolvedValue(
      respuestaBedrockConTexto(JSON.stringify(salidaModelo))
    );

    const evento = construirEvento({
      apiKeyEnContexto: null,
      headers: { 'x-api-key': 'clave-integracion' },
    });

    const res = await handler(evento);

    expect(res.statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);

    const cuerpo = JSON.parse(res.body);
    expect(esPerillasValidas(cuerpo)).toBe(true);
    expect(cuerpo.mensaje.length).toBeLessThanOrEqual(80);
  });

  it('rechazo por autorización faltante: 403 sin invocar Bedrock aun con body válido', async () => {
    const evento = construirEvento({
      apiKeyEnContexto: null,
      headers: {},
      body: JSON.stringify(cuerpoValido),
    });

    const res = await handler(evento);

    expect([401, 403]).toContain(res.statusCode);
    expect(send).not.toHaveBeenCalled();
  });

  it('con SHARED_SECRET configurado exige el header x-shared-secret coincidente', async () => {
    process.env.SHARED_SECRET = 'secreto-super';
    send.mockResolvedValue(
      respuestaBedrockConTexto(JSON.stringify(perillasValidas))
    );

    // Sin el header correcto: rechazado sin invocar Bedrock.
    const eventoSinSecreto = construirEvento({
      apiKeyEnContexto: 'apikey-de-contexto',
      headers: {},
    });
    const resSinSecreto = await handler(eventoSinSecreto);
    expect([401, 403]).toContain(resSinSecreto.statusCode);
    expect(send).not.toHaveBeenCalled();

    // Con el header correcto: autorizado y responde 200.
    const eventoConSecreto = construirEvento({
      apiKeyEnContexto: 'apikey-de-contexto',
      headers: { 'x-shared-secret': 'secreto-super' },
    });
    const resConSecreto = await handler(eventoConSecreto);
    expect(resConSecreto.statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
