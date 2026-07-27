# Requirements Document

## Introduction

Escena_Carreras es el tercer nivel oculto opcional del juego Arcade IA Mutante, de género carreras. El jugador accede a esta escena desde una zona secreta del Nivel_Plataformas y experimenta una sesión de carrera corta (60–90 segundos) con un enfoque visual pseudo-3D estilo OutRun o, como alternativa técnica, un sistema de esquiva-carriles.

La escena mide los cuatro rasgos de personalidad (Furia, Curiosidad, Logro, Riesgo) a través de acciones de carrera: embestir rivales, tomar rutas alternativas/atajos, alcanzar checkpoints y mantener velocidad alta sin frenar. Al terminar, emite Telemetria_Rasgos conforme al Contrato_Compartido y consume Perillas_Mutacion para transformar su mundo visual, sus enemigos y su ambientación musical.

La Escena_Carreras ya está registrada en el REGISTRO_ESCENAS con `habilitada: false` y un stub funcional que cumple el Contrato_Compartido. Este documento define los requisitos para implementar la jugabilidad completa de la escena.

## Glossary

- **Escena_Carreras**: El tercer nivel oculto opcional del Juego, de género carreras, implementado como Phaser.Scene que cumple el Contrato_Compartido (IEscena).
- **Pista**: El circuito o recorrido virtual donde transcurre la carrera; compuesto por segmentos con curvas, rectas y bifurcaciones.
- **Carril**: Una de las posiciones laterales discretas (mínimo 3) en las que el vehículo del jugador puede ubicarse.
- **Vehiculo_Jugador**: El sprite controlado por el jugador que se desplaza por la Pista.
- **Rival**: Un vehículo controlado por IA que circula por la Pista y puede ser embestido o esquivado.
- **Obstaculo**: Elemento estático o de baja velocidad en la Pista que el jugador debe esquivar o puede destruir.
- **Checkpoint**: Marcador de progreso a lo largo de la Pista que registra el avance del jugador.
- **Ruta_Alternativa**: Un desvío opcional en la Pista que ofrece un camino distinto al principal, potencialmente más corto o con recompensas.
- **Velocidad_Actual**: La velocidad instantánea del Vehiculo_Jugador en un frame dado.
- **Velocidad_Maxima**: El tope de velocidad que el Vehiculo_Jugador puede alcanzar sin boost.
- **Umbral_Alta_Velocidad**: El porcentaje de la Velocidad_Maxima (configurable, por defecto 80%) a partir del cual se considera que el jugador mantiene velocidad alta.
- **Pasada_Al_Ras**: Evento que ocurre cuando el Vehiculo_Jugador pasa cerca de un Rival u Obstaculo sin colisionar, dentro de un margen de proximidad definido.
- **Embestida**: Colisión intencional del Vehiculo_Jugador contra un Rival.
- **Temporizador_Sesion**: Contador regresivo que define la duración de la sesión de carrera (entre 60 y 90 segundos).
- **Contrato_Compartido**: El acuerdo de interfaces (IEscena, InputUnificado, PerillasMutacion, TelemetriaRasgos) que todas las escenas respetan.
- **Sistema_Mutacion**: El componente que aplica las PerillasMutacion a la escena (tinte, partículas, enemigos, música, mensaje).
- **InputUnificado**: La abstracción de entrada del Contrato_Compartido que la escena consume (direccion, accionPrimaria, accionSecundaria).
- **PerillasMutacion**: El conjunto cerrado de parámetros de mutación: paleta, intensidad_enemigos, agresividad, clima, mood_musica y mensaje.
- **TelemetriaRasgos**: El objeto con la señal y oportunidad de cada rasgo que la escena emite al terminar.
- **DeclaracionRasgos**: El objeto que declara las oportunidades máximas por rasgo que la escena ofrece.

## Requirements

### Requirement 1: Mecánica Principal de Carrera

**User Story:** Como jugador, quiero una experiencia de carrera fluida con control de dirección, aceleración y frenado, para sentir la velocidad y el riesgo de competir contra rivales en una pista.

#### Acceptance Criteria

