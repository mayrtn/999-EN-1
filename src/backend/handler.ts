/**
 * Servicio_Backend (Lambda) — handler HTTP detrás de API Gateway.
 *
 * Intermedia entre el Juego y AWS Bedrock (Servicio_IA). Su contrato es:
 *
 *  1. Verificar la autorización (API key) **antes** de invocar Bedrock. Sin
 *     autorización válida devuelve 401/403 sin llamar al Servicio_IA, evitando
 *     abuso y costo indebido (Requirement 10.6).
 *  2. Parsear el cuerpo `{ perfil, proximaEscena }` y validar su forma mínima;
 *     si es inválido devuelve 400 sin invocar Bedrock.
 *  3. Construir el prompt (system + user) que fuerza una salida JSON del
 *     conjunto cerrado y solicitar las `Perillas_Mutacion` al Servicio_IA
 *     mediante `InvokeModel` (Requirements 5.2, 10.3, 10.4).
 *  4. Parsear la respuesta del modelo, extraer el objeto JSON y **validarlo**
 *     estrictamente contra el conjunto cerrado del Contrato_Compartido; si es
 *     válido devuelve 200 con las perillas conformes (Requirement 5.3).
 *
 * Defensa en profundidad: aunque una respuesta del modelo sea inválida y esta
 * Lambda devuelva un error (502), la garantía real de continuidad vive en el
 * cliente (Shell), que cae a la `Mutacion_Fallback` ante cualquier fallo del
 * backend (Requirements 5.5, 6.2, 6.3). Por eso el handler nunca lanza una
 * excepción sin capturar: siempre responde con un JSON y unos headers CORS.
 *
 * Los secretos y la configuración se leen del entorno (nunca hardcodeados):
 *  - `BEDROCK_MODEL_ID`: id del modelo de fundación (default: Claude 3.5 Haiku).
 *  - `ALLOWED_ORIGIN`: origen permitido para CORS (default `*`).
 *  - `SHARED_SECRET` (opcional): secreto compartido para verificación defensiva
 *    adicional vía header `x-shared-secret`.
 *
 * @module backend/handler
 * @see Requirements 5.2 (solicitar perillas al Servicio_IA), 5.3 (JSON conforme),
 *   10.3 (Lambda tras API Gateway), 10.4 (invocar Bedrock), 10.6 (autorización
 *   previa a invocar Bedrock)
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

import {
  PALETAS,
  CLIMAS,
  MOODS,
  MAX_MENSAJE,
  type EscenaId,
  type PerfilJugador,
  type PerillasMutacion,
} from '../contrato';
import { sanitizarPerillas } from '../mutacion/validador';

/**
 * Id del modelo de Bedrock a invocar. Se lee del entorno; el default es el
 * modelo recomendado por el diseño (Claude 3.5 Haiku), económico y rápido para
 * un payload pequeño (Requirement 10.4).
 */
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-3-5-haiku-20241022-v1:0';

/** Origen permitido para las cabeceras CORS de las respuestas (Requirement 10.6). */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';

/**
 * Escenas válidas del Contrato_Compartido, para validar `proximaEscena` sin
 * depender de que el cliente envíe algo del conjunto cerrado.
 */
const ESCENAS_VALIDAS: readonly EscenaId[] = [
  'plataformas',
  'ritmo',
  'shooter',
  'carreras',
];

/**
 * System prompt (Diseño del prompt): fija el rol y el formato de salida estricto
 * (EXCLUSIVAMENTE JSON del conjunto cerrado, sin markdown ni texto extra).
 */
const SYSTEM_PROMPT = [
  'Sos el director creativo de un juego arcade. Recibís un perfil de jugador con',
  'cuatro rasgos en [0,1]: furia, curiosidad, logro, riesgo. Devolvés EXCLUSIVAMENTE',
  'un objeto JSON válido, sin texto adicional, sin markdown, con EXACTAMENTE estos campos:',
  `- paleta: uno de ${PALETAS.map((p) => `"${p}"`).join(' | ')}`,
  '- intensidad_enemigos: número entre 0 y 1',
  '- agresividad: número entre 0 y 1',
  `- clima: uno de ${CLIMAS.map((c) => `"${c}"`).join(' | ')}`,
  `- mood_musica: uno de ${MOODS.map((m) => `"${m}"`).join(' | ')}`,
  `- mensaje: frase corta (máximo ${MAX_MENSAJE} caracteres) dirigida al jugador`,
  'No incluyas ningún otro campo ni valores fuera de estos conjuntos.',
].join('\n');

/** Cliente Bedrock reutilizado entre invocaciones (fuera del handler para reuso de conexión). */
const bedrock = new BedrockRuntimeClient({});

