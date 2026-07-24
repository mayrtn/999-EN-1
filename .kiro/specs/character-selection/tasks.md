# Implementation Plan: Character Selection Screen

## Overview

Implementación de la pantalla de selección de personaje (Escena_Seleccion) para "Arcade IA Mutante". Se extiende el tipo `EscenaId`, se precargan los spritesheets idle en BootScene, se crea la escena de selección con navegación por teclado/mouse y animación de confirmación, se persiste la selección en `game.registry`, y se integra con el flujo del Shell para que sea la primera escena visible al iniciar el juego.

## Tasks

- [x] 1. Extend EscenaId type and update Shell constants
  - [x] 1.1 Add 'seleccion_personaje' to the EscenaId union type in `src/contrato/rasgos.ts`
    - Add `'seleccion_personaje'` as a new member of the `EscenaId` type union
    - _Requirements: 6.1, 6.2_
  - [x] 1.2 Change PRIMERA_ESCENA to 'seleccion_personaje' in `src/shell/SceneManager.ts`
    - Update the constant `PRIMERA_ESCENA` from `'plataformas'` to `'seleccion_personaje'`
    - _Requirements: 6.2_

- [x] 2. Preload character idle spritesheets in BootScene
  - [x] 2.1 Add spritesheet loading in `BootScene.preload()` in `src/shell/BootScene.ts`
    - Load `Pink_Monster_Idle_4.png` as spritesheet with key `'pink_monster_idle'` (frameWidth: 32, frameHeight: 32)
    - Load `Owlet_Monster_Idle_4.png` as spritesheet with key `'owlet_monster_idle'` (frameWidth: 32, frameHeight: 32)
    - Load `Dude_Monster_Idle_4.png` as spritesheet with key `'dude_monster_idle'` (frameWidth: 32, frameHeight: 32)
    - Add a `this.load.on('loaderror', ...)` handler that logs the failed asset key to console and continues loading
    - _Requirements: 5.1, 5.3_

- [x] 3. Create EscenaSeleccion scene class
  - [x] 3.1 Create the file `src/escenas/EscenaSeleccion.ts` with class skeleton
    - Define `IdPersonaje` type: `'pink_monster' | 'owlet_monster' | 'dude_monster'`
    - Define `DatosPersonaje` interface with `id`, `nombre`, `spriteKey`, `animKey`
    - Export `CLAVE_PERSONAJE = 'personaje_seleccionado'` constant
    - Export `ID_SELECCION = 'seleccion_personaje'` constant (matching the EscenaId value)
    - Define `PERSONAJES` readonly array with the three character data entries (pink_monster, owlet_monster, dude_monster)
    - Create `EscenaSeleccion extends Phaser.Scene` with constructor using key `ID_SELECCION`
    - Add private state: `indiceActual: number = 0`, `sprites: Phaser.GameObjects.Sprite[] = []`, `indicador: Phaser.GameObjects.Rectangle | null = null`, `inputDeshabilitado: boolean = false`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.1_

  - [x] 3.2 Implement `create()` method — sprite layout and animations
    - Create 3 sprites at X positions 240, 480, 720 and Y ~270 (center vertical), each with scale 3
    - Create idle animations for each character: 4 frames, frameRate 6, repeat -1 (loop)
    - Play idle animation on each sprite immediately
    - Add character name labels below each sprite (Text objects, pixel art style font, ~16px)
    - Add title text "Elige tu personaje" centered horizontally in top 20% of canvas (font size 28px)
    - Handle missing textures: if a sprite key is not loaded, create a 96x96 colored rectangle as placeholder with the character name
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.2, 6.4_

  - [x] 3.3 Implement visual indicator (selection highlight)
    - Create a `Phaser.GameObjects.Rectangle` with lineStyle 2px, stroke color #FFD700, no fill
    - Position around the first sprite (indiceActual = 0) by default
    - Implement `actualizarIndicador()` that repositions the rectangle to the current `indiceActual` sprite
    - _Requirements: 3.1, 3.2, 2.6_

  - [x] 3.4 Implement keyboard navigation
    - Register cursor key listeners (left arrow, right arrow)
    - Left arrow: decrement `indiceActual` with circular wrap (0 → 2)
    - Right arrow: increment `indiceActual` with circular wrap (2 → 0)
    - After changing index, call `actualizarIndicador()`
    - All input handlers check `inputDeshabilitado` flag and return early if true
    - _Requirements: 2.1, 2.2, 2.7, 3.4_

  - [x] 3.5 Implement mouse/click navigation
    - Make each sprite interactive (`sprite.setInteractive()`)
    - On single click (`pointerdown`): set `indiceActual` to clicked sprite index, call `actualizarIndicador()`
    - Track double-click via timestamp comparison (< 300ms between clicks on same sprite): trigger `confirmarSeleccion()`
    - _Requirements: 2.3, 2.5_

  - [x] 3.6 Implement confirmation flow (Enter/Space + animation + transition)
    - Register Enter and Space key listeners that call `confirmarSeleccion()`
    - `confirmarSeleccion()`: set `inputDeshabilitado = true`, store `IdPersonaje` in `game.registry` under `CLAVE_PERSONAJE`, play scale tween (1.0 → 1.3x over 300ms) on selected sprite, on tween complete call `solicitarTransicion('plataformas')` via the SceneManager/IShell reference
    - Get IShell reference: read SceneManager from `this.game.registry.get('sceneManager')` and call `solicitarTransicion`
    - _Requirements: 2.4, 2.7, 3.3, 3.4, 4.1, 6.3_

