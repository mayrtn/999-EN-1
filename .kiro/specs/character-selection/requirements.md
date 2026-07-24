# Requirements Document

## Introduction

Pantalla de Selección de Personaje para "Arcade IA Mutante". Antes de iniciar el juego, se presenta al jugador una pantalla 2D con estilo pixel art donde se muestran los tres personajes disponibles (Pink Monster, Owlet Monster, Dude Monster) con sus animaciones idle en pixel art. El jugador elige un personaje y esa selección persiste durante toda la sesión de juego en todos los niveles. Todo el arte y la UI de esta pantalla respetan la estética 2D pixel art del juego.

## Glossary

- **Escena_Seleccion**: Una Scene de Phaser (infraestructura del Shell, no jugable) que muestra los tres personajes disponibles y permite al jugador elegir uno antes de iniciar el juego.
- **Sprite_Personaje**: Un sprite 2D pixel art animado renderizado desde el spritesheet idle de un personaje, mostrado en la Escena_Seleccion como vista previa.
- **Id_Personaje**: Un identificador string único para cada personaje jugable: `'pink_monster'`, `'owlet_monster'`, `'dude_monster'`.
- **Seleccion_Personaje**: El registro del Id_Personaje elegido por el jugador, almacenado en el Registro_Sesion para uso de todos los niveles.
- **Registro_Sesion**: El `game.registry` (DataManager de Phaser) compartido entre todas las escenas, usado como fuente única de verdad del estado de sesión (incluyendo Perfil_Jugador y Seleccion_Personaje).
- **Indicador_Seleccion**: Un elemento visual pixel art (marco o borde resaltado) que muestra sobre qué personaje está posicionado el jugador actualmente.

## Requirements

### Requirement 1: Mostrar los tres personajes

**User Story:** Como jugador, quiero ver los tres personajes disponibles en la pantalla de selección, para poder compararlos antes de elegir.

#### Acceptance Criteria

1. WHEN la Escena_Seleccion inicia, THE Escena_Seleccion SHALL mostrar exactamente tres Sprite_Personaje dispuestos horizontalmente con espaciado uniforme, en el orden de izquierda a derecha: Pink Monster, Owlet Monster, Dude Monster, centrados verticalmente en el canvas.
2. WHEN la Escena_Seleccion inicia, THE Escena_Seleccion SHALL mostrar cada Sprite_Personaje reproduciendo su animación idle de 4 frames en un ciclo continuo a una velocidad de 6 frames por segundo.
3. THE Escena_Seleccion SHALL mostrar el nombre del personaje debajo de cada Sprite_Personaje como etiqueta de texto: "Pink Monster", "Owlet Monster", "Dude Monster".
4. THE Escena_Seleccion SHALL renderizar todos los Sprite_Personaje en estilo pixel art 2D (con `pixelArt: true` en la configuración de Phaser) a una escala mínima de 3x sobre el tamaño original del spritesheet, de modo que cada personaje ocupe al menos 96x96 píxeles renderizados en el canvas de 960x540.
5. IF un Sprite_Personaje se renderiza fuera de los límites visibles del canvas de 960x540, THEN THE Escena_Seleccion SHALL reposicionar los tres Sprite_Personaje para que todos queden completamente dentro del área visible.

### Requirement 2: Input de selección de personaje

**User Story:** Como jugador, quiero navegar entre personajes y confirmar mi elección, para poder seleccionar el personaje que prefiera.

#### Acceptance Criteria

1. WHEN el jugador presiona la tecla flecha izquierda, THE Escena_Seleccion SHALL mover el Indicador_Seleccion al personaje anterior en el orden circular (Pink Monster → Dude Monster → Owlet Monster → Pink Monster).
2. WHEN el jugador presiona la tecla flecha derecha, THE Escena_Seleccion SHALL mover el Indicador_Seleccion al siguiente personaje en el orden circular (Pink Monster → Owlet Monster → Dude Monster → Pink Monster).
3. WHEN el jugador hace clic sobre un Sprite_Personaje, THE Escena_Seleccion SHALL mover el Indicador_Seleccion al personaje clickeado.
4. WHEN el jugador presiona la tecla Enter o la tecla Espacio, THE Escena_Seleccion SHALL confirmar la selección del personaje actualmente resaltado y solicitar la transición al primer nivel de juego.
5. WHEN el jugador hace doble clic sobre un Sprite_Personaje, THE Escena_Seleccion SHALL confirmar la selección de ese personaje y solicitar la transición al primer nivel de juego.
6. WHEN la Escena_Seleccion inicia, THE Escena_Seleccion SHALL resaltar el primer personaje (Pink Monster) por defecto.
7. WHEN el jugador confirma una selección, THE Escena_Seleccion SHALL deshabilitar toda entrada de teclado y mouse hasta que la transición de escena se complete, para evitar confirmaciones duplicadas.

### Requirement 3: Retroalimentación visual