/**
 * Construye las cabeceras de respuesta con CORS para el origen configurado
 * (Requirement 10.6, defensa en profundidad sobre el CORS de API Gateway).
 */
function cabeceras(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type,x-api-key,x-shared-secret',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };
}

/** Construye una respuesta HTTP JSON conforme a API Gateway (proxy). */
function respuesta(statusCode: number, cuerpo: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: cabeceras(),
    body: JSON.stringify(cuerpo),
  };
}

/** Lee un header de forma case-insensitive desde el evento de API Gateway. */
function leerHeader(event: APIGatewayProxyEvent, nombre: string): string | undefined {
  const headers = event.headers ?? {};
  const objetivo = nombre.toLowerCase();
  for (const clave of Object.keys(headers)) {
    if (clave.toLowerCase() === objetivo) {
      const valor = headers[clave];
      return valor ?? undefined;
    }
  }
  return undefined;
}

/**
 * Verifica la autorización ANTES de invocar Bedrock (Requirement 10.6).
 *
 * API Gateway ya exige la API key (`apiKeyRequired: true`) y rechaza en el borde
 * sin llegar a la Lambda; esta comprobación es una defensa en profundidad:
 *  - Acepta si el contexto de la solicitud trae una `apiKey` (presencia de key
 *    verificada por API Gateway).
 *  - Si además se configuró `SHARED_SECRET`, exige el header `x-shared-secret`
 *    coincidente.
 * Sin ninguna evidencia de autorización, devuelve `false` y el handler responde
 * 403 sin tocar el Servicio_IA.
 */
function estaAutorizado(event: APIGatewayProxyEvent): boolean {
  const secretoEsperado = process.env.SHARED_SECRET;
  if (secretoEsperado) {
    // Con secreto compartido configurado, es condición necesaria.
    if (leerHeader(event, 'x-shared-secret') !== secretoEsperado) return false;
  }

  const apiKey = event.requestContext?.identity?.apiKey;
  if (typeof apiKey === 'string' && apiKey.length > 0) return true;

  // Fallback: presencia del header x-api-key (útil en pruebas locales / proxies
  // que no pueblan requestContext.identity.apiKey).
  const headerApiKey = leerHeader(event, 'x-api-key');
  if (typeof headerApiKey === 'string' && headerApiKey.length > 0) return true;

  // Si el único requisito era el secreto compartido y coincidió, autorizamos.
  return Boolean(secretoEsperado);
}

/** Forma mínima esperada del cuerpo de la solicitud. */
interface CuerpoSolicitud {
  perfil: PerfilJugador;
  proximaEscena: EscenaId;
}

/**
 * Valida la forma mínima del cuerpo `{ perfil, proximaEscena }`. No confía en el
 * cliente: rechaza cualquier cosa que no encaje (Requirement 5.2). Devuelve el
 * cuerpo tipado o `null` si es inválido (→ 400).
 */
function parsearCuerpo(bodyCrudo: string | null): CuerpoSolicitud | null {
  if (typeof bodyCrudo !== 'string' || bodyCrudo.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyCrudo);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const proximaEscena = obj.proximaEscena;
  if (
    typeof proximaEscena !== 'string' ||
    !(ESCENAS_VALIDAS as readonly string[]).includes(proximaEscena)
  ) {
    return null;
  }

  const perfil = obj.perfil;
  if (typeof perfil !== 'object' || perfil === null) return null;
  const rasgos = (perfil as Record<string, unknown>).rasgos;
  if (typeof rasgos !== 'object' || rasgos === null) return null;

  return {
    perfil: perfil as PerfilJugador,
    proximaEscena: proximaEscena as EscenaId,
  };
}

/**
 * Construye el user prompt: el `Perfil_Jugador` serializado + la `proximaEscena`
 * (Diseño del prompt). La validación estricta posterior es la garantía real.
 */
function construirUserPrompt(cuerpo: CuerpoSolicitud): string {
  return [
    'Perfil del jugador (rasgos en [0,1]):',
    JSON.stringify(cuerpo.perfil.rasgos),
    `Próxima escena: ${cuerpo.proximaEscena}`,
    'Devolvé solo el objeto JSON de perillas.',
  ].join('\n');
}

/**
 * Extrae el primer objeto JSON `{...}` presente en un texto. Los modelos suelen
 * devolver JSON limpio, pero a veces lo envuelven en prosa o cercas de código;
 * tomamos desde el primer `{` hasta el último `}` y lo parseamos.
 *
 * @returns El valor parseado (`unknown`) o `null` si no hay JSON parseable.
 */
