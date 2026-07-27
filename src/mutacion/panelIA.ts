/**
 * Panel visual "LA IA DECIDIÓ" — muestra las perillas de mutación de forma
 * dramática al iniciar una escena. Diseñado para que los jueces del hackaton
 * vean explícitamente cómo la IA muta el juego.
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

/**
 * Muestra el panel "LA IA DECIDIÓ" con las perillas actuales y un cambio de
 * fondo dramático. Se desvanece automáticamente tras 4 segundos.
 * 
 * @param delay Milisegundos de espera antes de mostrar el panel (para no
 *              solaparse con overlays de instrucciones).
 */
export function mostrarPanelIA(escena: Phaser.Scene, perillas: PerillasMutacion, delay = 0): void {
  // Fondo de cámara dramático (se aplica de inmediato)
  escena.cameras.main.setBackgroundColor(COLORES_FONDO[perillas.paleta] ?? 0x12101c);

  // Overlay de color translúcido persistente (filtro tipo "Instagram" sobre todo el juego)
  const camW = escena.cameras.main.width;
  const camH = escena.cameras.main.height;
  const overlayColor = COLORES_OVERLAY[perillas.paleta];
  if (overlayColor !== undefined) {
    const filtro = escena.add.rectangle(camW / 2, camH / 2, camW, camH, overlayColor, 0.2)
      .setScrollFactor(0).setDepth(50).setBlendMode(Phaser.BlendModes.ADD);
    // Efecto de pulso suave para que se note
    escena.tweens.add({
      targets: filtro,
      alpha: { from: 0.15, to: 0.3 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  const mostrar = () => {
    const camW = escena.cameras.main.width;
    const camH = escena.cameras.main.height;

    // Panel oscuro
    const panel = escena.add.rectangle(camW / 2, camH / 2, camW - 40, 160, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(300).setStrokeStyle(2, 0x7cf9ff);

    const titulo = escena.add.text(camW / 2, camH / 2 - 55, '🤖 LA IA MUTÓ EL JUEGO', {
      fontFamily: '"Press Start 2P"',
      fontSize: '10px',
      color: '#7cf9ff',
      shadow: { offsetX: 0, offsetY: 0, color: '#7cf9ff', blur: 8, fill: true },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(301);

    const detalles = escena.add.text(camW / 2, camH / 2 - 25, [
      `🎨 Paleta: ${perillas.paleta.toUpperCase()}`,
      `🌦️ Clima: ${perillas.clima.toUpperCase()}  |  🎵 Música: ${perillas.mood_musica.toUpperCase()}`,
      `👾 Enemigos: ${Math.round(perillas.intensidad_enemigos * 100)}%  |  💀 Agresividad: ${Math.round(perillas.agresividad * 100)}%`,
    ].join('\n'), {
      fontFamily: '"Press Start 2P"',
      fontSize: '7px',
      color: '#ffffff',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(301);

    const mensaje = escena.add.text(camW / 2, camH / 2 + 40, `"${perillas.mensaje}"`, {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#ffd24a',
      align: 'center',
      wordWrap: { width: camW - 80 },
      shadow: { offsetX: 0, offsetY: 0, color: '#ffd24a', blur: 6, fill: true },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(301);

    // Desvanecer tras 4 segundos
    const elementos = [panel, titulo, detalles, mensaje];
    escena.time.delayedCall(4000, () => {
      escena.tweens.add({
        targets: elementos,
        alpha: 0,
        duration: 800,
        onComplete: () => elementos.forEach((el) => el.destroy()),
      });
    });
  };

  if (delay > 0) {
    escena.time.delayedCall(delay, mostrar);
  } else {
    mostrar();
  }
}
