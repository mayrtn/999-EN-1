/**
 * Panel visual "LA IA MUTÓ" — muestra las perillas de mutación de forma
 * compacta y dramática al iniciar una escena. Diseñado para que los jueces del
 * hackaton vean explícitamente cómo la IA muta el juego.
 *
 * @module mutacion/panelIA
 */

import Phaser from 'phaser';
import type { PerillasMutacion } from '../contrato';

/** Colores de fondo de cámara por paleta (impacto visual inmediato). */
const COLORES_FONDO: Record<string, number> = {
  infierno: 0x330000,
  sueno: 0x1a0040,
  neon: 0x003318,
  hostil: 0x0f0f1a,
};

/** Colores de overlay translúcido por paleta (efecto "filtro de color" dramático). */
const COLORES_OVERLAY: Record<string, number> = {
  infierno: 0xff2200,
  sueno: 0x8800ff,
  neon: 0x00ff88,
  hostil: 0x88aa00,
};

/** Color de acento del borde del panel por paleta. */
const COLORES_ACENTO: Record<string, number> = {
  infierno: 0xff4422,
  sueno: 0xb388ff,
  neon: 0x1fffd1,
  hostil: 0x7bd634,
};

/**
 * Muestra el panel "LA IA MUTÓ" con las perillas actuales. Panel compacto
 * centrado verticalmente, más angosto que la pantalla.
 *
 * @param delay Milisegundos de espera antes de mostrar el panel.
 */
export function mostrarPanelIA(escena: Phaser.Scene, perillas: PerillasMutacion, delay = 0): void {
  // Fondo de cámara dramático (se aplica de inmediato)
  escena.cameras.main.setBackgroundColor(COLORES_FONDO[perillas.paleta] ?? 0x12101c);

  // Overlay de color translúcido persistente (filtro tipo "Instagram" sobre todo el juego)
  const camW = escena.cameras.main.width;
  const camH = escena.cameras.main.height;
  const overlayColor = COLORES_OVERLAY[perillas.paleta];
  if (overlayColor !== undefined) {
    const filtro = escena.add.rectangle(camW / 2, camH / 2, camW, camH, overlayColor, 0.15)
      .setScrollFactor(0).setDepth(50).setBlendMode(Phaser.BlendModes.ADD);
    escena.tweens.add({
      targets: filtro,
      alpha: { from: 0.1, to: 0.25 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  const mostrar = () => {
    const w = escena.cameras.main.width;
    const h = escena.cameras.main.height;
    const acento = COLORES_ACENTO[perillas.paleta] ?? 0x7cf9ff;

    // Dimensiones del panel (compacto, no full-width)
    const panelW = 380;
    const panelH = 180;
    const cx = w / 2;
    const cy = h / 2;

    // Fondo oscuro fullscreen
    const fondoOscuro = escena.add.rectangle(cx, cy, w, h, 0x000000, 0.75)
      .setScrollFactor(0).setDepth(299);

    // Panel con borde de color según paleta
    const panel = escena.add.rectangle(cx, cy, panelW, panelH, 0x080810, 0.96)
      .setScrollFactor(0).setDepth(300).setStrokeStyle(2, acento);

    // Borde interior sutil
    escena.add.rectangle(cx, cy, panelW - 8, panelH - 8, 0x000000, 0)
      .setScrollFactor(0).setDepth(300).setStrokeStyle(1, acento, 0.25);

    // Línea decorativa superior
    const lineaGfx = escena.add.graphics().setScrollFactor(0).setDepth(301);
    lineaGfx.lineStyle(1, acento, 0.6);
    lineaGfx.lineBetween(cx - panelW / 2 + 20, cy - panelH / 2 + 28, cx + panelW / 2 - 20, cy - panelH / 2 + 28);

    // Título
    const titulo = escena.add.text(cx, cy - panelH / 2 + 16, '⚡ LA IA MUTÓ EL JUEGO', {
      fontFamily: '"Press Start 2P"',
      fontSize: '9px',
      color: '#' + acento.toString(16).padStart(6, '0'),
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);

    // Contenido — dos columnas compactas
    const colIzq = cx - 70;
    const colDer = cx + 70;
    const startY = cy - 30;
    const lineH = 20;

    const estiloClave = { fontFamily: '"Press Start 2P"', fontSize: '6px', color: '#888899' };
    const estiloValor = { fontFamily: '"Press Start 2P"', fontSize: '7px', color: '#ffffff' };

    // Columna izquierda
    escena.add.text(colIzq, startY, 'PALETA', estiloClave)
      .setOrigin(0.5).setScrollFactor(0).setDepth(301);
    escena.add.text(colIzq, startY + 12, perillas.paleta.toUpperCase(), estiloValor)
      .setOrigin(0.5).setScrollFactor(0).setDepth(301);

    escena.add.text(colIzq, startY + lineH + 14, 'CLIMA', estiloClave)
      .setOrigin(0.5).setScrollFactor(0).setDepth(301);
    escena.add.text(colIzq, startY + lineH + 26, perillas.clima.toUpperCase(), estiloValor)
      .setOrigin(0.5).setScrollFactor(0).setDepth(301);

    // Columna derecha
    escena.add.text(colDer, startY, 'ENEMIGOS', estiloClave)
      .setOrigin(0.5).setScrollFactor(0).setDepth(301);
    escena.add.text(colDer, startY + 12, `${Math.round(perillas.intensidad_enemigos * 100)}%`, estiloValor)
      .setOrigin(0.5).setScrollFactor(0).setDepth(301);

    escena.add.text(colDer, startY + lineH + 14, 'MÚSICA', estiloClave)
      .setOrigin(0.5).setScrollFactor(0).setDepth(301);
    escena.add.text(colDer, startY + lineH + 26, perillas.mood_musica.toUpperCase(), estiloValor)
      .setOrigin(0.5).setScrollFactor(0).setDepth(301);

    // Mensaje de la IA (centrado abajo del panel)
    const mensaje = escena.add.text(cx, cy + panelH / 2 - 30, `"${perillas.mensaje}"`, {
      fontFamily: '"Press Start 2P"',
      fontSize: '7px',
      color: '#ffd24a',
      align: 'center',
      wordWrap: { width: panelW - 40 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);

    // Recopilar todos los elementos para fade-out
    const elementos: Phaser.GameObjects.GameObject[] = [];
    escena.children.each((child) => {
      const go = child as { depth?: number };
      if (go.depth && go.depth >= 299 && go.depth <= 301) {
        elementos.push(child);
      }
    });

    // Pausar la física y el input mientras se muestra el panel
    escena.physics.pause();
    if (escena.input.keyboard) escena.input.keyboard.enabled = false;

    // Desvanecer tras 3.5 segundos
    escena.time.delayedCall(3500, () => {
      escena.tweens.add({
        targets: elementos,
        alpha: 0,
        duration: 600,
        onComplete: () => {
          elementos.forEach((el) => el.destroy());
          // Reanudar la física y el input
          escena.physics.resume();
          if (escena.input.keyboard) escena.input.keyboard.enabled = true;
        },
      });
    });
  };

  if (delay > 0) {
    escena.time.delayedCall(delay, mostrar);
  } else {
    mostrar();
  }
}
