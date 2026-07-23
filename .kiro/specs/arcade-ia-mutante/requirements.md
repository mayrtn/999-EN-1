# Requirements Document

## Introduction

Arcade IA Mutante es un videojuego arcade 8-bit para hackatón, homenaje a los clásicos de la historia de los videojuegos, construido con arte y nombres propios (sin marcas reales). El juego combina un nivel principal de plataformas con dos niveles ocultos de otros géneros (ritmo y shooter de galería fija), accesibles desde zonas secretas al estilo de los plataformas clásicos.

El corazón del juego es una IA central híbrida: una heurística determinística mide cuatro rasgos de personalidad del jugador (Furia, Curiosidad, Logro, Riesgo) a partir de sus acciones, sin hacerle preguntas. Al finalizar cada escena, el perfil acumulado se envía a AWS Bedrock durante la pantalla de carga, y la respuesta muta el mundo de la siguiente escena mediante un conjunto cerrado de "perillas". Si Bedrock falla o tarda, una mutación por defecto calculada por heurística garantiza que el juego continúe: la IA nunca es un punto único de falla.

El juego no emite un veredicto final. El mundo simplemente se transforma según cómo se juega, de modo que dos personas experimentan dos juegos distintos. El "wow" del hackatón es "mirá cómo cambió el mundo según cómo jugué".

Este documento define los requisitos para: el nivel principal de plataformas, los dos niveles ocultos, el motor de scoring de rasgos, la integración con Bedrock y su fallback, el sistema de mutación por perillas, el shell/gestor de escenas y transiciones, el contrato compartido, el despliegue en AWS y el documento de decisiones abiertas del equipo.

## Alcance de la Demo

- 1 nivel principal de plataformas.
- 2 niveles ocultos de otros géneros (Ritmo y Shooter de Galería Fija, sujetos a confirmación del equipo — ver Requirement 12).
- Cada minijuego oculto dura entre 60 y 90 segundos.
- Demo mostrable y jugable en 2-3 minutos, entregada como video, con el juego desplegado y jugable en la nube.

## Supuestos de Trabajo

- Los dos géneros ocultos son Ritmo y Shooter de Galería Fija (carreras quedó fuera del alcance duro por el costo de física). Este supuesto está pendiente de confirmación del equipo.
- Se contempla un TERCER nivel oculto OPCIONAL de género carreras (Escena_Carreras), con un candidato pseudo-3D estilo OutRun y un plan B de esquiva-carriles. Este tercer nivel es opcional y queda fuera del alcance duro de la demo; se considera una escena futura y extensible sujeta a confirmación del equipo (ver Requirement 12). Nota guía no vinculante sobre cómo una carrera mediría los rasgos: Furia se mediría embistiendo rivales, Curiosidad tomando rutas alternativas o atajos, Logro alcanzando checkpoints y mejorando la posición, y Riesgo manteniendo velocidad sostenida sin frenar y realizando pasadas al ras.
- El esquema exacto de controles de teclado queda por definir (ver Requirement 12).
- El mapa fino de rasgos a valores exactos de cada perilla queda por definir (ver Requirement 12).
- El pack de assets maestro queda por definir (ver Requirement 12).

## Glossary

