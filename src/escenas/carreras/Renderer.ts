/**
 * Renderer — sistema de renderizado para la Escena_Carreras.
 *
 * Carretera recta vertical (vista top-down con scroll), 3 carriles,
 * líneas blancas, bordes, pasto con decoraciones, personaje corriendo al lado.
 *
 * @module escenas/carreras/Renderer
 */

import Phaser from 'phaser';
import type { Rival, Obstaculo } from './tipos';
import { CARRILES } from './constantes';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface EstadoRenderizado {
  velocidadActual: number;
  posicionLateral: number;
  distanciaRecorrida: number;
  segmentoActual: number;
  rivalesActivos: Rival[];
  obstaculos: Obstaculo[];
  boostActivo: boolean;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** La carretera ocupa 45% del ancho (más angosta para que los carriles sean compactos). */
const ROAD_WIDTH_PERCENT = 0.45;

/** Alto de cada franja para el scroll. */
const STRIP_HEIGHT = 20;

/** Tamaño del vehículo del jugador. */
const PLAYER_SCALE = 1.5;

/** Tamaño de los rivales. */
const RIVAL_SCALE = 1.4;

/** Distancia máxima visible para rivales. */
const MAX_VISIBLE_DIST = 500;

// Colores
const BG_COLOR = 0x1a1a2e;
const GRASS_COLOR_A = 0x10aa10;
const GRASS_COLOR_B = 0x009a00;
const ROAD_COLOR = 0x555555;
const CURB_COLOR_A = 0xff0000;
const CURB_COLOR_B = 0xffffff;
const LINE_COLOR = 0xffffff;
const CURB_WIDTH = 6;

export class Renderer {
  private escena: Phaser.Scene;
  private graficos: Phaser.GameObjects.Graphics | null = null;
  private vehiculoSprite: Phaser.GameObjects.Sprite | null = null;
  private personajeSprite: Phaser.GameObjects.Sprite | null = null;
  private rivalesSprites: Phaser.GameObjects.Sprite[] = [];
  private decoracionSprites: Phaser.GameObjects.Sprite[] = [];
  private tinte: number = 0xffffff;

  constructor(escena: Phaser.Scene) {
    this.escena = escena;
  }

  inicializar(): void {
    const { width, height } = this.escena.scale;

    this.graficos = this.escena.add.graphics();
    this.graficos.setDepth(0);

    // Player car
    this.vehiculoSprite = this.escena.add.sprite(
      Math.floor(width / 2),
      Math.floor(height - 80),
      'vehiculo_jugador',
    );
    this.vehiculoSprite.setScale(PLAYER_SCALE);
    this.vehiculoSprite.setDepth(10);

    // Rival sprite pool (using 5 different car textures)
    const rivalKeys = ['rival_1', 'rival_2', 'rival_3', 'rival_4', 'rival_5'];
    for (let i = 0; i < 10; i++) {
      const key = rivalKeys[i % rivalKeys.length]!;
      const s = this.escena.add.sprite(0, 0, key);
      s.setVisible(false);
      s.setDepth(5);
      this.rivalesSprites.push(s);
    }

    // Decoration sprites (fewer, mixed, will scroll with road)
    // arbol izq, arbusto der, arbusto izq, arbol der, arbol izq, arbusto der
    const decoConfig = [
      { key: 'arbol', side: 'left' },
      { key: 'arbusto', side: 'right' },
      { key: 'arbusto', side: 'left' },
      { key: 'arbol', side: 'right' },
      { key: 'arbol', side: 'left' },
      { key: 'arbusto', side: 'right' },
    ];
    for (const cfg of decoConfig) {
      if (!this.escena.textures.exists(cfg.key)) continue;
      const s = this.escena.add.sprite(0, -100, cfg.key);
      s.setDisplaySize(cfg.key === 'arbol' ? 60 : 30, cfg.key === 'arbol' ? 70 : 25);
      s.setDepth(2);
      s.setData('side', cfg.side);
      this.decoracionSprites.push(s);
    }

    // Personaje en esquina inferior izquierda con animación idle (movimiento sutil)
    const personajeKey = this.escena.game.registry.get('personaje_seleccionado') as string | null;
    if (personajeKey) {
      const idleKey = `${personajeKey}_idle`;
      const animKey = `${personajeKey}_idle_carreras`;
      if (this.escena.textures.exists(idleKey)) {
        this.personajeSprite = this.escena.add.sprite(
          36,
          height - 56,
          idleKey,
        );
        this.personajeSprite.setScale(2);
        this.personajeSprite.setDepth(50);

        // Create idle animation if not exists
        if (!this.escena.anims.exists(animKey)) {
          this.escena.anims.create({
            key: animKey,
            frames: this.escena.anims.generateFrameNumbers(idleKey, { start: 0, end: 3 }),
            frameRate: 6,
            repeat: -1,
          });
        }
        this.personajeSprite.play(animKey);
      }
    }
  }

  renderizarFrame(estado: EstadoRenderizado): void {
    if (!this.graficos) return;
    this.graficos.clear();

    const { width, height } = this.escena.scale;
    const roadW = Math.floor(width * ROAD_WIDTH_PERCENT);
    const roadX = Math.floor((width - roadW) / 2);
    const laneW = roadW / CARRILES;

    // ─── Background ──────────────────────────────────────────────────────
    this.graficos.fillStyle(BG_COLOR, 1);
    this.graficos.fillRect(0, 0, width, height);

    // ─── Grass + curbs + decorations ─────────────────────────────────────
    const numStrips = Math.ceil(height / STRIP_HEIGHT) + 2;
    const scrollOffset = (estado.distanciaRecorrida * 3) % (STRIP_HEIGHT * 2);

    for (let i = 0; i < numStrips; i++) {
      const y = i * STRIP_HEIGHT - scrollOffset;
      const pattern = i % 2;

      // Left grass
      const grassColor = pattern === 0 ? GRASS_COLOR_A : GRASS_COLOR_B;
      this.graficos.fillStyle(grassColor, 1);
      this.graficos.fillRect(0, Math.floor(y), roadX - CURB_WIDTH, STRIP_HEIGHT + 1);

      // Right grass
      this.graficos.fillStyle(grassColor, 1);
      this.graficos.fillRect(roadX + roadW + CURB_WIDTH, Math.floor(y), width - roadX - roadW - CURB_WIDTH, STRIP_HEIGHT + 1);

      // Left curb
      const curbColor = pattern === 0 ? CURB_COLOR_A : CURB_COLOR_B;
      this.graficos.fillStyle(curbColor, 1);
      this.graficos.fillRect(roadX - CURB_WIDTH, Math.floor(y), CURB_WIDTH, STRIP_HEIGHT + 1);

      // Right curb
      this.graficos.fillStyle(curbColor, 1);
      this.graficos.fillRect(roadX + roadW, Math.floor(y), CURB_WIDTH, STRIP_HEIGHT + 1);
    }

    // ─── Trees/bushes decoration (real sprites, irregular positions) ────
    this.actualizarDecoracion(width, height, roadX, roadW, estado);

    // ─── Road surface ────────────────────────────────────────────────────
    this.graficos.fillStyle(ROAD_COLOR, 1);
    this.graficos.fillRect(roadX, 0, roadW, height);

    // ─── Lane dividers (dashed white lines) ──────────────────────────────
    const dashLen = 25;
    const gapLen = 20;
    const totalDash = dashLen + gapLen;
    const dashOffset = (estado.distanciaRecorrida * 3) % totalDash;

    this.graficos.fillStyle(LINE_COLOR, 1);
    for (let lane = 1; lane < CARRILES; lane++) {
      const lineX = roadX + lane * laneW - 2;
      for (let y = -dashOffset; y < height; y += totalDash) {
        if (y + dashLen > 0) {
          this.graficos.fillRect(Math.floor(lineX), Math.floor(y), 4, dashLen);
        }
      }
    }

    // ─── Speed lines effect (when going fast) ────────────────────────────
    if (estado.velocidadActual > 150) {
      this.graficos.fillStyle(0xffffff, 0.15);
      const speedScroll = (estado.distanciaRecorrida * 5) % 80;
      for (let sy = -speedScroll; sy < height; sy += 80) {
        this.graficos.fillRect(roadX + 10, Math.floor(sy), 2, 30);
        this.graficos.fillRect(roadX + roadW - 12, Math.floor(sy), 2, 30);
      }
    }

    // ─── Update player ───────────────────────────────────────────────────
    this.actualizarVehiculo(height, roadX, laneW, estado);

    // ─── Render rivals ───────────────────────────────────────────────────
    this.renderizarRivales(height, roadX, laneW, estado);
  }

  /** Positions decoration sprites scrolling downward (appear top, disappear bottom). */
  private actualizarDecoracion(
    width: number, height: number, roadX: number, roadW: number, estado: EstadoRenderizado
  ): void {
    const totalSprites = this.decoracionSprites.length;
    if (totalSprites === 0) return;

    // Total cycle distance for wrapping
    const totalCycle = height + 120;
    // Scroll speed matches road
    const scroll = (estado.distanciaRecorrida * 3) % totalCycle;

    for (let i = 0; i < totalSprites; i++) {
      const sprite = this.decoracionSprites[i]!;
      const side = sprite.getData('side') as string;

      // Each sprite has a fixed base position spread across the cycle
      const baseY = (i / totalSprites) * totalCycle;
      // Scroll downward (add scroll, wrap when past bottom)
      let y = baseY + scroll - 60;
      if (y > height + 60) y -= totalCycle;

      // X: in the grass, with jitter
      const jitter = Math.sin(i * 4.2) * 15;
      let x: number;
      if (side === 'left') {
        x = (roadX - CURB_WIDTH) * 0.5 + jitter;
      } else {
        const grassRight = width - (roadX + roadW + CURB_WIDTH);
        x = roadX + roadW + CURB_WIDTH + grassRight * 0.5 + jitter;
      }

      sprite.setPosition(Math.floor(x), Math.floor(y));
    }
  }

  private actualizarVehiculo(
    height: number, roadX: number, laneW: number, estado: EstadoRenderizado
  ): void {
    if (!this.vehiculoSprite) return;

    const maxCarril = Math.floor(CARRILES / 2);
    const laneIndex = estado.posicionLateral + maxCarril; // 0, 1, 2
    const x = roadX + laneIndex * laneW + laneW / 2;

    this.vehiculoSprite.setPosition(Math.floor(x), Math.floor(height - 80));
    this.vehiculoSprite.setTint(this.tinte);
    this.vehiculoSprite.setScale(PLAYER_SCALE);
  }

  private renderizarRivales(
    height: number, roadX: number, laneW: number, estado: EstadoRenderizado
  ): void {
    // Hide all sprites first
    for (const s of this.rivalesSprites) s.setVisible(false);

    const visibles = estado.rivalesActivos.filter(
      r => r.activo && r.distancia > -40 && r.distancia < MAX_VISIBLE_DIST
    );

    for (const rival of visibles) {
      // Assign sprite by rival ID (consistent mapping — no switching)
      const spriteIndex = rival.id % this.rivalesSprites.length;
      const sprite = this.rivalesSprites[spriteIndex]!;

      // t: 0 = top of screen, 1 = bottom (at player level)
      const t = 1 - (rival.distancia / MAX_VISIBLE_DIST);
      if (t <= 0) continue;

      // y goes from 0 (top) to height-100 (just above player)
      const y = t * (height - 100);
      const rivalLaneIndex = Math.min(Math.max(rival.carril, 0), CARRILES - 1);
      const x = roadX + rivalLaneIndex * laneW + laneW / 2;

      sprite.setPosition(Math.floor(x), Math.floor(y));
      sprite.setScale(RIVAL_SCALE);
      sprite.clearTint();
      sprite.setVisible(true);
      sprite.setDepth(Math.floor(3 + t * 6));
    }
  }

  aplicarTinte(paleta: string): void {
    const tintes: Record<string, number> = {
      neon: 0x7cf9ff,
      fuego: 0xff6600,
      oscuro: 0x8844aa,
      naturaleza: 0x44ff44,
      calma: 0xffffff,
    };
    this.tinte = tintes[paleta] ?? 0xffffff;
    if (this.vehiculoSprite) this.vehiculoSprite.setTint(this.tinte);
  }

  destruir(): void {
    this.graficos?.destroy();
    this.graficos = null;
    this.vehiculoSprite?.destroy();
    this.vehiculoSprite = null;
    this.personajeSprite?.destroy();
    this.personajeSprite = null;
    for (const s of this.rivalesSprites) s.destroy();
    this.rivalesSprites = [];
    for (const s of this.decoracionSprites) s.destroy();
    this.decoracionSprites = [];
  }
}
