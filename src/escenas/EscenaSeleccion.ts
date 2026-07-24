/**
 * Escena_Seleccion — Pantalla de selección de personaje (Shell).
 *
 * Escena de infraestructura del Shell (NO jugable, NO implementa IEscena) que
 * presenta los tres personajes disponibles y permite al jugador elegir uno antes
 * de iniciar el juego. La selección se persiste en `game.registry` bajo la clave
 * `'personaje_seleccionado'` para que todas las escenas de nivel la consuman.
 *
 * @module escenas/EscenaSeleccion
 * @see Requirements 1.1–1.5, 2.1–2.7, 3.1–3.4, 4.1, 6.1–6.4
 */

import Phaser from 'phaser';
import type { EscenaId } from '../contrato/rasgos';

/** Identificadores válidos de personaje. */
export type IdPersonaje = 'pink_monster' | 'owlet_monster' | 'dude_monster';

/** Datos de configuración de cada personaje mostrado en la selección. */
export interface DatosPersonaje {
  id: IdPersonaje;
  nombre: string;
  spriteKey: string;
  animKey: string;
}

/** Clave del registro de sesión donde se persiste la selección. */
export const CLAVE_PERSONAJE = 'personaje_seleccionado';

/** Id lógico de la escena de selección dentro del registro de escenas. */
export const ID_SELECCION: EscenaId = 'seleccion_personaje';

/** Datos de los tres personajes disponibles, en orden de presentación. */
export const PERSONAJES: readonly DatosPersonaje[] = [
  {
    id: 'pink_monster',
    nombre: 'Pink Monster',
    spriteKey: 'pink_monster_run',
    animKey: 'pink_monster_run_anim',
  },
  {
    id: 'owlet_monster',
    nombre: 'Owlet Monster',
    spriteKey: 'owlet_monster_run',
    animKey: 'owlet_monster_run_anim',
  },
  {
    id: 'dude_monster',
    nombre: 'Dude Monster',
    spriteKey: 'dude_monster_run',
    animKey: 'dude_monster_run_anim',
  },
] as const;

/**
 * Escena de selección de personaje.
 *
 * Extiende `Phaser.Scene` directamente (NO implementa IEscena — es
 * infraestructura del Shell, igual que BootScene y LoadingScene).
 */
export class EscenaSeleccion extends Phaser.Scene {
  private indiceActual: number = 0;
  private sprites: Phaser.GameObjects.Sprite[] = [];
  private indicador: Phaser.GameObjects.Rectangle | null = null;
  private inputDeshabilitado: boolean = false;
  private ultimoClicTimestamp: number = 0;
  private ultimoClicIndice: number = -1;

  constructor() {
    super({ key: ID_SELECCION });
  }