- **Juego**: El videojuego arcade 8-bit Arcade IA Mutante en su totalidad, incluyendo el cliente Phaser y sus servicios.
- **Shell**: El gestor de escenas y transiciones que orquesta el arranque, el flujo entre niveles, las pantallas de carga y el mantenimiento del perfil del jugador.
- **Nivel_Plataformas**: El nivel principal de género plataformas (correr, saltar, monedas, enemigos, bloques) que contiene accesos a los niveles ocultos.
- **Nivel_Ritmo**: El nivel oculto de género ritmo, con duración de 60 a 90 segundos.
- **Nivel_Shooter**: El nivel oculto de género shooter de galería fija, con duración de 60 a 90 segundos.
- **Escena_Carreras**: El tercer nivel oculto opcional de género carreras, con un candidato pseudo-3D estilo OutRun y un plan B de esquiva-carriles; escena futura y extensible fuera del alcance duro de la demo, sujeta a confirmación del equipo.
- **Escena**: Una unidad jugable individual (Nivel_Plataformas, Nivel_Ritmo, Nivel_Shooter o Escena_Carreras) que declara qué rasgos puede medir y participa en el contrato compartido.
- **Motor_Scoring**: El componente determinístico que calcula el score de cada rasgo por escena mediante normalización por oportunidad.
- **Rasgo**: Una de las cuatro dimensiones de personalidad medidas: Furia (destruir), Curiosidad (explorar), Logro (completar/juntar), Riesgo (arriesgar). Inspirado en la taxonomía de Bartle y la escala DOSPERT.
- **Senal**: La cantidad de acciones relevantes a un rasgo que el jugador realizó en una escena.
- **Oportunidad**: El máximo de acciones relevantes a un rasgo que la escena ofreció al jugador. Determina el tope de medición del rasgo en esa escena.
- **Score_Rasgo**: El valor normalizado de un rasgo en una escena, calculado como señal dividido oportunidad, acotado al rango de 0.0 a 1.0.
- **Perfil_Jugador**: El estado acumulado de los cuatro rasgos entre escenas, calculado como promedio ponderado de los scores por escena.
- **Peso_Rasgo**: El peso con que una escena contribuye a un rasgo en el Perfil_Jugador; puede ser 0 si la escena no mide ese rasgo.
- **Telemetria_Rasgos**: El objeto que cada escena emite al terminar, con la identidad de la escena y, por cada rasgo, su señal y su oportunidad.
- **Perillas_Mutacion**: El conjunto cerrado de parámetros que muta el mundo de la siguiente escena: paleta, intensidad_enemigos, agresividad, clima, mood_musica y mensaje.
- **Servicio_IA**: El servicio de AWS Bedrock que recibe el Perfil_Jugador y devuelve las Perillas_Mutacion en formato JSON.
- **Servicio_Backend**: La función Lambda expuesta a través de API Gateway que intermedia entre el Juego y el Servicio_IA.
- **Mutacion_Fallback**: Las Perillas_Mutacion calculadas localmente por heurística cuando el Servicio_IA falla o excede el tiempo límite.
- **Sistema_Mutacion**: El componente que aplica las Perillas_Mutacion a una escena mediante tinte de color, partículas, densidad y agresividad de enemigos, pista de música y parámetros.
- **Contrato_Compartido**: El acuerdo de interfaces definido el primer día que todos los niveles respetan: telemetría de rasgos, perillas de mutación e input unificado.
- **Documento_Decisiones**: El documento de decisiones abiertas que enumera las cosas a definir en equipo.
- **Infraestructura_AWS**: El conjunto de recursos de AWS que alojan y sirven el juego: S3, CloudFront, Lambda, API Gateway y Bedrock.

## Requirements

### Requirement 1: Nivel Principal de Plataformas

**User Story:** Como jugador, quiero un nivel de plataformas jugable con correr, saltar, monedas, enemigos y bloques, para tener el punto de partida clásico desde el cual descubrir los niveles ocultos.

#### Acceptance Criteria

1. WHEN el jugador inicia el Juego, THE Shell SHALL cargar el Nivel_Plataformas como primera escena jugable.
2. WHEN el jugador presiona una tecla de movimiento definida en el Contrato_Compartido, THE Nivel_Plataformas SHALL desplazar al personaje en la dirección correspondiente.
3. WHEN el jugador presiona la tecla de salto definida en el Contrato_Compartido, THE Nivel_Plataformas SHALL aplicar un impulso vertical al personaje.
4. WHEN el personaje del jugador entra en contacto con una moneda, THE Nivel_Plataformas SHALL registrar la moneda como recolectada y removerla de la escena.
5. WHEN el personaje del jugador entra en contacto con un enemigo en estado hostil, THE Nivel_Plataformas SHALL aplicar la consecuencia de daño definida por el Contrato_Compartido.
6. THE Nivel_Plataformas SHALL contener al menos dos accesos a niveles ocultos ubicados en zonas secretas.
7. WHEN el personaje del jugador activa un acceso a un nivel oculto, THE Nivel_Plataformas SHALL notificar al Shell la solicitud de transición hacia el nivel oculto correspondiente.
8. WHEN el Nivel_Plataformas termina, THE Nivel_Plataformas SHALL emitir la Telemetria_Rasgos conforme al Contrato_Compartido.

### Requirement 2: Nivel Oculto de Ritmo

**User Story:** Como jugador, quiero un nivel oculto de ritmo, para experimentar un género distinto dentro del mismo juego durante una sesión corta.

#### Acceptance Criteria