1. WHEN el Shell inicia la Escena_Carreras, THE Escena_Carreras SHALL comenzar una sesión jugable con el Vehiculo_Jugador posicionado en la Pista.
2. WHEN el jugador presiona la dirección izquierda o derecha del InputUnificado, THE Escena_Carreras SHALL desplazar el Vehiculo_Jugador lateralmente en la dirección correspondiente dentro de los límites de la Pista.
3. WHILE el jugador mantiene presionada la dirección hacia arriba del InputUnificado, THE Escena_Carreras SHALL acelerar el Vehiculo_Jugador hasta alcanzar la Velocidad_Maxima.
4. WHILE el jugador no presiona la dirección hacia arriba del InputUnificado, THE Escena_Carreras SHALL desacelerar el Vehiculo_Jugador gradualmente hasta una velocidad base mínima.
5. WHEN el jugador presiona la acción secundaria del InputUnificado, THE Escena_Carreras SHALL aplicar frenado activo que reduce la Velocidad_Actual más rápido que la desaceleración natural.
6. WHEN el Vehiculo_Jugador colisiona con un Obstaculo, THE Escena_Carreras SHALL reducir la Velocidad_Actual del Vehiculo_Jugador y aplicar una penalización visual temporal.
7. WHEN el Vehiculo_Jugador colisiona con un Rival, THE Escena_Carreras SHALL registrar la colisión como Embestida y aplicar un efecto de retroceso al Rival.
8. THE Escena_Carreras SHALL generar Rivales y Obstaculos a lo largo de la Pista de forma procedural durante la sesión.
9. THE Escena_Carreras SHALL simular desplazamiento de la Pista con perspectiva pseudo-3D o scroll vertical para generar sensación de velocidad.

### Requirement 2: Duración y Condiciones de Fin de Sesión

**User Story:** Como jugador, quiero que la carrera tenga una duración acotada y clara, para que la experiencia del nivel oculto sea breve e intensa como las demás escenas ocultas.

#### Acceptance Criteria

1. WHEN la Escena_Carreras inicia la sesión, THE Escena_Carreras SHALL iniciar el Temporizador_Sesion con una duración entre 60 y 90 segundos.
2. THE Escena_Carreras SHALL mostrar el tiempo restante del Temporizador_Sesion de forma visible al jugador durante toda la sesión.
3. WHEN el Temporizador_Sesion llega a cero, THE Escena_Carreras SHALL finalizar la sesión y notificar al Shell la solicitud de retorno.
4. WHEN la sesión finaliza, THE Escena_Carreras SHALL emitir la TelemetriaRasgos conforme al Contrato_Compartido antes de solicitar la transición.

### Requirement 3: Medición de Rasgo Furia

**User Story:** Como sistema de scoring, quiero medir la agresividad del jugador en la carrera a través de sus embestidas a rivales, para alimentar el rasgo Furia del perfil.

#### Acceptance Criteria

1. THE Escena_Carreras SHALL declarar una Oportunidad de Furia mayor que cero en su DeclaracionRasgos, basada en la cantidad de Rivales que aparecen durante la sesión.
2. WHEN el Vehiculo_Jugador ejecuta una Embestida contra un Rival, THE Escena_Carreras SHALL incrementar la Senal de Furia en una unidad.
3. THE Escena_Carreras SHALL incluir la Senal y Oportunidad de Furia acumuladas en la TelemetriaRasgos al finalizar la sesión.

### Requirement 4: Medición de Rasgo Curiosidad

**User Story:** Como sistema de scoring, quiero medir la exploración del jugador a través de las rutas alternativas que toma, para alimentar el rasgo Curiosidad del perfil.

#### Acceptance Criteria

1. THE Escena_Carreras SHALL declarar una Oportunidad de Curiosidad mayor que cero en su DeclaracionRasgos, basada en la cantidad de Rutas_Alternativas disponibles durante la sesión.
2. THE Escena_Carreras SHALL generar al menos 3 Rutas_Alternativas a lo largo de la Pista durante una sesión completa.
3. WHEN el Vehiculo_Jugador toma una Ruta_Alternativa, THE Escena_Carreras SHALL incrementar la Senal de Curiosidad en una unidad.
4. THE Escena_Carreras SHALL incluir la Senal y Oportunidad de Curiosidad acumuladas en la TelemetriaRasgos al finalizar la sesión.