  /** Crea los sprites de personaje, animaciones run, título, fondo y etiquetas. */
  create(): void {
    const canvasWidth = this.scale.width; // 960
    const canvasHeight = this.scale.height; // 540
    const positionsX = [240, 480, 720];
    const positionY = Math.round(canvasHeight / 2); // ~270

    // Colores para placeholders cuando la textura no se cargó
    const placeholderColors = [0xff69b4, 0x8b4513, 0x4682b4];

    // --- Fondo gradiente (mismo que la portada) ---
    const gfx = this.add.graphics();
    const cTop = 0x05000d;
    const cMid = 0x0d0026;
    const cBot = 0x000a1a;
    for (let y = 0; y < canvasHeight; y++) {
      const t = y / canvasHeight;
      let r: number, g: number, b: number;
      if (t < 0.5) {
        const t2 = t * 2;
        r = ((cTop >> 16) & 0xff) + t2 * (((cMid >> 16) & 0xff) - ((cTop >> 16) & 0xff));
        g = ((cTop >> 8) & 0xff) + t2 * (((cMid >> 8) & 0xff) - ((cTop >> 8) & 0xff));
        b = (cTop & 0xff) + t2 * ((cMid & 0xff) - (cTop & 0xff));
      } else {
        const t2 = (t - 0.5) * 2;
        r = ((cMid >> 16) & 0xff) + t2 * (((cBot >> 16) & 0xff) - ((cMid >> 16) & 0xff));
        g = ((cMid >> 8) & 0xff) + t2 * (((cBot >> 8) & 0xff) - ((cMid >> 8) & 0xff));
        b = (cMid & 0xff) + t2 * ((cBot & 0xff) - (cMid & 0xff));
      }
      const color = (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
      gfx.fillStyle(color, 1);
      gfx.fillRect(0, y, canvasWidth, 1);
    }

    // --- Partículas (estrellas/chispas decorativas) ---
    if (!this.textures.exists('_particle_star')) {
      const pg = this.make.graphics({ x: 0, y: 0 }, false);
      pg.fillStyle(0xffffff, 1);
      pg.fillCircle(3, 3, 3);
      pg.generateTexture('_particle_star', 6, 6);
      pg.destroy();
    }
    this.add.particles(0, 0, '_particle_star', {
      x: { min: 0, max: canvasWidth },
      y: { min: 0, max: canvasHeight },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.5, end: 0 },
      speed: { min: 2, max: 8 },
      lifespan: 5000,
      frequency: 300,
      blendMode: 'ADD',
    });

    // --- Scanlines CRT sutiles ---
    const scanGfx = this.add.graphics();
    scanGfx.setAlpha(0.03);
    for (let y = 0; y < canvasHeight; y += 3) {
      scanGfx.fillStyle(0x000000, 1);
      scanGfx.fillRect(0, y, canvasWidth, 1);
    }

    // Título "Elige tu personaje" en el 20% superior, centrado horizontalmente
    this.add.text(canvasWidth / 2, canvasHeight * 0.12, 'Elige tu personaje', {
      fontFamily: '"Press Start 2P"',
      fontSize: '32px',
      color: '#ffd700',
      align: 'center',
    }).setOrigin(0.5);

    // Crear sprites (o placeholders) y animaciones run (6 frames)
    PERSONAJES.forEach((personaje, index) => {
      const x = positionsX[index]!;
      const textureExists = this.textures.exists(personaje.spriteKey);

      if (textureExists) {
        // Crear animación run si no existe aún (6 frames)
        if (!this.anims.exists(personaje.animKey)) {
          this.anims.create({
            key: personaje.animKey,
            frames: this.anims.generateFrameNumbers(personaje.spriteKey, {
              start: 0,
              end: 5,
            }),
            frameRate: 10,
            repeat: -1,
          });
        }

        // Crear sprite con escala 3
        const sprite = this.add.sprite(x, positionY, personaje.spriteKey);
        sprite.setScale(3);
        sprite.play(personaje.animKey);
        this.sprites.push(sprite);
      } else {
        // Placeholder: rectángulo de 96x96 con color
        const placeholder = this.add.rectangle(
          x,
          positionY,
          96,
          96,
          placeholderColors[index],
        );

        // Texto del nombre del personaje sobre el placeholder
        this.add.text(x, positionY, personaje.nombre, {
          fontFamily: '"Press Start 2P"',
          fontSize: '12px',
          color: '#ffffff',
          align: 'center',
        }).setOrigin(0.5);

        const dummySprite = this.add.sprite(x, positionY, '__DEFAULT');
        dummySprite.setVisible(false);
        dummySprite.setScale(3);
        dummySprite.setData('placeholder', placeholder);
        this.sprites.push(dummySprite);
      }

      // Etiqueta de nombre debajo del sprite
      this.add.text(x, positionY + 48 + 40, personaje.nombre, {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
        align: 'center',
      }).setOrigin(0.5);
    });

    // --- Instrucciones de control ---
    this.add.text(canvasWidth / 2, canvasHeight - 40, '← →  Navegar   |   Enter  Confirmar', {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#aaaaaa',
      align: 'center',
    }).setOrigin(0.5);

    // Crear indicador de selección (borde dorado alrededor del sprite actual)
    this.indicador = this.add.rectangle(0, 0, 110, 110);
    this.indicador.setStrokeStyle(2, 0xffd700);
    this.indicador.setFillStyle(0x000000, 0);
    this.actualizarIndicador();

    // Registrar navegación por teclado (flechas izquierda/derecha)
    this.input.keyboard!.on('keydown-LEFT', () => {
      if (this.inputDeshabilitado) return;
      this.indiceActual = (this.indiceActual - 1 + 3) % 3;
      this.actualizarIndicador();
    });

    this.input.keyboard!.on('keydown-RIGHT', () => {
      if (this.inputDeshabilitado) return;
      this.indiceActual = (this.indiceActual + 1) % 3;
      this.actualizarIndicador();
    });

    // Registrar confirmación por Enter/Space
    this.input.keyboard!.on('keydown-ENTER', () => {
      if (this.inputDeshabilitado) return;
      this.confirmarSeleccion();
    });

    this.input.keyboard!.on('keydown-SPACE', () => {
      if (this.inputDeshabilitado) return;
      this.confirmarSeleccion();
    });

    // Registrar navegación por mouse/clic en cada sprite
    this.sprites.forEach((sprite, index) => {
      const textureExists = this.textures.exists(PERSONAJES[index]!.spriteKey);

      if (textureExists) {
        // Sprite real: usar hitArea por defecto de Phaser
        sprite.setInteractive();
      } else {
        // Sprite dummy (placeholder): definir hitArea de 96x96 centrada
        sprite.setInteractive(
          new Phaser.Geom.Rectangle(-48, -48, 96, 96),
          Phaser.Geom.Rectangle.Contains,
        );
      }

      sprite.on('pointerdown', () => {
        if (this.inputDeshabilitado) return;

        const ahora = Date.now();
        const esDobleClick =
          this.ultimoClicIndice === index &&
          ahora - this.ultimoClicTimestamp < 300;

        // Actualizar índice y mover indicador
        this.indiceActual = index;
        this.actualizarIndicador();

        if (esDobleClick) {
          // Doble clic detectado: confirmar selección
          this.confirmarSeleccion();
          // Resetear tracking para evitar falsos positivos posteriores
          this.ultimoClicTimestamp = 0;
          this.ultimoClicIndice = -1;
        } else {
          // Registrar este clic para detección de doble clic
          this.ultimoClicTimestamp = ahora;
          this.ultimoClicIndice = index;
        }
      });
    });
  }

