# Implementation Plan: Escena_Carreras

## Overview

Implementar la jugabilidad completa del tercer nivel oculto de carreras pseudo-3D. El stub existente (`EscenaCarreras.ts`) se convertirá en una escena funcional con generación procedural de pista, física de velocidad, spawning de rivales, medición de los cuatro rasgos de personalidad, y aplicación de mutaciones visuales/audio. Se crean subsistemas modulares (TrackGenerator, ScoringManager, SpawnerRivalesCarreras) como módulos puros testeables, y se integran en la escena principal respetando el Contrato_Compartido.

## Tasks

- [x] 1. Crear módulos puros de lógica: constantes, tipos e interfaces
  - [x] 1.1 Crear archivo `src/escenas/carreras/constantes.ts` con todas las constantes de configuración (velocidad, pista, sesión, boost)
    - Definir VELOCIDAD_BASE, VELOCIDAD_MAXIMA, ACELERACION, DESACELERACION, FRENADO_ACTIVO
    - Definir BOOST_MULTIPLICADOR, BOOST_DURACION_MS, BOOST_COOLDOWN_MS
    - Definir UMBRAL_ALTA_VELOCIDAD, MARGEN_PASADA_AL_RAS, ANCHO_PISTA, CARRILES
    - Definir DURACION_MIN_MS, DURACION_MAX_MS, DURACION_DEFECTO_MS
    - _Requirements: 1.3, 1.4, 1.5, 2.1, 6.2, 11.4_

  - [x] 1.2 Crear archivo `src/escenas/carreras/tipos.ts` con todas las interfaces y tipos del dominio
    - Definir SegmentoPista, PistaGenerada, EstadoSesion, Rival, Obstaculo
    - Definir EventoScoring (union type), EstadoScoring, ConfigPista
    - _Requirements: 1.8, 3.1, 4.1, 5.1, 6.1, 10.1_

- [x] 2. Implementar TrackGenerator (Generación Procedural de Pista)
  - [x] 2.1 Crear archivo `src/escenas/carreras/TrackGenerator.ts` con la clase TrackGenerator
    - Implementar generador con semilla determinística (PRNG simple basado en semilla)
    - Generar secuencia de segmentos (recta, curva_izq, curva_der) con distribución variada
    - Insertar bifurcaciones (Rutas_Alternativas) en posiciones procedurales
    - Distribuir checkpoints a intervalos regulares
    - Garantizar mínimo 3 Rutas_Alternativas (inyectar si la generación no produce suficientes)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 4.2, 5.2_

  - [x]* 2.2 Write property tests for TrackGenerator (determinism and structure)
    - **Property 17: Track generation is deterministic (same seed = same track)**
    - **Property 18: Track generation includes all segment types**
    - **Validates: Requirements 10.4, 10.2**

  - [x]* 2.3 Write property tests for TrackGenerator (bifurcations and checkpoints)
    - **Property 15: Track generation guarantees minimum 3 alternative routes**
    - **Property 16: Checkpoints are distributed at regular intervals**
    - **Property 19: Different seeds produce different bifurcation positions**
    - **Validates: Requirements 4.2, 10.5, 5.2, 10.3**

- [x] 3. Implementar ScoringManager (Medición de Rasgos)
  - [x] 3.1 Crear archivo `src/escenas/carreras/ScoringManager.ts` con la clase ScoringManager
    - Implementar inicialización con oportunidades basadas en la pista generada
    - Implementar registrarEmbestida() → incrementa furia.senal
    - Implementar registrarRutaAlternativa() → incrementa curiosidad.senal
    - Implementar registrarCheckpoint() y registrarAdelantar() → incrementan logro.senal
    - Implementar registrarPasadaAlRas() → incrementa riesgo.senal
    - Implementar acumularVelocidadAlta() → acumula riesgo.senal proporcionalmente
    - Implementar construirTelemetria() → retorna TelemetriaRasgos con escena='carreras'
    - Implementar declararRasgos() → retorna DeclaracionRasgos con oportunidades > 0
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.3, 4.4, 5.1, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 7.4_

  - [x]* 3.2 Write property tests for ScoringManager (signal accumulation)
    - **Property 8: Embestida increments Furia signal**
    - **Property 9: Route taken increments Curiosidad signal**
    - **Property 10: Scoring events increment Logro signal**
    - **Validates: Requirements 3.2, 4.3, 5.3, 5.4**

  - [x]* 3.3 Write property tests for ScoringManager (risk and telemetry)
    - **Property 11: High-speed risk accumulation is proportional and conditional**
    - **Property 12: Near-miss increments Riesgo signal**
    - **Property 13: Telemetry structure preserves all accumulated signals**
    - **Property 14: All trait declarations have opportunity > 0**
    - **Validates: Requirements 6.2, 6.3, 3.3, 4.4, 5.5, 6.4, 7.4, 3.1, 4.1, 5.1, 6.1**

