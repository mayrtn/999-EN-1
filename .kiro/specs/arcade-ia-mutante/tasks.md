# Implementation Plan: Arcade IA Mutante

## Overview

El plan implementa el cliente Phaser 3 + TypeScript y el backend Node/TypeScript sobre Lambda descritos en el diseño. Se construye de adentro hacia afuera: primero el `Contrato_Compartido` (tipos y conjuntos cerrados) que habilita el trabajo en paralelo, luego la lógica pura y determinística (`Motor_Scoring`, validador, `Mutacion_Fallback`), después el loop de resolución de perillas del `Shell`, el `Sistema_Mutacion`, el input, las tres Escenas, el cableado del `Shell`/`SceneManager`, la Lambda de Bedrock y la infraestructura como código. Las propiedades de correctitud (1–8) se implementan con `fast-check` cerca del código que validan.

El lenguaje de implementación es **TypeScript** (Phaser 3 en cliente, Node/TS en Lambda), tal como fija el diseño. Framework de test: **Vitest + fast-check** (mínimo 100 iteraciones por propiedad).

## Tasks

- [x] 1. Configurar estructura del proyecto y Contrato_Compartido
  - [x] 1.1 Inicializar proyecto Phaser 3 + TypeScript y framework de testing
    - Crear estructura de carpetas (`src/contrato`, `src/motor`, `src/mutacion`, `src/input`, `src/escenas`, `src/shell`, `src/backend`, `infra`)
    - Configurar `package.json`, `tsconfig.json`, bundler estático y Vitest + fast-check
    - Definir script de build que produzca artefactos estáticos para S3
    - _Requirements: 10.1_

  - [x] 1.2 Definir los tipos del Contrato_Compartido
    - Escribir `EscenaId`, `Rasgo`, `PerfilJugador`, `SenalOportunidad`, `TelemetriaRasgos`, `DeclaracionRasgos`
    - Escribir `PerillasMutacion`, `Paleta`, `Clima`, `MoodMusica` y las constantes de conjunto cerrado (`PALETAS`, `CLIMAS`, `MOODS`, `MAX_MENSAJE`)
    - Escribir las interfaces `IEscena`, `IShell`, `IMotorScoring`, `ISistemaMutacion`, `IClienteBackend`, `InputUnificado`, `DatosInicioEscena`
    - _Requirements: 9.1, 9.2, 9.5_

- [x] 2. Implementar Motor_Scoring (lógica pura y determinística)
  - [x] 2.1 Implementar el Motor_Scoring
    - Escribir `registrarDeclaracion` y `actualizarPerfil` con Score_Rasgo = clamp(senal/oportunidad, 0, 1), Peso_Rasgo (0 si oportunidad==0) y promedio ponderado acumulado incremental
    - Garantizar pureza: sin `Math.random`, `Date.now` ni estado externo
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x]* 2.2 Escribir property test para Score_Rasgo en rango
    - **Property 1: Score_Rasgo siempre en [0,1]**
    - **Validates: Requirements 4.3, 4.4**

  - [x]* 2.3 Escribir property test para oportunidad 0
    - **Property 2: Oportunidad 0 ⇒ peso 0 y no afecta el perfil (sin NaN ni división por cero)**
    - **Validates: Requirements 4.5**

  - [x]* 2.4 Escribir property test para invariante del perfil
    - **Property 3: El perfil acumulado permanece en [0,1]**
    - **Validates: Requirements 4.4, 4.6**

  - [x]* 2.5 Escribir property test para determinismo
    - **Property 4: Determinismo del perfil (misma secuencia ⇒ mismo Perfil_Jugador)**
    - **Validates: Requirements 4.7**

  - [x]* 2.6 Escribir unit tests de ejemplo del Motor_Scoring
    - Casos concretos: `senal > oportunidad` acota a 1, primera escena, rasgo nunca medido
    - _Requirements: 4.3, 4.4, 4.5, 4.6_

- [x] 3. Implementar el validador de Perillas_Mutacion
  - [x] 3.1 Implementar `esPerillasValidas`
    - Validar tipos, enums de conjunto cerrado y rangos `[0,1]`; recorte defensivo de `mensaje` a `MAX_MENSAJE`
    - _Requirements: 5.4, 9.2_

  - [x]* 3.2 Escribir property test del validador
    - **Property 8: La validación rechaza todo lo fuera del conjunto cerrado y acepta toda perilla bien formada**
    - **Validates: Requirements 5.4, 9.2**

  - [x]* 3.3 Escribir unit tests de ejemplo del validador
    - Ejemplos por cada enum inválido y por límites `0` y `1`
    - _Requirements: 5.4, 9.2_