### Requirement 5: Medición de Rasgo Logro

**User Story:** Como sistema de scoring, quiero medir el progreso y rendimiento del jugador mediante los checkpoints alcanzados, para alimentar el rasgo Logro del perfil.

#### Acceptance Criteria

1. THE Escena_Carreras SHALL declarar una Oportunidad de Logro mayor que cero en su DeclaracionRasgos, basada en la cantidad total de Checkpoints en la Pista.
2. THE Escena_Carreras SHALL distribuir Checkpoints a intervalos regulares a lo largo de la Pista.
3. WHEN el Vehiculo_Jugador alcanza un Checkpoint, THE Escena_Carreras SHALL incrementar la Senal de Logro en una unidad.
4. WHEN el Vehiculo_Jugador supera a un Rival en posición, THE Escena_Carreras SHALL incrementar la Senal de Logro en una unidad.
5. THE Escena_Carreras SHALL incluir la Senal y Oportunidad de Logro acumuladas en la TelemetriaRasgos al finalizar la sesión.

### Requirement 6: Medición de Rasgo Riesgo

**User Story:** Como sistema de scoring, quiero medir las conductas temerarias del jugador durante la carrera, para alimentar el rasgo Riesgo del perfil.

#### Acceptance Criteria

1. THE Escena_Carreras SHALL declarar una Oportunidad de Riesgo mayor que cero en su DeclaracionRasgos, basada en los frames donde el jugador tiene la posibilidad de mantener alta velocidad y en la cantidad de Pasadas_Al_Ras posibles.
2. WHILE la Velocidad_Actual del Vehiculo_Jugador supera el Umbral_Alta_Velocidad, THE Escena_Carreras SHALL acumular Senal de Riesgo proporcionalmente al tiempo en ese estado.
3. WHEN el Vehiculo_Jugador ejecuta una Pasada_Al_Ras junto a un Rival u Obstaculo, THE Escena_Carreras SHALL incrementar la Senal de Riesgo en una unidad.
4. THE Escena_Carreras SHALL incluir la Senal y Oportunidad de Riesgo acumuladas en la TelemetriaRasgos al finalizar la sesión.

### Requirement 7: Integración con el Contrato Compartido

**User Story:** Como equipo de desarrollo, quiero que la Escena_Carreras respete el Contrato_Compartido igual que las demás escenas, para que se registre y funcione sin modificar el Shell ni el Motor_Scoring.

#### Acceptance Criteria

1. THE Escena_Carreras SHALL implementar la interfaz IEscena completa del Contrato_Compartido (declararRasgos, aplicarPerillas, construirTelemetria, setInput).
2. WHEN el Shell invoca init con DatosInicioEscena, THE Escena_Carreras SHALL almacenar las PerillasMutacion, la referencia al Shell y el InputUnificado recibidos.
3. THE Escena_Carreras SHALL consumir exclusivamente el InputUnificado del Contrato_Compartido para leer la entrada del jugador, sin acceder directamente al teclado de Phaser.
4. WHEN la sesión finaliza, THE Escena_Carreras SHALL construir un objeto TelemetriaRasgos con escena igual a 'carreras' y los pares Senal/Oportunidad de los cuatro rasgos.
5. THE Escena_Carreras SHALL reportar la TelemetriaRasgos al Shell mediante reportarTelemetria antes de solicitar la transición de retorno.
6. THE Escena_Carreras SHALL funcionar registrada en REGISTRO_ESCENAS sin requerir modificaciones al Shell ni al Motor_Scoring.

### Requirement 8: Aplicación de Mutación (Perillas)

**User Story:** Como jugador, quiero que la carrera se transforme según mi perfil acumulado, para experimentar un mundo distinto cada vez que entro al nivel oculto.

#### Acceptance Criteria