- [x] 4. Implementar física de velocidad y movimiento lateral
  - [x] 4.1 Crear archivo `src/escenas/carreras/fisicaVehiculo.ts` con funciones puras de física
    - Implementar calcularAceleracion(velocidadActual, deltaMs) → nueva velocidad clampeada a VELOCIDAD_MAXIMA
    - Implementar calcularDesaceleracion(velocidadActual, deltaMs) → nueva velocidad con floor en VELOCIDAD_BASE
    - Implementar calcularFrenadoActivo(velocidadActual, deltaMs) → reducción más rápida que desaceleración natural
    - Implementar aplicarColision(velocidadActual, penalizacion) → reducción clampeada a VELOCIDAD_BASE
    - Implementar calcularBoost(velocidadActual, boostActivo) → velocidad con multiplicador temporal
    - Implementar moverLateral(posicionActual, direccion, maxCarril) → nueva posición dentro de bounds
    - Implementar clampDuracion(duracionMs) → clampeada a [60000, 90000]
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x]* 4.2 Write property tests for velocity physics
    - **Property 2: Acceleration is capped at Velocidad_Maxima**
    - **Property 3: Deceleration is floored at Velocidad_Base**
    - **Property 4: Active braking is faster than natural deceleration**
    - **Property 5: Obstacle collision always reduces velocity**
    - **Property 6: Session duration is clamped to [60000, 90000] ms**
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 2.1, 11.3, 11.5**

  - [x]* 4.3 Write property tests for lateral movement and boost
    - **Property 1: Lateral movement respects direction and bounds**
    - **Property 21: Boost respects cooldown**
    - **Validates: Requirements 1.2, 11.1, 11.2, 11.4**

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implementar SpawnerRivalesCarreras
  - [x] 6.1 Crear archivo `src/escenas/carreras/SpawnerRivalesCarreras.ts` con la clase SpawnerRivalesCarreras
    - Implementar ajustarIntensidad(intensidad) → escala probabilidad de spawn
    - Implementar ajustarAgresividad(agresividad) → escala velocidad de rivales
    - Implementar spawnear(segmentoActual) → generar rival en carril aleatorio según probabilidad
    - Implementar actualizarRivales(deltaMs) → mover rivales y desactivar los que salen de rango
    - _Requirements: 1.8, 8.2, 8.3_

  - [x]* 6.2 Write property tests for SpawnerRivalesCarreras
    - **Property 22: Spawner scales with perilla values**
    - **Validates: Requirements 8.2, 8.3**

- [x] 7. Implementar la clase EscenaCarreras completa
  - [x] 7.1 Refactorizar `src/escenas/EscenaCarreras.ts` — implementar init(), preload(), y estado de sesión
    - Reemplazar stub con implementación real que almacena perillas, shell, input
    - Implementar preload() para cargar assets de vehículo, pista, rivales, obstáculos
    - Inicializar estado de sesión (velocidad, posición, temporizador, etc.)
    - Mantener validación de personaje seleccionado existente
    - _Requirements: 7.1, 7.2, 7.3, 1.1_

  - [x] 7.2 Implementar create() — generar pista, configurar subsistemas, aplicar mutaciones
    - Instanciar TrackGenerator y generar pista con semilla derivada de timestamp
    - Instanciar ScoringManager con la pista generada
    - Instanciar SpawnerRivalesCarreras
    - Aplicar perillas iniciales via SistemaMutacion (paleta, clima, música, mensaje)
    - Crear HUD mínimo (temporizador + indicador velocidad) con fuente "Press Start 2P"
    - Iniciar Temporizador_Sesion con duración clampeada a [60000, 90000]
    - _Requirements: 1.1, 2.1, 2.2, 8.1, 8.4, 8.5, 8.6, 9.3, 9.4_

  - [x] 7.3 Implementar update() — loop principal de gameplay
    - Leer InputUnificado: direccion lateral, aceleración, frenado, boost
    - Actualizar velocidad con funciones de física (aceleración/desaceleración/boost)
    - Actualizar posición lateral del vehículo
    - Scroll de pista pseudo-3D y avance de segmentos
    - Detectar colisiones con rivales (embestida) y obstáculos
    - Detectar pasadas al ras (proximidad sin colisión)
    - Detectar checkpoints alcanzados y rutas alternativas tomadas
    - Detectar adelantamientos de rivales
    - Registrar eventos en ScoringManager
    - Acumular velocidad alta en ScoringManager
    - Actualizar SpawnerRivalesCarreras
    - Decrementar temporizador y actualizar HUD
    - Al expirar temporizador: construirTelemetria, reportarTelemetria, solicitarTransicion (una sola vez)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.3, 2.4, 3.2, 4.3, 5.3, 5.4, 6.2, 6.3, 7.3, 7.5, 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x]* 7.4 Write property test for session finalization
    - **Property 7: Timer expiry triggers finalization exactly once**
    - **Property 20: init stores all DatosInicioEscena values**
    - **Validates: Requirements 2.3, 7.2**

