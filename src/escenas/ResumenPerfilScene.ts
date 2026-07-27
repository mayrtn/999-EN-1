/**
 * ResumenPerfilScene — Pantalla de resumen del perfil de personalidad del jugador.
 *
 * Muestra el resultado del análisis de los 4 rasgos (Furia, Curiosidad, Logro,
 * Riesgo) con barras visuales y un resumen textual. Escena de infraestructura
 * del Shell (NO jugable, NO implementa IEscena).
 *
 * Se puede invocar en cualquier momento presionando TAB desde NivelPlataformas
 * o al final de una sesión de demo.
 *
 * @module escenas/ResumenPerfilScene
 */

import Phaser from 'phaser';
import type { PerfilJugador, Rasgo } from '../contrato';
import { CLAVE_PERFIL_JUGADOR } from '../shell/BootScene';

/** Id de esta escena en Phaser. */
export const ID_RESUMEN = 'resumen_perfil';

/** Config visual por rasgo. */
const RASGOS_CONFIG: { rasgo: Rasgo; nombre: string; color: number; emoji: string }[] = [
  { rasgo: 'furia', nombre: 'FURIA', color: 0xff4444, emoji: '🔥' },
  { rasgo: 'curiosidad', nombre: 'CURIOSIDAD', color: 0x44ff88, emoji: '🔍' },
  { rasgo: 'logro', nombre: 'LOGRO', color: 0xffdd44, emoji: '⭐' },
  { rasgo: 'riesgo', nombre: 'RIESGO', color: 0xff8844, emoji: '💀' },
];

/** Descripciones por rasgo dominante. */
const DESCRIPCIONES: Record<Rasgo, string> = {
  furia: 'Sos un jugador agresivo y directo.\nDestruís todo a tu paso.',
  curiosidad: 'Sos un explorador nato.\nBuscás cada rincón oculto del mapa.',
  logro: 'Sos un completista.\nNo dejás moneda sin recoger.',
  riesgo: 'Vivís al límite.\nTe acercás al peligro por diversión.',
};

/**
 * Escena de resumen de perfil. Lee el PerfilJugador del registry y lo muestra
 * con barras visuales animadas.
 */
export class ResumenPerfilScene extends Phaser.Scene {
  constructor() {
    super({ key: ID_RESUMEN });
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // Leer perfil del registry
    const perfil = this.game.registry.get(CLAVE_PERFIL_JUGADOR) as PerfilJugador | undefined;
    const rasgos = perfil?.rasgos ?? { furia: 0, curiosidad: 0, logro: 0, riesgo: 0 };

    // Determinar rasgo dominante
    let dominante: Rasgo = 'furia';
    let maxVal = -1;
    for (const cfg of RASGOS_CONFIG) {
      if (rasgos[cfg.rasgo] > maxVal) {
        maxVal = rasgos[cfg.rasgo];
        dominante = cfg.rasgo;
      }
    }

    // Fondo oscuro con gradiente
    const bgGfx = this.add.graphics();
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const r = 4 + t * 8;
      const g = 2 + t * 4;
      const b = 16 + t * 12;
      const color = (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
      bgGfx.fillStyle(color, 1);
      bgGfx.fillRect(0, y, w, 1);
    }

    // Título
    this.add.text(w / 2, 40, '📊 TU PERFIL DE JUGADOR', {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // Línea decorativa
    const lineGfx = this.add.graphics();
    lineGfx.lineStyle(1, 0x7cf9ff, 0.5);
    lineGfx.lineBetween(w * 0.15, 65, w * 0.85, 65);

    // Barras de rasgos
    const barStartY = 90;
    const barHeight = 18;
    const barSpacing = 55;
    const barMaxWidth = 280;
    const barX = w / 2 - barMaxWidth / 2;

    RASGOS_CONFIG.forEach((cfg, i) => {
      const y = barStartY + i * barSpacing;
      const valor = rasgos[cfg.rasgo];
      const porcentaje = Math.round(valor * 100);

      // Emoji + nombre del rasgo
      this.add.text(barX - 10, y, `${cfg.emoji} ${cfg.nombre}`, {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#' + cfg.color.toString(16).padStart(6, '0'),
      }).setOrigin(0, 0.5);

      // Porcentaje
      this.add.text(barX + barMaxWidth + 10, y, `${porcentaje}%`, {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#ffffff',
      }).setOrigin(0, 0.5);

      // Fondo de la barra
      const barBgY = y + 14;
      this.add.rectangle(barX + barMaxWidth / 2, barBgY, barMaxWidth, barHeight, 0x222233)
        .setStrokeStyle(1, 0x444466);

      // Barra de valor (animada)
      const fillWidth = Math.max(2, valor * barMaxWidth);
      const fill = this.add.rectangle(barX, barBgY, 0, barHeight - 4, cfg.color, 0.85)
        .setOrigin(0, 0.5);

      // Animación de llenado
      this.tweens.add({
        targets: fill,
        width: fillWidth,
        duration: 800,
        delay: 200 + i * 150,
        ease: 'Power2',
      });
    });

    // Sección de resumen textual
    const resumenY = barStartY + 4 * barSpacing + 20;

    // Línea separadora
    lineGfx.lineStyle(1, 0x7cf9ff, 0.3);
    lineGfx.lineBetween(w * 0.2, resumenY, w * 0.8, resumenY);

    // Descripción del rasgo dominante
    const descCfg = RASGOS_CONFIG.find((c) => c.rasgo === dominante)!;
    this.add.text(w / 2, resumenY + 20, `${descCfg.emoji} RASGO DOMINANTE: ${descCfg.nombre}`, {
      fontFamily: '"Press Start 2P"',
      fontSize: '9px',
      color: '#' + descCfg.color.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    this.add.text(w / 2, resumenY + 50, DESCRIPCIONES[dominante], {
      fontFamily: '"Press Start 2P"',
      fontSize: '7px',
      color: '#cccccc',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);

    // Instrucción para volver
    const volver = this.add.text(w / 2, h - 30, '[ ESC ] VOLVER AL JUEGO', {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#888888',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: volver,
      alpha: { from: 0.5, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    // Input: ESC para volver
    this.input.keyboard!.on('keydown-ESC', () => {
      this.scene.stop(ID_RESUMEN);
      this.scene.resume('plataformas');
    });

    // Fade in
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }
}