1. WHEN el Shell inicia el Nivel_Ritmo, THE Nivel_Ritmo SHALL comenzar una sesión jugable de duración entre 60 y 90 segundos.
2. WHEN el jugador presiona una tecla de acción del Contrato_Compartido en coincidencia con una señal rítmica dentro de la ventana de acierto, THE Nivel_Ritmo SHALL registrar un acierto.
3. IF el jugador presiona una tecla de acción fuera de la ventana de acierto de toda señal rítmica, THEN THE Nivel_Ritmo SHALL registrar un fallo.
4. WHEN transcurre la duración de la sesión, THE Nivel_Ritmo SHALL finalizar y notificar al Shell la solicitud de retorno.
5. WHEN el Nivel_Ritmo se inicia, THE Nivel_Ritmo SHALL aplicar las Perillas_Mutacion recibidas conforme al Contrato_Compartido.
6. WHEN el Nivel_Ritmo termina, THE Nivel_Ritmo SHALL emitir la Telemetria_Rasgos conforme al Contrato_Compartido.

### Requirement 3: Nivel Oculto de Shooter de Galería Fija

**User Story:** Como jugador, quiero un nivel oculto de shooter de galería fija, para experimentar un segundo género distinto dentro del mismo juego durante una sesión corta.

#### Acceptance Criteria

1. WHEN el Shell inicia el Nivel_Shooter, THE Nivel_Shooter SHALL comenzar una sesión jugable de duración entre 60 y 90 segundos.
2. WHEN el jugador presiona la tecla de apuntado o movimiento de mira del Contrato_Compartido, THE Nivel_Shooter SHALL desplazar la mira en la dirección correspondiente.
3. WHEN el jugador presiona la tecla de disparo del Contrato_Compartido, THE Nivel_Shooter SHALL generar un disparo en la posición de la mira.
4. WHEN un disparo impacta un objetivo, THE Nivel_Shooter SHALL registrar el impacto y remover el objetivo de la escena.
5. WHEN transcurre la duración de la sesión, THE Nivel_Shooter SHALL finalizar y notificar al Shell la solicitud de retorno.
6. WHEN el Nivel_Shooter se inicia, THE Nivel_Shooter SHALL aplicar las Perillas_Mutacion recibidas conforme al Contrato_Compartido.
7. WHEN el Nivel_Shooter termina, THE Nivel_Shooter SHALL emitir la Telemetria_Rasgos conforme al Contrato_Compartido.

### Requirement 4: Motor de Scoring de Rasgos

**User Story:** Como diseñador del juego, quiero un motor determinístico que mida los cuatro rasgos de personalidad a partir de las acciones del jugador, para transformar el mundo sin preguntarle nada al jugador.

#### Acceptance Criteria

1. THE Motor_Scoring SHALL medir los cuatro Rasgos Furia, Curiosidad, Logro y Riesgo exclusivamente a partir de las acciones del jugador.
2. WHEN una Escena declara los Rasgos que puede medir y el tope de Oportunidad de cada uno, THE Motor_Scoring SHALL registrar esa declaración antes de iniciar la medición.
3. WHEN una Escena termina, THE Motor_Scoring SHALL calcular el Score_Rasgo de cada Rasgo como la Senal dividida por la Oportunidad de ese Rasgo en la Escena.
4. THE Motor_Scoring SHALL acotar cada Score_Rasgo al rango de 0.0 a 1.0 inclusive.
5. IF la Oportunidad de un Rasgo en una Escena es 0, THEN THE Motor_Scoring SHALL asignar Peso_Rasgo 0 a ese Rasgo en esa Escena y excluirlo del cálculo del Perfil_Jugador para esa Escena.
6. WHEN el Motor_Scoring calcula los Score_Rasgo de una Escena, THE Motor_Scoring SHALL actualizar el Perfil_Jugador de cada Rasgo como el promedio ponderado de los Score_Rasgo acumulados usando el Peso_Rasgo de cada Escena.
7. THE Motor_Scoring SHALL producir el mismo Perfil_Jugador para la misma secuencia de acciones del jugador.

### Requirement 5: Integración con el Servicio de IA (Bedrock)

**User Story:** Como jugador, quiero que el mundo se adapte a mi forma de jugar mediante una IA central, para que mi experiencia sea única y distinta de la de otros jugadores.

#### Acceptance Criteria