  /** Reposiciona el indicador alrededor del sprite en `indiceActual`. */
  private actualizarIndicador(): void {
    if (!this.indicador || this.sprites.length === 0) return;
    const sprite = this.sprites[this.indiceActual];
    if (!sprite) return;
    this.indicador.setPosition(sprite.x, sprite.y);
  }

  /** Confirma la selección del personaje actual. */
  private confirmarSeleccion(): void {
    // Deshabilitar toda entrada inmediatamente para evitar confirmaciones duplicadas
    this.inputDeshabilitado = true;

    // Persistir el IdPersonaje seleccionado en el registro de sesión
    this.game.registry.set(CLAVE_PERSONAJE, PERSONAJES[this.indiceActual]!.id);

    // Obtener el sprite seleccionado y reproducir animación de escala
    const selectedSprite = this.sprites[this.indiceActual]!;
    this.tweens.add({
      targets: selectedSprite,
      scaleX: selectedSprite.scaleX * 1.3,
      scaleY: selectedSprite.scaleY * 1.3,
      duration: 300,
      onComplete: () => {
        // Al completar la animación, solicitar transición al primer nivel
        const sceneManager = this.game.registry.get('sceneManager');
        if (sceneManager && typeof sceneManager.solicitarTransicion === 'function') {
          sceneManager.solicitarTransicion('plataformas');
        }
      },
    });
  }
}
