import Phaser from 'phaser';
import { BootScene } from './shell';

/**
 * Punto de entrada del cliente Arcade IA Mutante.
 *
 * Arranca el juego Phaser 3 registrando únicamente la {@link BootScene} como
 * escena inicial (Requirement 8.1). La BootScene inicializa el Perfil_Jugador
 * neutro y construye el `SceneManager` del Shell, que registra de forma
 * declarativa el resto de las Escenas (pantalla de carga + niveles) a partir del
 * `REGISTRO_ESCENAS` (Requirement 9.7) y arranca `Nivel_Plataformas` como primera
 * Escena jugable (Requirement 1.1).
 *
 * Las Escenas jugables NO se listan aquí a propósito: las añade el SceneManager
 * (`game.scene.add`) iterando el registro, de modo que sumar una Escena nueva no
 * requiere tocar este arranque ni el Shell.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#0b0b12',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 900 }, debug: false },
  },
  scene: [BootScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