- [x] 4. Implementar Mutacion_Fallback (heurística local pura)
  - [x] 4.1 Implementar `calcularFallback`
    - Función pura `PerfilJugador → PerillasMutacion` que mapea rasgo dominante a paleta/clima/mood y calcula intensidad/agresividad; mensaje por plantilla local
    - _Requirements: 6.1, 6.4_

  - [x]* 4.2 Escribir property test del fallback
    - **Property 6: El fallback siempre produce perillas válidas (satisface `esPerillasValidas`)**
    - **Validates: Requirements 6.1, 6.4**

  - [x]* 4.3 Escribir unit tests de ejemplo del fallback
    - Perfiles neutro, dominante-furia, dominante-riesgo → perillas esperadas
    - _Requirements: 6.1, 6.4_

- [x] 5. Checkpoint - Asegurar que la lógica pura pasa sus tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implementar Cliente Backend y loop de resolución de perillas del Shell
  - [x] 6.1 Implementar el Cliente del Servicio_Backend
    - `pedirMutacion` con `fetch`, `AbortController` y `timeoutMs`; devuelve `unknown` (respuesta no confiable); rechaza en timeout/error/red
    - _Requirements: 5.1, 5.6_

  - [x] 6.2 Implementar la resolución de perillas del Shell
    - Ejecutar en paralelo llamada remota y `calcularFallback`; validar respuesta con `esPerillasValidas`; usar remota si válida y a tiempo, si no fallback; sin bloquear el bucle de frames (Promise/evento)
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 6.2, 6.3, 6.5_

  - [x]* 6.3 Escribir property test de perillas aplicadas
    - **Property 5: Toda Perillas_Mutacion aplicada pertenece al conjunto cerrado (respuesta válida/inválida/malformada)**
    - **Validates: Requirements 5.4, 5.5, 6.4, 9.2**

  - [x]* 6.4 Escribir property test de no bloqueo
    - **Property 7: El juego nunca queda bloqueado esperando a Bedrock (resuelve dentro del timeout con perillas válidas)**
    - **Validates: Requirements 5.6, 6.2, 6.3, 6.5**

  - [x]* 6.5 Escribir unit tests del Cliente Backend
    - Mock de `fetch`: respuesta lenta (timeout), error 5xx, red caída, respuesta válida
    - _Requirements: 5.1, 5.6, 6.2, 6.3_

- [x] 7. Implementar Sistema_Mutacion e Input_Unificado
  - [x] 7.1 Implementar el Sistema_Mutacion
    - `aplicar(scene, perillas, ctx)`: paleta vía `setTint`, intensidad_enemigos (densidad de spawn), agresividad (IA de enemigos), clima (partículas), mood_musica (selección de pista), mensaje (overlay); reutilizando sprites existentes
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 7.2 Implementar GestorAudio, OverlayTexto y helpers de partículas/clima
    - `GestorAudio` con crossfade entre pistas por mood; `OverlayTexto` temporal; capas de partículas por clima
    - _Requirements: 7.4, 7.5, 7.6_

  - [x]* 7.3 Escribir unit tests del Sistema_Mutacion con mocks de Phaser
    - Verificar invocación de `setTint`, creación/omisión de emitter según clima, selección de pista correcta y despliegue del overlay
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 8.1 Implementar InputUnificado (abstracción de teclado)
    - Implementar `direccion`, `accionPrimaria(JustPressed)`, `accionSecundaria(JustPressed)`, `pausa`; mismo mapa de teclas para las tres Escenas (binding concreto marcado `[PENDIENTE — Documento_Decisiones]`)
    - _Requirements: 9.5, 9.6_

  - [x]* 8.2 Escribir unit tests de InputUnificado
    - Verificar lectura de dirección y estados presionado/just-pressed con teclado mockeado
    - _Requirements: 9.5, 9.6_

- [x] 9. Implementar las tres Escenas jugables
  - [x] 9.1 Implementar Nivel_Plataformas
    - Movimiento y salto vía InputUnificado, monedas, enemigos hostiles con daño, al menos dos accesos ocultos que solicitan transición al Shell; `declararRasgos`, `aplicarPerillas`, `construirTelemetria`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 9.1, 9.4_

  - [x]* 9.2 Escribir unit tests de Nivel_Plataformas
    - Recolección de moneda, daño por enemigo, activación de acceso oculto, forma de la telemetría emitida
    - _Requirements: 1.4, 1.5, 1.7, 1.8_

  - [x] 9.3 Implementar Nivel_Ritmo
    - Sesión de 60–90 s, registro de acierto/fallo según ventana, notificación de retorno al Shell; `aplicarPerillas` y `construirTelemetria`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 9.1, 9.4_

  - [x]* 9.4 Escribir unit tests de Nivel_Ritmo
    - Acierto dentro de ventana, fallo fuera de ventana, fin por duración
    - _Requirements: 2.2, 2.3, 2.4, 2.6_

  - [x] 9.5 Implementar Nivel_Shooter
    - Sesión de 60–90 s, movimiento de mira, disparo, impacto que remueve objetivo, notificación de retorno; `aplicarPerillas` y `construirTelemetria`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 9.1, 9.4_

  - [x]* 9.6 Escribir unit tests de Nivel_Shooter
    - Movimiento de mira, generación de disparo, impacto que remueve objetivo, fin por duración
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.7_