1. WHEN la Escena_Carreras recibe las PerillasMutacion, THE Escena_Carreras SHALL aplicar la perilla paleta como tinte de color sobre los sprites de la Pista, el Vehiculo_Jugador y los Rivales.
2. WHEN la Escena_Carreras recibe las PerillasMutacion, THE Escena_Carreras SHALL ajustar la cantidad de Rivales generados según la perilla intensidad_enemigos en el rango 0 a 1.
3. WHEN la Escena_Carreras recibe las PerillasMutacion, THE Escena_Carreras SHALL ajustar la velocidad y comportamiento de los Rivales según la perilla agresividad en el rango 0 a 1.
4. WHEN la Escena_Carreras recibe las PerillasMutacion, THE Escena_Carreras SHALL aplicar el efecto de partículas correspondiente a la perilla clima sobre la Pista.
5. WHEN la Escena_Carreras recibe las PerillasMutacion, THE Escena_Carreras SHALL seleccionar la pista de música correspondiente a la perilla mood_musica.
6. WHEN la Escena_Carreras recibe la perilla mensaje, THE Escena_Carreras SHALL mostrar el texto corto de la IA al jugador al inicio de la sesión.
7. THE Escena_Carreras SHALL aplicar todas las mutaciones reutilizando los sprites existentes sin requerir arte adicional por variante de perilla.

### Requirement 9: Estética Visual 8-bit y Consistencia

**User Story:** Como jugador, quiero que la carrera mantenga la misma estética 8-bit pixel art que el resto del juego, para que la experiencia se sienta coherente al entrar al nivel oculto.

#### Acceptance Criteria

1. THE Escena_Carreras SHALL utilizar sprites con estilo pixel art 8-bit consistente con el Nivel_Plataformas, el Nivel_Ritmo y el Nivel_Shooter.
2. THE Escena_Carreras SHALL utilizar una resolución de sprites y tiles coherente con las demás escenas del Juego.
3. THE Escena_Carreras SHALL utilizar la fuente "Press Start 2P" para todo texto en pantalla, consistente con las demás escenas.
4. THE Escena_Carreras SHALL mostrar un HUD mínimo con el tiempo restante y un indicador de velocidad, presentados en estilo pixel art.
5. THE Escena_Carreras SHALL utilizar assets de licencia CC0 para los sprites del vehículo, rivales, pista y obstáculos.

### Requirement 10: Generación Procedural de Pista

**User Story:** Como jugador, quiero que cada carrera se sienta distinta, para que la rejugabilidad del nivel oculto sea alta y no memorice un circuito fijo.

#### Acceptance Criteria

1. THE Escena_Carreras SHALL generar la secuencia de segmentos de Pista de forma procedural al inicio de cada sesión.
2. THE Escena_Carreras SHALL incluir segmentos de recta, curva a la izquierda y curva a la derecha en la generación procedural.
3. THE Escena_Carreras SHALL insertar puntos de bifurcación para Rutas_Alternativas de forma procedural en posiciones variables entre sesiones.
4. THE Escena_Carreras SHALL utilizar una semilla determinística derivada de la sesión para que la generación sea reproducible con la misma semilla.
5. IF la generación procedural produce una secuencia sin Rutas_Alternativas suficientes, THEN THE Escena_Carreras SHALL inyectar Rutas_Alternativas adicionales hasta alcanzar el mínimo de 3.

### Requirement 11: Mapeo de Controles para Carreras

**User Story:** Como jugador, quiero controlar la carrera con las mismas teclas que los demás niveles, para no tener que aprender controles nuevos al entrar al nivel oculto.

#### Acceptance Criteria

1. THE Escena_Carreras SHALL mapear la dirección izquierda del InputUnificado al movimiento lateral izquierdo del Vehiculo_Jugador.
2. THE Escena_Carreras SHALL mapear la dirección derecha del InputUnificado al movimiento lateral derecho del Vehiculo_Jugador.
3. THE Escena_Carreras SHALL mapear la dirección arriba del InputUnificado a la aceleración del Vehiculo_Jugador.
4. THE Escena_Carreras SHALL mapear la acción primaria del InputUnificado a un boost temporal de velocidad con cooldown.
5. THE Escena_Carreras SHALL mapear la acción secundaria del InputUnificado al frenado activo del Vehiculo_Jugador.
