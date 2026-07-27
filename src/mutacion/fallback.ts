/**
 * Mutacion_Fallback — heurística local pura (Requirements 6.1, 6.4).
 *
 * Calcula unas `PerillasMutacion` a partir del `PerfilJugador` sin usar la IA.
 * El Shell la ejecuta **siempre** en cada transición, en paralelo con la llamada
 * remota a Bedrock (Requirement 6.1), de modo que la resolución de la transición
 * nunca dependa del servicio externo. La función garantiza que su salida siempre
 * pertenece al conjunto cerrado del Contrato_Compartido (Requirement 6.4).
 *
 * Diseño de referencia: sección "Mutacion_Fallback (heurística local)" de
 * design.md.
 *
 * @module mutacion/fallback
 */

import type {
  PerfilJugador,
  PerillasMutacion,
  Rasgo,
  Paleta,
  Clima,
  MoodMusica,
} from '../contrato';
import { MAX_MENSAJE } from '../contrato';

/**
 * Umbral a partir del cual un rasgo se considera "alto".
 *
 * Elegido como `0.5` (mitad del rango normalizado `[0,1]`). El mapa fino exacto
 * de perfil→perillas queda `[PENDIENTE — Documento_Decisiones]` (Requirement
 * 12.3); este valor es una decisión sensata que no bloquea la implementación y
 * mantiene la salida siempre válida.
 */
const UMBRAL_ALTO = 0.5;

/**
 * Orden determinístico de desempate para elegir el rasgo dominante.
 *
 * Ante empates de valor, gana el rasgo que aparece primero en esta lista:
 * `furia > riesgo > logro > curiosidad`. Este orden fijo hace que
 * `calcularFallback` sea puro y determinístico (sin `Math.random` ni
 * `Date.now`): el mismo perfil produce siempre las mismas perillas.
 */
const ORDEN_DESEMPATE: readonly Rasgo[] = ['furia', 'riesgo', 'logro', 'curiosidad'];

/** Paleta asignada a cada rasgo dominante (sección de diseño del fallback). */
const PALETA_POR_RASGO: Record<Rasgo, Paleta> = {
  furia: 'infierno',
  riesgo: 'hostil',
  curiosidad: 'sueno',
  logro: 'neon',
};

/** Plantilla local de mensaje corto por rasgo dominante (sin IA). */
const MENSAJE_POR_RASGO: Record<Rasgo, string> = {
  furia: 'El mundo arde con tu furia.',
  riesgo: 'Vives al filo del peligro.',
  curiosidad: 'La niebla esconde secretos.',
  logro: 'Tu senda brilla de logros.',
};

/** Acota un número al rango `[0, 1]` inclusive. */
function clamp01(valor: number): number {
  if (valor < 0) return 0;
  if (valor > 1) return 1;
  return valor;
}

/**
 * Determina el rasgo dominante del perfil con desempate determinístico.
 *
 * Recorre {@link ORDEN_DESEMPATE} y elige el rasgo de mayor valor; ante empate,
 * conserva el que aparece primero en el orden fijo, garantizando determinismo.
 */
function rasgoDominante(perfil: PerfilJugador): Rasgo {
  let dominante: Rasgo = ORDEN_DESEMPATE[0]!;
  let maxValor = perfil.rasgos[dominante];
  for (const rasgo of ORDEN_DESEMPATE) {
    const valor = perfil.rasgos[rasgo];
    if (valor > maxValor) {
      maxValor = valor;
      dominante = rasgo;
    }
  }
  return dominante;
}

/**
 * Calcula la `Mutacion_Fallback` a partir del `PerfilJugador` (Requirement 6.1).
 *
 * Función **pura y determinística**: no usa `Math.random`, `Date.now` ni estado
 * externo. Dado el mismo perfil devuelve siempre las mismas perillas. La salida
 * siempre satisface el conjunto cerrado del Contrato_Compartido (Requirement
 * 6.4): enums válidos, `intensidad_enemigos`/`agresividad` en `[0,1]` y `mensaje`
 * de longitud `<= MAX_MENSAJE`.
 *
 * Heurística (umbral "alto" = {@link UMBRAL_ALTO}, desempate
 * {@link ORDEN_DESEMPATE}):
 * - `paleta`: rasgo dominante → furia:'infierno', riesgo:'hostil',
 *   curiosidad:'sueno', logro:'neon'.
 * - `intensidad_enemigos`: `clamp(furia, 0, 1)`.
 * - `agresividad`: `clamp((furia + riesgo) / 2, 0, 1)`.
 * - `clima`: riesgo alto → 'brasas'; si no curiosidad alta → 'niebla'; si no
 *   furia alta → 'lluvia'; si no → 'ninguno'.
 * - `mood_musica`: furia alta → 'furioso'; si no riesgo alto → 'tenso'; si no
 *   logro alto → 'epico'; si no → 'calma'.
 * - `mensaje`: plantilla local corta según el rasgo dominante (sin IA).
 *
 * El mapa fino exacto queda `[PENDIENTE — Documento_Decisiones]` (Requirement
 * 12.3); esta heurística cumple la garantía de validez.
 *
 * @param perfil Perfil acumulado del jugador (rasgos en `[0,1]`).
 * @returns Perillas de mutación válidas del conjunto cerrado.
 */
export function calcularFallback(perfil: PerfilJugador): PerillasMutacion {
  const { furia, riesgo, curiosidad, logro } = perfil.rasgos;

  const dominante = rasgoDominante(perfil);
  const paleta: Paleta = PALETA_POR_RASGO[dominante];

  const intensidad_enemigos = clamp01(furia);
  const agresividad = clamp01((furia + riesgo) / 2);

  let clima: Clima;
  if (riesgo >= UMBRAL_ALTO) {
    clima = 'brasas';
  } else if (curiosidad >= UMBRAL_ALTO) {
    clima = 'niebla';
  } else if (furia >= UMBRAL_ALTO) {
    clima = 'lluvia';
  } else {
    clima = 'niebla'; // Siempre algún clima para impacto visual
  }

  let mood_musica: MoodMusica;
  if (furia >= UMBRAL_ALTO) {
    mood_musica = 'furioso';
  } else if (riesgo >= UMBRAL_ALTO) {
    mood_musica = 'tenso';
  } else if (logro >= UMBRAL_ALTO) {
    mood_musica = 'epico';
  } else {
    mood_musica = 'calma';
  }

  // Recorte defensivo para respetar MAX_MENSAJE del conjunto cerrado.
  const mensaje = MENSAJE_POR_RASGO[dominante].slice(0, MAX_MENSAJE);

  return {
    paleta,
    intensidad_enemigos,
    agresividad,
    clima,
    mood_musica,
    mensaje,
  };
}