- [x] 4. Register EscenaSeleccion in the Shell
  - [x] 4.1 Add EscenaSeleccion entry to `REGISTRO_ESCENAS` in `src/shell/registroEscenas.ts`
    - Import `EscenaSeleccion` from `'../escenas/EscenaSeleccion'`
    - Since EscenaSeleccion is NOT an `EscenaJugable` (does not implement IEscena), add it with a type assertion: `{ id: 'seleccion_personaje', crear: () => new EscenaSeleccion() as unknown as EscenaJugable, habilitada: true }`
    - Place it as the first entry in the array (before 'plataformas') so it registers first
    - _Requirements: 6.1, 6.2_

  - [x] 4.2 Export EscenaSeleccion from `src/escenas/index.ts` barrel file
    - Add `export { EscenaSeleccion } from './EscenaSeleccion';`
    - _Requirements: 6.1_

- [x] 5. Checkpoint — Verify Shell integration
  - Ensure all tests pass, ask the user if questions arise.
  - Verify the game boots, BootScene preloads spritesheets, SceneManager starts EscenaSeleccion as first scene, navigation and confirmation work, and transition to 'plataformas' occurs correctly.

- [x] 6. Add character selection guard to level scenes
  - [x] 6.1 Add validation logic at the start of each level scene's `create()` method
    - In `NivelPlataformas`, `NivelRitmo`, `NivelShooter`, and `EscenaCarreras`: read `game.registry.get('personaje_seleccionado')`
    - If value is null or not one of `['pink_monster', 'owlet_monster', 'dude_monster']`, redirect to `'seleccion_personaje'` via `this.shell.solicitarTransicion('seleccion_personaje')` and return early
    - Import `CLAVE_PERSONAJE` from `EscenaSeleccion` module for the registry key
    - _Requirements: 4.3, 4.4_

- [x] 7. Final checkpoint — Full integration verification
  - Ensure all tests pass, ask the user if questions arise.
  - Verify full flow: boot → preload → selection screen → navigate → confirm → persist → transition to plataformas → plataformas reads correct personaje.

## Notes

- EscenaSeleccion is a Shell scene (like BootScene), NOT a playable scene — it does not implement IEscena, does not emit telemetry, and does not declare traits.
- The type assertion in registroEscenas is necessary because the existing `RegistroEscena` interface expects `EscenaJugable`, but EscenaSeleccion does not implement that contract. An alternative approach is to modify `RegistroEscena` to accept `Phaser.Scene` for Shell scenes, but that requires broader refactoring beyond this feature scope.
- Asset paths use Vite's static asset handling — paths are relative to the project root served by Vite dev server.
- The `game.registry` persists for the lifetime of the Phaser.Game instance (until page close/reload), satisfying Requirement 4.2 without additional persistence logic.
