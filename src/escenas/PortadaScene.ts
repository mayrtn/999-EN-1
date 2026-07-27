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
 * - Menú con controles e info (overlays)
 *
 * @module escenas/PortadaScene
 */

import Phaser from 'phaser';
import type { EscenaId } from '../contrato/rasgos';
import { sfxPortal, sfxCoin } from '../audio/sfx';

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
  private overlayActivo: Phaser.GameObjects.GameObject[] | null = null;

  constructor() {
    super({ key: ID_PORTADA });
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // Fade in dramático al entrar
    this.cameras.main.fadeIn(800, 0, 0, 0);

    // Startup sound (delayed)
    this.time.delayedCall(800, () => sfxPortal());

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
    // GRID FLOOR — efecto synthwave en la parte inferior
    // =====================================================================
    const gridGfx = this.add.graphics();
    gridGfx.setAlpha(0.15);
    const gridStartY = h * 0.7;
    const gridLines = 8;
    // Horizontal lines (converging to horizon)
    for (let i = 0; i < gridLines; i++) {
      const t = i / gridLines;
      const y = gridStartY + (h - gridStartY) * t * t; // exponential spacing
      gridGfx.lineStyle(1, 0xff00ff, 0.4 - t * 0.3);
      gridGfx.lineBetween(0, y, w, y);
    }
    // Vertical lines (converging to center)
    const vertLines = 12;
    for (let i = 0; i < vertLines; i++) {
      const t = i / (vertLines - 1); // 0 to 1
      const topX = w * 0.3 + (w * 0.4) * t; // narrow at top
      const botX = w * t; // full width at bottom
      gridGfx.lineStyle(1, 0x00ffff, 0.2);
      gridGfx.lineBetween(topX, gridStartY, botX, h);
    }

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
    // VIGNETTE — oscurece los bordes
    // =====================================================================
    const vignetteGfx = this.add.graphics();
    vignetteGfx.setAlpha(0.4);
    // Top gradient
    for (let y = 0; y < h * 0.15; y++) {
      const a = 1 - y / (h * 0.15);
      vignetteGfx.fillStyle(0x000000, a);
      vignetteGfx.fillRect(0, y, w, 1);
    }
    // Bottom gradient
    for (let y = 0; y < h * 0.15; y++) {
      const a = 1 - y / (h * 0.15);
      vignetteGfx.fillStyle(0x000000, a);
      vignetteGfx.fillRect(0, h - y, w, 1);
    }

    // =====================================================================
    // TÍTULO "ARCADE" — con sombras de color (faux chromatic aberration)
    // =====================================================================
    // Sombra roja (offset izquierda)
    this.add
      .text(w / 2 - 3, h * 0.18, 'ARCADE', {
        fontFamily: '"Press Start 2P"',
        fontSize: '52px',
        color: '#ff0040',
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(0.35);

    // Sombra cyan (offset derecha)
    this.add
      .text(w / 2 + 3, h * 0.18, 'ARCADE', {
        fontFamily: '"Press Start 2P"',
        fontSize: '52px',
        color: '#00ffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(0.35);

    // Texto principal
    this.tituloArcade = this.add
      .text(w / 2, h * 0.18, 'ARCADE', {
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
      .text(w / 2, h * 0.32, 'IA MUTANTE', {
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
      .text(w / 2, h * 0.32, 'IA MUTANTE', {
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
      .text(w / 2, h * 0.50, '[ PRESS START ]', {
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
    // OPCIONES DE MENÚ: [ C ] CONTROLES  /  [ I ] INFO
    // =====================================================================
    const startY = this.textoStart.y;

    const textoControles = this.add
      .text(w / 2, startY + 40, '[ C ] CONTROLES', {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: '#aaaaaa',
        align: 'center',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: textoControles,
      alpha: { from: 0.6, to: 1 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const textoInfo = this.add
      .text(w / 2, startY + 60, '[ I ] INFO', {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: '#aaaaaa',
        align: 'center',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: textoInfo,
      alpha: { from: 0.6, to: 1 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 200,
    });

    // =====================================================================
    // HACKATHON CREDIT — texto sutil al fondo
    // =====================================================================
    this.add
      .text(w / 2, h * 0.96, 'Hackathon Código Facilito 2024', {
        fontFamily: '"Press Start 2P"',
        fontSize: '7px',
        color: '#333355',
        align: 'center',
      })
      .setOrigin(0.5);

    // =====================================================================
    // INPUT: teclas específicas para menú y avance
    // =====================================================================
    this.input.keyboard!.on('keydown-C', () => {
      if (this.overlayActivo) {
        this.cerrarOverlay();
      } else {
        this.mostrarControles();
      }
    });

    this.input.keyboard!.on('keydown-I', () => {
      if (this.overlayActivo) {
        this.cerrarOverlay();
      } else {
        this.mostrarInfo();
      }
    });

    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.overlayActivo) {
        this.cerrarOverlay();
      }
    });

    this.input.keyboard!.on('keydown-ENTER', () => {
      if (!this.overlayActivo) {
        this.avanzar();
      }
    });

    this.input.keyboard!.on('keydown-SPACE', () => {
      if (!this.overlayActivo) {
        this.avanzar();
      }
    });

    this.input.on('pointerdown', () => {
      if (!this.overlayActivo) {
        this.avanzar();
      }
    });
  }

  // ========================================================================
  // OVERLAY: CONTROLES
  // ========================================================================
  private mostrarControles(): void {
    if (this.overlayActivo) return;

    const w = this.scale.width;
    const h = this.scale.height;
    const elementos: Phaser.GameObjects.GameObject[] = [];

    // Fondo semi-transparente
    const bg = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.85);
    bg.setScrollFactor(0).setDepth(200).setAlpha(0);
    elementos.push(bg);

    // Borde/frame exterior
    const border = this.add.rectangle(w / 2, h / 2, w - 40, h - 40);
    border.setStrokeStyle(2, 0x00ffff, 0.6);
    border.setFillStyle(0x000000, 0);
    border.setScrollFactor(0).setDepth(201).setAlpha(0);
    elementos.push(border);

    // Inner glow border (subtle second border)
    const innerBorder = this.add.rectangle(w / 2, h / 2, w - 56, h - 56);
    innerBorder.setStrokeStyle(1, 0x00ffff, 0.25);
    innerBorder.setFillStyle(0x000000, 0);
    innerBorder.setScrollFactor(0).setDepth(201).setAlpha(0);
    elementos.push(innerBorder);

    // Título con glow/shadow
    const tituloGlow = this.add
      .text(w / 2, h * 0.12, '\u2550\u2550\u2550 CONTROLES \u2550\u2550\u2550', {
        fontFamily: '"Press Start 2P"',
        fontSize: '12px',
        color: '#00ffff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(tituloGlow);

    const titulo = this.add
      .text(w / 2, h * 0.12, '\u2550\u2550\u2550 CONTROLES \u2550\u2550\u2550', {
        fontFamily: '"Press Start 2P"',
        fontSize: '12px',
        color: '#00ffff',
        align: 'center',
        stroke: '#003344',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(203)
      .setAlpha(0);
    elementos.push(titulo);

    // Helper: draw a key-cap graphic (small rounded rect representing a key)
    const drawKeyCap = (x: number, y: number, keyLabel: string): Phaser.GameObjects.GameObject[] => {
      const kw = Math.max(24, keyLabel.length * 8 + 10);
      const kh = 16;
      const gfx = this.add.graphics();
      gfx.setScrollFactor(0).setDepth(202).setAlpha(0);
      gfx.fillStyle(0x222233, 1);
      gfx.fillRoundedRect(x, y - kh / 2, kw, kh, 3);
      gfx.lineStyle(1, 0x00ffff, 0.5);
      gfx.strokeRoundedRect(x, y - kh / 2, kw, kh, 3);
      const lbl = this.add
        .text(x + kw / 2, y, keyLabel, {
          fontFamily: '"Press Start 2P"',
          fontSize: '6px',
          color: '#ffffff',
          align: 'center',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(203)
        .setAlpha(0);
      return [gfx, lbl];
    };

    // Helper: draw a section divider line
    const drawDivider = (y: number): Phaser.GameObjects.GameObject => {
      const gfx = this.add.graphics();
      gfx.setScrollFactor(0).setDepth(202).setAlpha(0);
      gfx.lineStyle(1, 0x00ffff, 0.3);
      gfx.lineBetween(w * 0.12, y, w * 0.88, y);
      return gfx;
    };

    // Section: PLATAFORMAS
    const sec1Y = h * 0.22;
    const sec1Title = this.add
      .text(w * 0.15, sec1Y, 'PLATAFORMAS:', {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(sec1Title);

    const line1Y = sec1Y + 18;
    const keys1 = drawKeyCap(w * 0.15, line1Y + 8, '\u2190 \u2192');
    elementos.push(...keys1);
    const txt1 = this.add
      .text(w * 0.15 + 52, line1Y + 8, 'Mover', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(txt1);

    const line2Y = line1Y + 20;
    const keys2 = drawKeyCap(w * 0.15, line2Y + 8, '\u2191');
    const keys2b = drawKeyCap(w * 0.15 + 32, line2Y + 8, 'SPC');
    elementos.push(...keys2, ...keys2b);
    const txt2 = this.add
      .text(w * 0.15 + 72, line2Y + 8, 'Saltar', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(txt2);

    // Divider 1
    const div1 = drawDivider(sec1Y + 60);
    elementos.push(div1);

    // Section: RITMO
    const sec2Y = sec1Y + 70;
    const sec2Title = this.add
      .text(w * 0.15, sec2Y, 'RITMO:', {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(sec2Title);

    const line3Y = sec2Y + 18;
    const keys3 = drawKeyCap(w * 0.15, line3Y + 8, 'SPC');
    elementos.push(...keys3);
    const txt3 = this.add
      .text(w * 0.15 + 42, line3Y + 8, 'Golpear notas', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(txt3);

    // Divider 2
    const div2 = drawDivider(sec2Y + 42);
    elementos.push(div2);

    // Section: SHOOTER
    const sec3Y = sec2Y + 52;
    const sec3Title = this.add
      .text(w * 0.15, sec3Y, 'SHOOTER:', {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(sec3Title);

    const line4Y = sec3Y + 18;
    const keys4 = drawKeyCap(w * 0.15, line4Y + 8, '\u2190\u2192\u2191\u2193');
    elementos.push(...keys4);
    const txt4 = this.add
      .text(w * 0.15 + 62, line4Y + 8, 'Mover mira', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(txt4);

    const line5Y = line4Y + 20;
    const keys5 = drawKeyCap(w * 0.15, line5Y + 8, 'SPC');
    elementos.push(...keys5);
    const txt5 = this.add
      .text(w * 0.15 + 42, line5Y + 8, 'Disparar', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(txt5);

    // Divider 3
    const div3 = drawDivider(sec3Y + 60);
    elementos.push(div3);

    // Section: CARRERAS
    const sec4Y = sec3Y + 70;
    const sec4Title = this.add
      .text(w * 0.15, sec4Y, 'CARRERAS:', {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(sec4Title);

    const line6Y = sec4Y + 18;
    const keys6 = drawKeyCap(w * 0.15, line6Y + 8, '\u2190 \u2192');
    elementos.push(...keys6);
    const txt6 = this.add
      .text(w * 0.15 + 52, line6Y + 8, 'Cambiar carril', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(txt6);

    const txt6b = this.add
      .text(w * 0.15, line6Y + 28, 'Esquiva los autos', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#888888',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(txt6b);

    // [ESC] VOLVER — pulsing at the bottom
    const volver = this.add
      .text(w / 2, h * 0.93, '[ESC] VOLVER', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#aaaaaa',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(volver);

    // Pulse animation for [ESC] VOLVER
    this.tweens.add({
      targets: volver,
      alpha: { from: 0.5, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 300,
    });

    this.overlayActivo = elementos;

    // Fade-in animation for all overlay elements
    this.fadeInOverlayElements(elementos);
  }

  // ========================================================================
  // OVERLAY: INFO
  // ========================================================================
  private mostrarInfo(): void {
    if (this.overlayActivo) return;

    const w = this.scale.width;
    const h = this.scale.height;
    const elementos: Phaser.GameObjects.GameObject[] = [];

    // Fondo semi-transparente
    const bg = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.85);
    bg.setScrollFactor(0).setDepth(200).setAlpha(0);
    elementos.push(bg);

    // Borde/frame exterior
    const border = this.add.rectangle(w / 2, h / 2, w - 40, h - 40);
    border.setStrokeStyle(2, 0xff00ff, 0.6);
    border.setFillStyle(0x000000, 0);
    border.setScrollFactor(0).setDepth(201).setAlpha(0);
    elementos.push(border);

    // Inner glow border (subtle second border)
    const innerBorder = this.add.rectangle(w / 2, h / 2, w - 56, h - 56);
    innerBorder.setStrokeStyle(1, 0xff00ff, 0.25);
    innerBorder.setFillStyle(0x000000, 0);
    innerBorder.setScrollFactor(0).setDepth(201).setAlpha(0);
    elementos.push(innerBorder);

    // Decorative corner dots
    const cornerGfx = this.add.graphics();
    cornerGfx.setScrollFactor(0).setDepth(201).setAlpha(0);
    const cornerSize = 4;
    const margin = 32;
    // Top-left
    cornerGfx.fillStyle(0xff00ff, 0.5);
    cornerGfx.fillCircle(margin, margin, cornerSize);
    cornerGfx.fillCircle(margin + 10, margin, cornerSize - 1);
    cornerGfx.fillCircle(margin, margin + 10, cornerSize - 1);
    // Top-right
    cornerGfx.fillCircle(w - margin, margin, cornerSize);
    cornerGfx.fillCircle(w - margin - 10, margin, cornerSize - 1);
    cornerGfx.fillCircle(w - margin, margin + 10, cornerSize - 1);
    // Bottom-left
    cornerGfx.fillCircle(margin, h - margin, cornerSize);
    cornerGfx.fillCircle(margin + 10, h - margin, cornerSize - 1);
    cornerGfx.fillCircle(margin, h - margin - 10, cornerSize - 1);
    // Bottom-right
    cornerGfx.fillCircle(w - margin, h - margin, cornerSize);
    cornerGfx.fillCircle(w - margin - 10, h - margin, cornerSize - 1);
    cornerGfx.fillCircle(w - margin, h - margin - 10, cornerSize - 1);
    elementos.push(cornerGfx);

    // Título con magenta glow
    const tituloGlow = this.add
      .text(w / 2, h * 0.12, '\u2550\u2550\u2550 ARCADE IA MUTANTE \u2550\u2550\u2550', {
        fontFamily: '"Press Start 2P"',
        fontSize: '11px',
        color: '#ff00ff',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(tituloGlow);

    const titulo = this.add
      .text(w / 2, h * 0.12, '\u2550\u2550\u2550 ARCADE IA MUTANTE \u2550\u2550\u2550', {
        fontFamily: '"Press Start 2P"',
        fontSize: '11px',
        color: '#ff00ff',
        align: 'center',
        stroke: '#330033',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(203)
      .setAlpha(0);
    elementos.push(titulo);

    // Main description — slightly bigger font
    const desc1 = this.add
      .text(w / 2, h * 0.24, 'Un juego que analiza tu personalidad', {
        fontFamily: '"Press Start 2P"',
        fontSize: '9px',
        color: '#ffffff',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(desc1);

    const desc2 = this.add
      .text(w / 2, h * 0.30, 'mientras jug\u00e1s.', {
        fontFamily: '"Press Start 2P"',
        fontSize: '9px',
        color: '#ffffff',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(desc2);

    const desc3 = this.add
      .text(w / 2, h * 0.38, 'Cada nivel mide 4 rasgos:', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#aaaaaa',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(desc3);

    // Traits with colored bar indicators
    const traits = [
      { name: 'FURIA - Agresividad', color: 0xff4444, textColor: '#ff4444', y: h * 0.45 },
      { name: 'CURIOSIDAD - Exploraci\u00f3n', color: 0x44ff44, textColor: '#44ff44', y: h * 0.52 },
      { name: 'LOGRO - Completitud', color: 0xffff44, textColor: '#ffff44', y: h * 0.59 },
      { name: 'RIESGO - Temeridad', color: 0xff8844, textColor: '#ff8844', y: h * 0.66 },
    ];

    traits.forEach((trait) => {
      // Small colored bar before trait name
      const barGfx = this.add.graphics();
      barGfx.setScrollFactor(0).setDepth(202).setAlpha(0);
      barGfx.fillStyle(trait.color, 0.9);
      barGfx.fillRect(w * 0.22, trait.y - 4, 18, 8);
      barGfx.lineStyle(1, 0xffffff, 0.3);
      barGfx.strokeRect(w * 0.22, trait.y - 4, 18, 8);
      elementos.push(barGfx);

      const traitTxt = this.add
        .text(w * 0.22 + 26, trait.y, trait.name, {
          fontFamily: '"Press Start 2P"',
          fontSize: '8px',
          color: trait.textColor,
          stroke: '#000000',
          strokeThickness: 1,
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(202)
        .setAlpha(0);
      elementos.push(traitTxt);
    });

    // Bottom info text
    const iaText = this.add
      .text(w / 2, h * 0.76, 'La IA muta el mundo seg\u00fan tu perfil.', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#00ffff',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(iaText);

    const creditText = this.add
      .text(w / 2, h * 0.84, 'Hackathon Codigo Facilito 2024', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#888888',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(creditText);

    // [ESC] VOLVER — pulsing at the bottom
    const volver = this.add
      .text(w / 2, h * 0.93, '[ESC] VOLVER', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#aaaaaa',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0);
    elementos.push(volver);

    // Pulse animation for [ESC] VOLVER
    this.tweens.add({
      targets: volver,
      alpha: { from: 0.5, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 300,
    });

    this.overlayActivo = elementos;

    // Fade-in animation for all overlay elements
    this.fadeInOverlayElements(elementos);
  }

  // ========================================================================
  // FADE-IN: anima todos los elementos del overlay desde alpha 0 a su target
  // ========================================================================
  private fadeInOverlayElements(elementos: Phaser.GameObjects.GameObject[]): void {
    elementos.forEach((obj) => {
      // Each element starts at alpha 0 and tweens to target over 300ms
      const gameObj = obj as unknown as { alpha: number; setAlpha: (a: number) => void };
      if (typeof gameObj.setAlpha !== 'function') return;
      const target = gameObj.alpha ?? 1;
      gameObj.setAlpha(0);
      this.tweens.add({
        targets: obj,
        alpha: target || 1,
        duration: 300,
        ease: 'Power2',
      });
    });
  }

  // ========================================================================
  // CERRAR OVERLAY
  // ========================================================================
  private cerrarOverlay(): void {
    if (!this.overlayActivo) return;
    this.overlayActivo.forEach((obj) => obj.destroy());
    this.overlayActivo = null;
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

    const posY = h * 0.78;
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
    if (this.overlayActivo) return;
    this.avanzando = true;

    sfxCoin(); // confirmation beep when starting

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