- [x] 8. Implementar renderizado pseudo-3D y visual
  - [x] 8.1 Crear archivo `src/escenas/carreras/Renderer.ts` con el sistema de renderizado
    - Implementar efecto de perspectiva con escalado y desplazamiento vertical por segmento
    - Renderizar carriles discretos (5 posiciones)
    - Renderizar vehículo del jugador, rivales y obstáculos con escala según profundidad
    - Renderizar fondo de pista scrolleable con efecto de velocidad
    - Aplicar estilo pixel art 8-bit consistente con otras escenas
    - _Requirements: 1.9, 9.1, 9.2, 9.4, 9.5_

- [x] 9. Implementar aplicarPerillas() y sistema de mutación
  - [x] 9.1 Implementar el método aplicarPerillas() completo en EscenaCarreras
    - Aplicar perilla paleta como tinte de color sobre sprites (pista, vehículo, rivales)
    - Ajustar SpawnerRivalesCarreras con intensidad_enemigos y agresividad
    - Aplicar efecto de partículas de clima usando crearCapaClima del Contrato_Compartido
    - Seleccionar pista de música según mood_musica via GestorAudioPhaser
    - Mostrar mensaje de la IA al inicio via OverlayTextoPhaser
    - Reutilizar sprites existentes sin requerir arte adicional por variante
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Integración final y wiring
  - [x] 11.1 Implementar declararRasgos() y construirTelemetria() delegando a ScoringManager
    - declararRasgos() delega a scoringManager.declararRasgos()
    - construirTelemetria() delega a scoringManager.construirTelemetria()
    - _Requirements: 3.1, 3.3, 4.1, 4.4, 5.1, 5.5, 6.1, 6.4, 7.1, 7.4_

  - [x] 11.2 Habilitar escena en REGISTRO_ESCENAS y validar integración con Shell
    - Cambiar `habilitada: false` a `habilitada: true` en la entrada del registro
    - Verificar que init/create/update/declararRasgos/construirTelemetria funcionan end-to-end
    - Verificar degradación grácil sin Shell (modo standalone)
    - _Requirements: 7.1, 7.6_

  - [x]* 11.3 Write unit tests for EscenaCarreras integration
    - Test inicialización sin Shell (degradación grácil)
    - Test orden de llamadas al finalizar (telemetría antes de transición)
    - Test aplicación de perillas via SistemaMutacion
    - Test personaje no seleccionado redirige correctamente
    - Test HUD muestra tiempo restante y velocidad
    - _Requirements: 7.1, 7.2, 7.5, 7.6, 2.2, 9.4_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Los módulos puros (TrackGenerator, ScoringManager, fisicaVehiculo) se implementan primero para facilitar testing sin dependencias de Phaser
- El patrón de mocking sigue `NivelRitmo.test.ts` existente en el proyecto
- fast-check y vitest ya están disponibles en devDependencies

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "3.3", "4.2", "4.3", "6.1"] },
    { "id": 3, "tasks": ["6.2", "7.1"] },
    { "id": 4, "tasks": ["7.2", "7.3"] },
    { "id": 5, "tasks": ["7.4", "8.1"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["11.1", "11.2"] },
    { "id": 8, "tasks": ["11.3"] }
  ]
}
```