1. WHEN el Shell inicia una transición entre Escenas, THE Shell SHALL enviar el Perfil_Jugador al Servicio_Backend de forma asíncrona durante la pantalla de carga.
2. WHEN el Servicio_Backend recibe el Perfil_Jugador, THE Servicio_Backend SHALL solicitar al Servicio_IA las Perillas_Mutacion para la siguiente Escena.
3. WHEN el Servicio_IA responde, THE Servicio_Backend SHALL devolver las Perillas_Mutacion en formato JSON conforme al conjunto cerrado del Contrato_Compartido.
4. WHEN el Servicio_Backend devuelve las Perillas_Mutacion, THE Shell SHALL validar que cada perilla pertenece al conjunto cerrado y a su rango permitido antes de aplicarlas.
5. IF las Perillas_Mutacion recibidas contienen un valor fuera del conjunto cerrado o de su rango permitido, THEN THE Shell SHALL descartar la respuesta y usar la Mutacion_Fallback.
6. THE Shell SHALL resolver las Perillas_Mutacion sin bloquear el bucle de frames del Juego.

### Requirement 6: Fallback de Mutación Obligatorio

**User Story:** Como jugador, quiero que el juego continúe sin interrupciones aunque la IA falle o tarde, para que la experiencia nunca se rompa por un problema del servicio externo.

#### Acceptance Criteria

1. THE Shell SHALL calcular una Mutacion_Fallback por heurística a partir del Perfil_Jugador para cada transición entre Escenas.
2. IF el Servicio_IA no responde dentro del tiempo límite definido, THEN THE Shell SHALL aplicar la Mutacion_Fallback y continuar la transición.
3. IF el Servicio_Backend o el Servicio_IA devuelve un error, THEN THE Shell SHALL aplicar la Mutacion_Fallback y continuar la transición.
4. THE Mutacion_Fallback SHALL producir Perillas_Mutacion válidas conforme al conjunto cerrado del Contrato_Compartido.
5. WHEN el Shell aplica la Mutacion_Fallback, THE Shell SHALL continuar el flujo de Escenas sin exponer una interrupción al jugador.

### Requirement 7: Sistema de Mutación por Perillas

**User Story:** Como jugador, quiero ver el mundo transformarse según mi forma de jugar, para que el "wow" de ver dos juegos distintos sea evidente sin necesidad de arte nuevo por variante.

#### Acceptance Criteria

1. WHEN una Escena recibe las Perillas_Mutacion, THE Sistema_Mutacion SHALL aplicar la perilla paleta como un tinte de color sobre los sprites existentes.
2. WHEN una Escena recibe las Perillas_Mutacion, THE Sistema_Mutacion SHALL ajustar la densidad de enemigos según la perilla intensidad_enemigos dentro del rango de 0 a 1.
3. WHEN una Escena recibe las Perillas_Mutacion, THE Sistema_Mutacion SHALL ajustar la agresividad de enemigos según la perilla agresividad dentro del rango de 0 a 1.
4. WHEN una Escena recibe las Perillas_Mutacion, THE Sistema_Mutacion SHALL aplicar el efecto de partículas y clima correspondiente a la perilla clima.
5. WHEN una Escena recibe las Perillas_Mutacion, THE Sistema_Mutacion SHALL seleccionar la pista de música correspondiente a la perilla mood_musica.
6. WHEN una Escena recibe la perilla mensaje, THE Sistema_Mutacion SHALL mostrar el texto corto de la IA al jugador.
7. THE Sistema_Mutacion SHALL aplicar todas las mutaciones reutilizando los sprites existentes sin requerir arte nuevo por variante.

### Requirement 8: Shell y Gestor de Escenas y Transiciones

**User Story:** Como jugador, quiero un flujo fluido entre el nivel principal, los niveles ocultos y las pantallas de carga, para que la experiencia se sienta continua mientras la IA transforma el mundo por detrás.

#### Acceptance Criteria

1. WHEN el Juego arranca, THE Shell SHALL inicializar el Perfil_Jugador con los cuatro Rasgos y cargar la primera Escena.
2. WHEN una Escena solicita una transición, THE Shell SHALL mostrar una pantalla de carga mientras se resuelven las Perillas_Mutacion de la siguiente Escena.
3. WHEN una Escena emite la Telemetria_Rasgos, THE Shell SHALL entregar la Telemetria_Rasgos al Motor_Scoring para actualizar el Perfil_Jugador.
4. WHEN las Perillas_Mutacion de la siguiente Escena están resueltas, THE Shell SHALL cargar la siguiente Escena y entregarle las Perillas_Mutacion antes de iniciarla.
5. WHEN un nivel oculto finaliza, THE Shell SHALL retornar al Nivel_Plataformas y aplicar las Perillas_Mutacion resueltas para el retorno.
6. THE Shell SHALL mantener el Perfil_Jugador acumulado a lo largo de toda la sesión de juego.

