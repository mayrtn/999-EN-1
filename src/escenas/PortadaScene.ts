/**
 * PortadaScene — Pantalla de portada / título del juego.
 *
 * Escena de infraestructura del Shell (NO jugable, NO implementa IEscena) que
 * muestra el título del juego con estilo pixel-art retro arcade premium:
 * - Grid de neón animado (efecto Tron)
 * - Título con glitch y sombra de color
 * - Personajes corriendo en loop en la parte inferior
 * - Múltiples capas de partículas
 * - Entrada dramática con fade-in
 *
 * @module escenas/PortadaScene
 */

import Phaser from 'phaser';
import type { EscenaId } from '../contrato/rasgos';

/** Id lógico de la escena de portada dentro del registro de escenas. */
export const ID_PORTADA: EscenaId = 'portada';

/**
 * Escena de portada / título del juego — versión PRO.
 */
export class PortadaScene extends Phaser.Scene {
  private textoStart: Phaser.GameObjects.Text | null = null;
  private timerParpadeo: Phaser.Time.TimerEvent | null = null;
  private timerGlitch: Phaser.Time.TimerEvent | null = null;
  private tituloArcade: Phaser.GameObjects.Text | null = null;
  private tituloIA: Phaser.GameObjects.Text | null = null;
  private avanzando = false;

