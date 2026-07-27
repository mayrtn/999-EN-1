---
inclusion: manual
---

# Documento de Decisiones — Arcade IA Mutante

Este documento formaliza las decisiones de diseño marcadas como `[PENDIENTE — Documento_Decisiones]` en el código fuente. Cada decisión se presenta con su contexto, la opción elegida y la justificación.

---

## Decisión 1 — Mapa de teclas definitivo (Requirement 12.1)

**Contexto**: Las tres Escenas comparten el mismo `InputUnificado` con un único `MAPA_TECLAS` centralizado en `src/input/mapa-teclas.ts`.

**Decisión**:

| Acción | Tecla(s) |
|--------|----------|
| Movimiento arriba | `↑` / `W` |
| Movimiento abajo | `↓` / `S` |
| Movimiento izquierda | `←` / `A` |
| Movimiento derecha | `→` / `D` |
| Acción primaria (saltar/disparar/golpear ritmo) | `Espacio` / `↑` / `W` |
| Acción secundaria (dash/alterna) | `Shift` |
| Pausa | `Esc` / `P` |

**Justificación**: Flechas + WASD es el estándar de facto en juegos de navegador. Espacio como acción primaria es intuitivo. Shift para acción secundaria está cerca del WASD. Esc/P para pausa cubre ambas preferencias (gamer casual y hardcoreado). El salto también acepta ↑/W para facilitar plataformas a jugadores que prefieren no mover la mano al espacio.

**Estado**: Implementado. Archivo: `src/input/mapa-teclas.ts`.

---

## Decisión 2 — Colores de paleta (tintes de sprites) (Requirement 12.3)

**Contexto**: El `Sistema_Mutacion` aplica `setTint()` sobre sprites existentes, reutilizándolos sin arte nuevo (Requirement 7.7). Cada `Paleta` del conjunto cerrado se mapea a un color RGB de 24 bits.

**Decisión**:

| Paleta | Color hex | Descripción visual |
|--------|-----------|--------------------|
| `infierno` | `0xFF3B1F` | Rojo incandescente/volcánico |
| `sueno` | `0xB388FF` | Violeta suave, onírico/etéreo |
| `neon` | `0x1FFFD1` | Verde-cian eléctrico, arcade retro |
| `hostil` | `0x7BD634` | Verde enfermizo, amenazante/tóxico |

**Justificación**: Cada color refuerza el rasgo dominante que lo dispara:
- `infierno` ← furia: rojos agresivos transmiten ira.
- `sueno` ← curiosidad: violetas suaves evocan misterio y exploración.
- `neon` ← logro: cian brillante es "recompensa visual", arcade clásico.
- `hostil` ← riesgo: verde tóxico comunica peligro ambiental.

Los colores elegidos mantienen contraste suficiente con el fondo oscuro (`#0b0b12`) y entre sí (distancia perceptual > 50 en CIELab).

**Estado**: Implementado. Archivo: `src/mutacion/sistemaMutacion.ts` (`TINTES_POR_PALETA`).

---

## Decisión 3 — Heurística de Mutacion_Fallback (Requirement 12.3)

**Contexto**: La `Mutacion_Fallback` es la heurística local pura que produce perillas válidas sin la IA. Debe ser determinística (mismo perfil → mismas perillas).

**Decisión**:

| Perilla | Fórmula |
|---------|---------|
| `paleta` | Rasgo dominante → `furia:infierno`, `riesgo:hostil`, `curiosidad:sueno`, `logro:neon` |
| `intensidad_enemigos` | `clamp(furia, 0, 1)` |
| `agresividad` | `clamp((furia + riesgo) / 2, 0, 1)` |
| `clima` | riesgo ≥ 0.5 → `brasas`; curiosidad ≥ 0.5 → `niebla`; furia ≥ 0.5 → `lluvia`; else → `niebla` |
| `mood_musica` | furia ≥ 0.5 → `furioso`; riesgo ≥ 0.5 → `tenso`; logro ≥ 0.5 → `epico`; else → `calma` |
| `mensaje` | Plantilla fija por rasgo dominante (sin IA) |

**Desempate rasgo dominante**: orden fijo `furia > riesgo > logro > curiosidad`.