**User Story:** Como jugador, quiero retroalimentación visual clara sobre qué personaje está resaltado y cuándo confirmo mi selección, para entender mis interacciones.

#### Acceptance Criteria

1. WHILE un personaje está resaltado, THE Escena_Seleccion SHALL mostrar el Indicador_Seleccion (un borde pixel art de color de 2px de grosor) alrededor del Sprite_Personaje correspondiente.
2. WHEN el Indicador_Seleccion se mueve a un personaje diferente, THE Escena_Seleccion SHALL remover el indicador del personaje anterior y mostrarlo en el nuevo dentro del mismo frame.
3. WHEN el jugador confirma una selección, THE Escena_Seleccion SHALL reproducir una animación de escala de 1.0x a 1.3x durante 300ms en el Sprite_Personaje seleccionado antes de realizar la transición.
4. WHILE la animación de confirmación se reproduce, THE Escena_Seleccion SHALL ignorar toda entrada de teclado y mouse.

### Requirement 4: Persistir la selección del personaje

**User Story:** Como jugador, quiero que mi elección de personaje se recuerde durante toda la sesión de juego, para que todos los niveles usen mi personaje elegido.

#### Acceptance Criteria

1. WHEN el jugador confirma una selección, THE Escena_Seleccion SHALL almacenar el Id_Personaje elegido (uno de 'pink_monster', 'owlet_monster', 'dude_monster') en el Registro_Sesion bajo la clave 'personaje_seleccionado'.
2. THE Registro_Sesion SHALL retener la Seleccion_Personaje desde el momento de la confirmación hasta que el juego se cierre o se recargue la página, sin requerir re-selección entre niveles.
3. WHEN una escena de nivel (NivelPlataformas, NivelRitmo, NivelShooter o EscenaCarreras) inicia, THE escena de nivel SHALL leer el Id_Personaje de la clave 'personaje_seleccionado' del Registro_Sesion y usar el spritesheet correspondiente para el avatar del jugador.
4. IF la escena de nivel lee la clave 'personaje_seleccionado' del Registro_Sesion y el valor es nulo o no coincide con ningún Id_Personaje válido, THEN THE escena de nivel SHALL redirigir al jugador a la Escena_Seleccion para que realice una selección válida.

### Requirement 5: Carga de assets

**User Story:** Como desarrollador, quiero que los spritesheets de los personajes se precarguen antes de que aparezca la pantalla de selección, para que las animaciones idle se reproduzcan sin demora.

#### Acceptance Criteria

1. WHEN el juego arranca, THE BootScene SHALL precargar el spritesheet de animación idle de cada uno de los tres personajes (Pink_Monster_Idle_4.png, Owlet_Monster_Idle_4.png, Dude_Monster_Idle_4.png) como spritesheets de 4 frames de 32×32 píxeles cada uno, completando la carga antes de que la Escena_Seleccion inicie.
2. IF un spritesheet de personaje falla al cargar, THEN THE Escena_Seleccion SHALL mostrar un rectángulo placeholder de 32×32 píxeles con el nombre del personaje, permitiendo que dicho personaje siga siendo navegable y seleccionable como los demás.
3. IF el loader de Phaser emite un evento de error de archivo para un spritesheet de personaje, THEN THE BootScene SHALL registrar el Id_Personaje afectado y continuar la carga de los assets restantes sin interrumpir la transición a la Escena_Seleccion.

### Requirement 6: Integración con el Shell

**User Story:** Como desarrollador, quiero que la pantalla de selección se integre con la arquitectura Shell existente, para que encaje naturalmente en el flujo del juego.

#### Acceptance Criteria

1. THE Escena_Seleccion SHALL tener una entrada en REGISTRO_ESCENAS con `habilitada: true`, de modo que el SceneManager la registre en el gestor de escenas de Phaser durante `registrarEscenas()` antes de que cualquier escena jugable inicie.
2. WHEN la BootScene termina su inicialización, THE SceneManager SHALL iniciar la Escena_Seleccion como primera escena en lugar de iniciar directamente Nivel_Plataformas (reemplazando el valor de PRIMERA_ESCENA por el id de Escena_Seleccion).
3. WHEN el jugador confirma una selección de personaje, THE Escena_Seleccion SHALL almacenar el identificador del personaje seleccionado en el registro de sesión del juego (`game.registry`) y luego solicitar una transición a Nivel_Plataformas invocando `solicitarTransicion('plataformas')` a través de la fachada IShell.
4. THE Escena_Seleccion SHALL mostrar un texto de título "Elige tu personaje" centrado horizontalmente dentro del 20% superior del canvas, con una fuente de bitmap de estilo pixel art de tamaño entre 24px y 32px.
5. IF la Escena_Seleccion no se encuentra habilitada en REGISTRO_ESCENAS al momento de la transición, THEN THE SceneManager SHALL registrar una advertencia en consola y no iniciar ninguna escena jugable.