  constructor() {
    super({ key: ID_PORTADA });
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // Fade in dramático al entrar
    this.cameras.main.fadeIn(800, 0, 0, 0);

    // =====================================================================
    // FONDO: gradiente profundo púrpura/azul oscuro
    // =====================================================================
    const bgGfx = this.add.graphics();
    const cTop = 0x05000d;
    const cMid = 0x0d0026;
    const cBot = 0x000a1a;
    for (let y = 0; y < h; y++) {
      const t = y / h;
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
      bgGfx.fillStyle(color, 1);
      bgGfx.fillRect(0, y, w, 1);
    }

    // =====================================================================
    // =====================================================================
    // PARTÍCULAS — capa 1: estrellas lentas de fondo
    // =====================================================================
    if (!this.textures.exists('_p_star_sm')) {
      const pg = this.make.graphics({ x: 0, y: 0 }, false);
      pg.fillStyle(0xffffff, 1);
      pg.fillCircle(1, 1, 1);
      pg.generateTexture('_p_star_sm', 3, 3);
      pg.destroy();
    }
    this.add.particles(0, 0, '_p_star_sm', {
      x: { min: 0, max: w },
      y: { min: 0, max: h * 0.6 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.5, end: 0 },
      speed: { min: 2, max: 8 },
      lifespan: 5000,
      frequency: 300,
      blendMode: 'ADD',
    });

    // =====================================================================
    // PARTÍCULAS — capa 2: chispas rápidas de neón
    // =====================================================================
    if (!this.textures.exists('_p_spark')) {
      const pg = this.make.graphics({ x: 0, y: 0 }, false);
      pg.fillStyle(0xff00ff, 1);
      pg.fillCircle(2, 2, 2);
      pg.generateTexture('_p_spark', 4, 4);
      pg.destroy();
    }
    this.add.particles(0, 0, '_p_spark', {
      x: { min: 0, max: w },
      y: { min: h * 0.15, max: h * 0.45 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.8, end: 0 },
      speedX: { min: -30, max: 30 },
      speedY: { min: -10, max: 10 },
      lifespan: 1500,
      frequency: 400,
      blendMode: 'ADD',
      tint: [0xff00ff, 0x00ffff, 0xffff00],
    });

    // =====================================================================
    // SCANLINES — efecto CRT sutil
    // =====================================================================
    const scanGfx = this.add.graphics();
    scanGfx.setAlpha(0.03);
    for (let y = 0; y < h; y += 3) {
      scanGfx.fillStyle(0x000000, 1);
      scanGfx.fillRect(0, y, w, 1);
    }

    // =====================================================================
    // TÍTULO "ARCADE" — con sombras de color (faux chromatic aberration)
    // =====================================================================
    // Sombra roja (offset izquierda)
    this.add
      .text(w / 2 - 3, h * 0.22, 'ARCADE', {
        fontFamily: '"Press Start 2P"',
        fontSize: '52px',
        color: '#ff0040',
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(0.35);

    // Sombra cyan (offset derecha)
    this.add
      .text(w / 2 + 3, h * 0.22, 'ARCADE', {
        fontFamily: '"Press Start 2P"',
        fontSize: '52px',
        color: '#00ffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(0.35);

    // Texto principal
    this.tituloArcade = this.add
      .text(w / 2, h * 0.22, 'ARCADE', {
        fontFamily: '"Press Start 2P"',
        fontSize: '52px',
        color: '#ffffff',
        align: 'center',
        stroke: '#ff00ff',
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    // =====================================================================
    // SUBTÍTULO "IA MUTANTE" — con glow animado
    // =====================================================================
    // Glow detrás
    const glowIA = this.add
      .text(w / 2, h * 0.36, 'IA MUTANTE', {
        fontFamily: '"Press Start 2P"',
        fontSize: '38px',
        color: '#00ffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(0.3);

    this.tweens.add({
      targets: glowIA,
      alpha: { from: 0.2, to: 0.5 },
      scaleX: { from: 1, to: 1.02 },
      scaleY: { from: 1, to: 1.02 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Texto principal
    this.tituloIA = this.add
      .text(w / 2, h * 0.36, 'IA MUTANTE', {
        fontFamily: '"Press Start 2P"',
        fontSize: '38px',
        color: '#00ffff',
        align: 'center',
        stroke: '#004455',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    // =====================================================================
    // EFECTO GLITCH periódico en el título
    // =====================================================================
    this.timerGlitch = this.time.addEvent({
      delay: 3000,
      callback: () => this.hacerGlitch(),
      loop: true,
    });

    // =====================================================================
    // PERSONAJES corriendo en la parte inferior (si texturas disponibles)
    // =====================================================================
    this.crearPersonajesCorriendo(w, h);

    // =====================================================================
    // TEXTO "PRESS START" — parpadeante con efecto de escala
    // =====================================================================
    this.textoStart = this.add
      .text(w / 2, h * 0.54, '[ PRESS START ]', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffd700',
        align: 'center',
        stroke: '#553300',
        strokeThickness: 1,
      })
      .setOrigin(0.5);

    // Pulso de escala
    this.tweens.add({
      targets: this.textoStart,
      scaleX: { from: 1, to: 1.05 },
      scaleY: { from: 1, to: 1.05 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Parpadeo clásico
    this.timerParpadeo = this.time.addEvent({
      delay: 700,
      callback: () => {
        if (this.textoStart) {
          this.textoStart.setVisible(!this.textoStart.visible);
        }
      },
      loop: true,
    });

    // =====================================================================
    // CRÉDITOS
    // =====================================================================
    this.add
      .text(w / 2, h * 0.88, 'Hackaton Codigo Facilito', {
        fontFamily: '"Press Start 2P"',
        fontSize: '7px',
        color: '#444444',
        align: 'center',
      })
      .setOrigin(0.5);

    // =====================================================================
    // INPUT: cualquier tecla o clic avanza
    // =====================================================================
    this.input.keyboard!.on('keydown', () => {
      this.avanzar();
    });

    this.input.on('pointerdown', () => {
      this.avanzar();
    });
  }

  // ========================================================================
  // GLITCH — efecto rápido de desplazamiento
  // ========================================================================
  private hacerGlitch(): void {
    if (!this.tituloArcade || !this.tituloIA) return;

    const originalX = this.scale.width / 2;

    // Desplazar título bruscamente
    this.tituloArcade.setX(originalX + Phaser.Math.Between(-6, 6));
    this.tituloIA.setX(originalX + Phaser.Math.Between(-4, 4));

    // Cambiar color brevemente
    this.tituloArcade.setColor('#ff0000');

    // Restaurar después de 80ms
    this.time.delayedCall(80, () => {
      if (this.tituloArcade) {
        this.tituloArcade.setX(originalX);
        this.tituloArcade.setColor('#ffffff');
      }
      if (this.tituloIA) {
        this.tituloIA.setX(originalX);
      }
    });

    // Segundo glitch rápido 150ms después
    this.time.delayedCall(200, () => {
      if (!this.tituloArcade) return;
      this.tituloArcade.setX(originalX + Phaser.Math.Between(-3, 3));
      this.time.delayedCall(60, () => {
        if (this.tituloArcade) this.tituloArcade.setX(originalX);
      });
    });
  }

  // ========================================================================
  // PERSONAJES corriendo en loop (decoración inferior)
  // ========================================================================
  private crearPersonajesCorriendo(w: number, h: number): void {
    const personajes = [
      { key: 'pink_monster_idle', anim: '_portada_pink_idle' },
      { key: 'owlet_monster_idle', anim: '_portada_owlet_idle' },
      { key: 'dude_monster_idle', anim: '_portada_dude_idle' },
    ];

    const posY = h * 0.72;
    const spacing = 120;
    const startX = w / 2 - spacing;

    personajes.forEach((p, i) => {
      if (!this.textures.exists(p.key)) return;

      // Crear animación si no existe
      if (!this.anims.exists(p.anim)) {
        this.anims.create({
          key: p.anim,
          frames: this.anims.generateFrameNumbers(p.key, { start: 0, end: 3 }),
          frameRate: 6,
          repeat: -1,
        });
      }

      const sprite = this.add.sprite(startX + i * spacing, posY, p.key);
      sprite.setScale(2.5);
      sprite.setAlpha(0); // Empieza invisible

      // Entrada con delay: caen desde arriba uno por uno
      this.time.delayedCall(400 + i * 350, () => {
        sprite.setAlpha(1);
        sprite.setY(posY - 80); // Empieza arriba

        // Caída con rebote
        this.tweens.add({
          targets: sprite,
          y: posY,
          duration: 400,
          ease: 'Bounce.easeOut',
          onComplete: () => {
            // Empieza idle después de aterrizar
            sprite.play(p.anim);

            // Bounce sutil continuo
            this.tweens.add({
              targets: sprite,
              y: posY - 4,
              duration: 400 + i * 100,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
          },
        });
      });
    });
  }

  // ========================================================================
  // TRANSICIÓN
  // ========================================================================
  private avanzar(): void {
    if (this.avanzando) return;
    this.avanzando = true;

    // Limpiar listeners
    this.input.keyboard!.removeAllListeners();
    this.input.removeAllListeners();

    if (this.timerParpadeo) this.timerParpadeo.destroy();
    if (this.timerGlitch) this.timerGlitch.destroy();

    // Fade out directo y limpio
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      const sceneManager = this.game.registry.get('sceneManager');
      if (sceneManager && typeof sceneManager.solicitarTransicion === 'function') {
        sceneManager.solicitarTransicion('seleccion_personaje');
      }
    });
  }
}