**Justificación**: La heurística es simple, determinística, y cubre todas las combinaciones posibles sin producir valores fuera del conjunto cerrado. El umbral 0.5 divide naturalmente el rango [0,1] en "bajo" y "alto". El fallback a `niebla` cuando ningún rasgo domina da un clima visual interesante por defecto.

**Estado**: Implementado. Archivo: `src/mutacion/fallback.ts`.

---

## Decisión 4 — Música por mood (Requirement 7.5)

**Contexto**: El `GestorAudio` cambia la pista musical según `mood_musica`. Se necesita una estrategia de audio que funcione sin archivos externos en la demo/hackaton.

**Decisión**: Sistema híbrido en dos capas:

1. **Capa Phaser** (`GestorAudioPhaser`): si hay assets de audio cargados bajo las keys `mus_calma`, `mus_epico`, `mus_tenso`, `mus_furioso`, usa el sound manager de Phaser con crossfade (800ms).
2. **Capa sintetizada** (`GestorAudioSintetizado`): si no hay assets, genera música procedural con Web Audio API usando patrones de osciladores loopeados por mood:
   - `calma`: Am pentatónica, ondas sinusoidales, tempo lento (4s/ciclo)
   - `epico`: Do mayor heroico, triángulo, tempo medio (2s/ciclo)
   - `tenso`: Dm disminuido + drone sawtooth, tempo rápido (1.5s/ciclo)
   - `furioso`: Em octavas agresivas, square wave + sub-bass, tempo muy rápido (1s/ciclo)

El `crearGestorAudio(scene)` detecta automáticamente cuál estrategia usar.

**Justificación**: La síntesis procedural elimina la dependencia de archivos CC0 externos para la demo jugable, mientras el sistema queda preparado para reemplazarlos por pistas reales en producción sin cambios en las escenas.

**Estado**: Implementado. Archivos: `src/audio/musicaSintetizada.ts`, `src/audio/gestorAudioHibrido.ts`.

---

## Decisión 5 — Timeout de resolución Bedrock (Requirement 6.5)

**Contexto**: El Shell lanza una carrera entre la llamada remota a Bedrock y un timeout. Si vence el timeout, usa el fallback.

**Decisión**: Timeout de **4000ms** (4 segundos) configurado en `src/shell/configBackend.ts`.

**Justificación**: Claude 3.5 Haiku responde típicamente en 1-2s para un payload pequeño como el perfil. 4s da margen para latencia de red variable sin hacer esperar al jugador más allá de lo que tolera una pantalla de carga (objetivo perceptual: < 5s total incluyendo la animación de carga).

**Estado**: Implementado. Archivo: `src/shell/configBackend.ts`.

---

## Decisión 6 — Modelo de Bedrock

**Contexto**: La Lambda invoca un modelo de fundación de Bedrock para generar las perillas de mutación.

**Decisión**: `anthropic.claude-haiku-4-5-20251001-v1:0` (Claude 3.5 Haiku) como modelo por defecto, invocado vía inference profile cross-region (`us.`).

**Justificación**: Haiku es el modelo más rápido y económico de la familia Claude, adecuado para un payload pequeño (perfil JSON de ~100 bytes) que requiere una respuesta JSON estructurada de ~200 bytes. La latencia típica (< 2s) cabe dentro del presupuesto de timeout de 4s.

**Estado**: Implementado. Archivos: `src/backend/handler.ts`, `infra/lib/arcade-ia-mutante-stack.ts`.

---

## Decisión 7 — Orden de Escenas y navegación

**Contexto**: El juego tiene una portada, selección de personaje, y 4 escenas jugables.

**Decisión**: Flujo lineal: `portada → seleccion_personaje → plataformas`. Desde plataformas se accede a `ritmo`, `shooter` y `carreras` vía portales ocultos. Al terminar un nivel oculto se retorna a `plataformas`.

**Justificación**: El Nivel_Plataformas es el hub central que introduce la mecánica de exploración (portales a niveles ocultos). Esto refuerza el rasgo `curiosidad` como eje del juego: el jugador descubre los otros géneros explorando.

**Estado**: Implementado. Archivos: `src/shell/registroEscenas.ts`, `src/shell/SceneManager.ts`.