### Requirement 9: Contrato Compartido

**User Story:** Como equipo de tres desarrolladores, quiero un contrato de interfaces definido el primer día, para que cada uno construya su nivel de forma independiente y todos encajen.

#### Acceptance Criteria

1. WHEN una Escena termina, THE Escena SHALL emitir la Telemetria_Rasgos con la identidad de la Escena y, por cada Rasgo, su Senal y su Oportunidad.
2. THE Contrato_Compartido SHALL definir las Perillas_Mutacion como un conjunto cerrado compuesto por paleta con valores en {infierno, sueno, neon, hostil}, intensidad_enemigos en el rango 0 a 1, agresividad en el rango 0 a 1, clima con valores en {ninguno, lluvia, brasas, niebla}, mood_musica con valores en {calma, epico, tenso, furioso} y mensaje como texto corto.
3. THE Servicio_IA SHALL devolver las Perillas_Mutacion como JSON conforme al conjunto cerrado definido por el Contrato_Compartido.
4. THE Nivel_Plataformas, THE Nivel_Ritmo y THE Nivel_Shooter SHALL leer y aplicar las Perillas_Mutacion del conjunto cerrado del Contrato_Compartido.
5. THE Contrato_Compartido SHALL definir el input unificado como solo teclado con el mismo mapa de teclas en los tres niveles.
6. THE Nivel_Plataformas, THE Nivel_Ritmo y THE Nivel_Shooter SHALL usar el mismo mapa de teclas definido por el Contrato_Compartido.
7. THE Shell SHALL permitir registrar Escenas adicionales que respeten el Contrato_Compartido sin modificar el Shell ni el Motor_Scoring.

### Requirement 10: Despliegue en AWS

**User Story:** Como equipo de hackatón, quiero el juego desplegado y jugable en la nube usando servicios de AWS, para cumplir el requisito duro de uso obligatorio de AWS y poder mostrar la demo en vivo.

#### Acceptance Criteria

1. THE Infraestructura_AWS SHALL alojar los archivos estáticos del Juego en S3.
2. THE Infraestructura_AWS SHALL servir el Juego a través de CloudFront.
3. WHEN el Juego solicita las Perillas_Mutacion, THE Servicio_Backend SHALL exponerse mediante una función Lambda a través de API Gateway.
4. THE Servicio_Backend SHALL invocar el Servicio_IA de AWS Bedrock para obtener las Perillas_Mutacion.
5. WHEN un espectador accede a la URL pública de CloudFront, THE Juego SHALL cargar y ser jugable en un navegador.
6. IF una solicitud al Servicio_Backend carece de la autorización válida definida, THEN THE Servicio_Backend SHALL rechazar la solicitud sin invocar el Servicio_IA.

### Requirement 11: Assets y Estética 8-bit con Contenido Propio

**User Story:** Como equipo, quiero usar arte y sonido de licencia libre y nombres propios, para lograr la estética 8-bit de homenaje sin infringir marcas reales.

#### Acceptance Criteria

1. THE Juego SHALL usar nombres y arte propios sin incluir marcas reales de videojuegos existentes.
2. THE Juego SHALL usar assets de licencia CC0 para gráficos y sonido.
3. THE Juego SHALL presentar una estética visual 8-bit consistente en las tres Escenas.

### Requirement 12: Documento de Decisiones Abiertas

**User Story:** Como equipo de tres desarrolladores, quiero un documento de decisiones abiertas que enumere las cosas a definir en equipo, para alinear los acuerdos pendientes antes y durante la construcción.

#### Acceptance Criteria

1. THE Documento_Decisiones SHALL incluir el esquema de controles definitivo de teclado.
2. THE Documento_Decisiones SHALL incluir la confirmación de los dos géneros ocultos.
3. THE Documento_Decisiones SHALL incluir el mapa fino de Rasgos a los valores exactos de cada perilla de las Perillas_Mutacion.
4. THE Documento_Decisiones SHALL incluir la elección del pack de assets maestro.
5. THE Documento_Decisiones SHALL incluir la confirmación o el descarte del tercer nivel oculto de género carreras (Escena_Carreras).
6. WHERE el equipo confirma la Escena_Carreras, THE Documento_Decisiones SHALL registrar la elección del enfoque técnico entre pseudo-3D estilo OutRun y esquiva-carriles.
7. WHERE una decisión abierta queda resuelta por el equipo, THE Documento_Decisiones SHALL registrar la decisión tomada.