function extraerJson(texto: string): unknown {
  const inicio = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  if (inicio === -1 || fin === -1 || fin < inicio) return null;
  const recorte = texto.slice(inicio, fin + 1);
  try {
    return JSON.parse(recorte);
  } catch {
    return null;
  }
}

/**
 * Extrae el texto de la respuesta del modelo. Soporta el formato de la API de
 * mensajes de Anthropic Claude en Bedrock (`content: [{ type, text }]`), que es
 * el modelo por defecto recomendado por el diseño. Si el formato no coincide,
 * devuelve `null` y el handler responde 502 (el cliente cae al fallback).
 */
function extraerTextoModelo(respuestaCruda: unknown): string | null {
  if (typeof respuestaCruda !== 'object' || respuestaCruda === null) return null;
  const obj = respuestaCruda as Record<string, unknown>;

  // Formato Anthropic (Claude Messages API en Bedrock).
  const content = obj.content;
  if (Array.isArray(content)) {
    const partesTexto = content
      .map((parte) => {
        if (typeof parte === 'object' && parte !== null) {
          const t = (parte as Record<string, unknown>).text;
          return typeof t === 'string' ? t : '';
        }
        return '';
      })
      .join('');
    if (partesTexto.length > 0) return partesTexto;
  }

  return null;
}

/**
 * Invoca Bedrock con la API de mensajes de Anthropic y devuelve las perillas
 * validadas contra el conjunto cerrado, o `null` si la salida no es conforme
 * (Requirements 5.2, 5.3, 10.4).
 */
async function pedirPerillasABedrock(
  cuerpo: CuerpoSolicitud
): Promise<PerillasMutacion | null> {
  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 300,
    temperature: 0.7,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: construirUserPrompt(cuerpo),
      },
    ],
  };

  const comando = new InvokeModelCommand({
    modelId: BEDROCK_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  });

  const salida = await bedrock.send(comando);

  // `body` es un Uint8Array; lo decodificamos a texto y parseamos.
  const textoCrudo = new TextDecoder().decode(salida.body);
  let respuestaModelo: unknown;
  try {
    respuestaModelo = JSON.parse(textoCrudo);
  } catch {
    return null;
  }

  const texto = extraerTextoModelo(respuestaModelo);
  if (texto === null) return null;

  const jsonPerillas = extraerJson(texto);
  // `sanitizarPerillas` recorta defensivamente el mensaje y revalida contra el
  // conjunto cerrado; si no cumple, devuelve null (Requirements 5.3, 5.4).
  return sanitizarPerillas(jsonPerillas);
}

/**
 * Punto de entrada de la Lambda (integración proxy de API Gateway REST).
 *
 * Orquesta autorización → validación de entrada → invocación de Bedrock →
 * validación de la salida, respondiendo siempre con JSON + CORS y sin lanzar
 * excepciones sin capturar (Requirements 5.2, 5.3, 10.3, 10.4, 10.6).
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Preflight CORS defensivo (API Gateway suele resolverlo, pero no dañamos).
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cabeceras(), body: '' };
  }

  // 1) Autorización ANTES de invocar Bedrock (Requirement 10.6).
  if (!estaAutorizado(event)) {
    return respuesta(403, {
      error: 'no_autorizado',
      mensaje: 'Falta la autorización válida; no se invoca el Servicio_IA.',
    });
  }

  // 2) Validación de la entrada (Requirement 5.2). Entrada inválida → 400.
  const cuerpo = parsearCuerpo(event.body);
  if (cuerpo === null) {
    return respuesta(400, {
      error: 'solicitud_invalida',
      mensaje: 'Se esperaba { perfil: { rasgos }, proximaEscena } válido.',
    });
  }

  // 3) Invocar Bedrock, parsear y validar (Requirements 5.3, 10.4). Todo el
  //    trabajo de red y parseo va dentro de try/catch: nunca lanzamos sin capturar.
  try {
    const perillas = await pedirPerillasABedrock(cuerpo);

    if (perillas === null) {
      // La salida del modelo no fue conforme al conjunto cerrado. Respondemos
      // 502 para que el cliente caiga a la Mutacion_Fallback (Requirement 5.5).
      return respuesta(502, {
        error: 'salida_ia_invalida',
        mensaje:
          'El Servicio_IA no devolvió perillas conformes al conjunto cerrado.',
      });
    }

    // 4) Éxito: perillas validadas y conformes (Requirement 5.3).
    return respuesta(200, perillas);
  } catch (err) {
    // Error de red / Bedrock / parseo: respondemos 502 (el cliente hace fallback).
    return respuesta(502, {
      error: 'error_servicio_ia',
      mensaje:
        err instanceof Error
          ? err.message
          : 'Fallo al invocar el Servicio_IA.',
    });
  }
};