- [x] 10. Checkpoint - Asegurar que Escenas y sistemas pasan sus tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Cablear el Shell, el SceneManager y el registro de escenas
  - [x] 11.1 Implementar BootScene e inicialización del Perfil_Jugador
    - Precarga de assets comunes, inicializa los cuatro rasgos en estado neutro y carga Nivel_Plataformas como primera escena
    - _Requirements: 8.1, 1.1_

  - [x] 11.2 Implementar SceneManager, registro declarativo y transiciones
    - Registro `EscenaId → constructor` con feature flag; pantalla de carga en transición; mantener Perfil_Jugador en memoria toda la sesión; retorno a Nivel_Plataformas al terminar nivel oculto
    - _Requirements: 8.2, 8.5, 8.6, 9.7_

  - [x] 11.3 Integrar Motor_Scoring, resolución de perillas y Sistema_Mutacion en el Shell
    - Entregar Telemetria_Rasgos al Motor_Scoring, disparar resolución de perillas durante la carga, entregar perillas a la siguiente Escena antes de iniciarla y aplicar el Sistema_Mutacion
    - _Requirements: 8.3, 8.4, 5.1, 5.6_

  - [x]* 11.4 Escribir test de integración del loop del Shell (backend mockeado)
    - Flujo escena → telemetría → transición → resolución → siguiente escena con perillas aplicadas
    - _Requirements: 8.2, 8.3, 8.4, 5.1, 5.6_

  - [x] 11.5 Registrar Escena_Carreras como escena opcional deshabilitada
    - Añadir entrada al registro con `habilitada: false` y un stub que implemente `IEscena`, sin modificar Shell ni Motor_Scoring
    - _Requirements: 9.7_

- [x] 12. Implementar el Servicio_Backend (Lambda)
  - [x] 12.1 Implementar el handler de la Lambda
    - Verificar autorización (API key) antes de invocar Bedrock; construir prompt, invocar Bedrock (`InvokeModel`), parsear y validar contra el conjunto cerrado, devolver JSON conforme
    - _Requirements: 5.2, 5.3, 10.3, 10.4, 10.6_

  - [x]* 12.2 Escribir unit tests del handler
    - Rechazo sin API key sin invocar Bedrock; respuesta válida devuelve JSON conforme; salida inválida de Bedrock se maneja
    - _Requirements: 5.3, 10.6_

  - [x]* 12.3 Escribir test de integración del backend (mock local de Bedrock)
    - Verificar respuesta JSON válida y rechazo por autorización faltante
    - _Requirements: 5.3, 10.4, 10.6_

- [x] 13. Definir la infraestructura AWS como código
  - [x] 13.1 Escribir IaC de S3, CloudFront, API Gateway, Lambda y API key
    - Bucket S3 estático, distribución CloudFront (HTTPS), API Gateway con API key/autorizador, Lambda con permiso de Bedrock, CORS para el origen de CloudFront
    - _Requirements: 10.1, 10.2, 10.3, 10.6_

  - [x] 13.2 Escribir scripts de build y empaquetado de artefactos estáticos
    - Script que compile el cliente a estáticos y empaquete la Lambda para su publicación
    - _Requirements: 10.1, 10.5_

- [x] 14. Checkpoint final - Asegurar que toda la suite pasa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las sub-tareas marcadas con `*` son opcionales (tests) y pueden omitirse para un MVP más rápido.
- Cada tarea referencia requisitos específicos para trazabilidad.
- Los tests de propiedad (Properties 1–8) usan `fast-check` con mínimo 100 iteraciones y el comentario `Feature: arcade-ia-mutante, Property {número}: {texto}`.
- Los checkpoints aseguran validación incremental de la lógica pura, las escenas y el sistema completo.
- Áreas sin PBT (render de Phaser, audio/partículas, infra AWS) se cubren con unit tests de ejemplo, integración y mocks, según la Testing Strategy del diseño.
- Los puntos `[PENDIENTE — Documento_Decisiones]` (mapa de teclas, valores finos de perillas, assets) no bloquean la implementación gracias al Contrato_Compartido.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "13.1", "13.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4.1", "6.1", "7.1", "7.2", "8.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.2", "3.3", "4.2", "4.3", "6.2", "7.3", "8.2", "12.1"] },
    { "id": 4, "tasks": ["6.3", "6.4", "6.5", "9.1", "9.3", "9.5", "12.2", "12.3"] },
    { "id": 5, "tasks": ["9.2", "9.4", "9.6", "11.1", "11.2"] },
    { "id": 6, "tasks": ["11.3", "11.5"] },
    { "id": 7, "tasks": ["11.4"] }
  ]
}
```
