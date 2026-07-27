/**
 * Nivel_Shooter — nivel oculto de shooter de galería fija (Requirement 3).
 *
 * Escena jugable de Phaser 3 que implementa el {@link IEscena} del
 * Contrato_Compartido. Presenta una galería fija en la que aparecen objetivos y
 * el jugador mueve una mira con el {@link InputUnificado} y dispara para
 * destruirlos, durante una sesión corta de 60–90 s.
 *
 * Mapa de responsabilidades ↔ requisitos:
 * - Sesión de 60–90 s y notificación de retorno al Shell (Requirements 3.1, 3.5).
 * - Movimiento de la mira según `input.direccion()` (Requirement 3.2).
 * - Disparo en la posición de la mira al presionar la acción primaria
 *   (Requirement 3.3).
 * - Impacto que registra y remueve el objetivo de la escena (Requirement 3.4).
 * - Aplicación de las Perillas_Mutacion vía Sistema_Mutacion (Requirements 3.6,
 *   9.4).
 * - Emisión de la Telemetria_Rasgos al terminar (Requirements 3.7, 9.1).
 *
 * FASE 1 — arte placeholder: todos los objetos usan texturas generadas en
 * runtime (rectángulos y una cruz de mira), sin depender de assets reales.
 *
 * @module escenas/NivelShooter
 */

import Phaser from 'phaser';
import type {
  DatosInicioEscena,
  DeclaracionRasgos,
  IEscena,
  IShell,
  InputUnificado,
  PerillasMutacion,
  SpawnerEnemigos,
  TelemetriaRasgos,
  GestorAudio,
} from '../contrato';
import {
  SistemaMutacion,
  OverlayTextoPhaser,
  crearCapaClima,
  asegurarTexturaParticula,
} from '../mutacion';
import { mostrarPanelIA } from '../mutacion/panelIA';
import { sfxShoot, sfxHit } from '../audio/sfx';
import { crearGestorAudio } from '../audio/gestorAudioHibrido';
import { CLAVE_PERSONAJE } from './EscenaSeleccion';

/** Duración mínima de la sesión (Requirement 3.1), en milisegundos. */
const DURACION_MIN_MS = 30_000;
/** Duración máxima de la sesión (Requirement 3.1), en milisegundos. */
const DURACION_MAX_MS = 50_000;
/** Duración por defecto si no se configura otra (dentro de `[30000,50000]`). */
const DURACION_DEFECTO_MS = 40_000;

/** Velocidad de desplazamiento de la mira, en píxeles por segundo. */
const VELOCIDAD_MIRA = 420;

/** Lado del objetivo cuadrado placeholder, en píxeles. */
const LADO_OBJETIVO = 40;
/** Lado de la textura de mira placeholder (legacy, se usa 48 directo). */
// const LADO_MIRA = 36;

/** Keys de texturas placeholder generadas en runtime. */
const KEY_TEX_OBJETIVO = 'shooter_objetivo';
const KEY_TEX_MIRA = 'shooter_mira';

/** Intervalo base de aparición de objetivos, en ms (modulado por intensidad). */
const INTERVALO_SPAWN_BASE_MS = 1_000;
/** Máximo de objetivos simultáneos base (modulado por intensidad). */
const MAX_OBJETIVOS_BASE = 5;
/** Velocidad horizontal base de los objetivos, en px/s (modulada por agresividad). */
const VELOCIDAD_OBJETIVO_BASE = 70;

/** Ventana (ms) desde la aparición para considerar un impacto "quick-draw" (riesgo). */
const VENTANA_QUICKDRAW_MS = 700;

/** Profundidades de render para ordenar el mundo placeholder. */
const PROFUNDIDAD_OBJETIVO = 10;
const PROFUNDIDAD_DISPARO = 20;
const PROFUNDIDAD_MIRA = 30;

/**
 * Estado interno de un objetivo activo de la galería.
 */
interface ObjetivoActivo {
  /** Sprite placeholder del objetivo (tintable por la paleta). */
  sprite: Phaser.GameObjects.Sprite;
  /** Velocidad horizontal en px/s (signo = dirección). */
  velocidadX: number;
  /** Marca de tiempo de aparición (para medir quick-draw / riesgo). */
  aparicionMs: number;
  /** Si es true, dispararle penaliza (bomba). */
  esBomba: boolean;
}

/**
 * Opciones de construcción del {@link NivelShooter} (principalmente para tests
 * y ajustes finos). La duración se acota siempre a `[30000, 50000]`.
 */
export interface NivelShooterOpciones {
  /** Duración de la sesión en ms; se acota a `[30000, 50000]` (Requirement 3.1). */
  duracionMs?: number;
}

/**
 * Nivel_Shooter: shooter de galería fija que respeta el Contrato_Compartido
 * (Requirement 3).
 */
export class NivelShooter extends Phaser.Scene implements IEscena {
  /** Identidad lógica de la Escena (Requirement 9). */
  readonly id = 'shooter' as const;

  /** Duración efectiva de la sesión, acotada a `[30000, 50000]` (Requirement 3.1). */
  private readonly duracionMs: number;

  /** Fachada del Shell; puede faltar hasta el cableado (Task 11). */
  private shell?: IShell;
  /**
   * Input unificado inyectado por el Shell (Requirements 9.5, 9.6).
   *
   * Nombre propio (`inputUnificado`) para no colisionar con la propiedad
   * `input: InputPlugin` que `Phaser.Scene` expone.
   */
  private inputUnificado?: InputUnificado;
  /** Perillas resueltas recibidas del Shell (Requirements 3.6, 9.4). */
  private perillas?: PerillasMutacion;

  /** Sprite de la mira que el jugador desplaza (Requirement 3.2). */
  private mira?: Phaser.GameObjects.Sprite;
  /** Objetivos actualmente en pantalla (Requirements 3.3, 3.4). */
  private objetivos: ObjetivoActivo[] = [];
  /** Emisor de partículas para el clima (Requirement 7.4). */
  private capaClima?: Phaser.GameObjects.Particles.ParticleEmitter;

  /** Sistema_Mutacion que aplica las perillas (Requirement 7). */
  private readonly sistemaMutacion = new SistemaMutacion();
  /** Gestor de audio para el mood musical (Requirement 7.5). */
  private gestorAudio?: GestorAudio;
  /** Overlay de texto para el mensaje de la IA (Requirement 7.6). */
  private overlayTexto?: OverlayTextoPhaser;

  // --- Parámetros de spawn modulados por las perillas (Requirements 7.2, 7.3) ---
  /** Densidad `[0,1]` derivada de `intensidad_enemigos` (Requirement 7.2). */
  private intensidad = 0.5;
  /** Agresividad `[0,1]` derivada de `agresividad` (Requirement 7.3). */
  private agresividad = 0.5;

  /** Temporizador de aparición de objetivos. */
  private timerSpawn?: Phaser.Time.TimerEvent;
  /** Temporizador de fin de sesión (Requirement 3.5). */
  private timerFin?: Phaser.Time.TimerEvent;
  /** Marca de que la sesión ya finalizó (evita reentradas). */
  private terminado = false;
  private esperandoInicio = true;

  // --- Señales acumuladas para la telemetría (Requirements 3.7, 9.1) ---
  /** Total de objetivos que aparecieron (oportunidad de furia). */
  private totalObjetivos = 0;
  /** Objetivos destruidos por impacto (señal de furia). */
  private objetivosDestruidos = 0;
  /** Disparos realizados (oportunidad de logro / precisión). */
  private disparos = 0;
  /** Impactos acertados (señal de logro; oportunidad de riesgo). */
  private impactos = 0;
  /** Impactos "quick-draw" logrados poco después de aparecer (señal de riesgo). */
  private impactosRapidos = 0;
  /** Bombas impactadas (penalización). */
  private bombasImpactadas = 0;

  /**
   * @param opciones Ajustes opcionales (duración de sesión).
   */
  constructor(opciones: NivelShooterOpciones = {}) {
    super({ key: 'shooter' });
    this.duracionMs = NivelShooter.acotarDuracion(
      opciones.duracionMs ?? DURACION_DEFECTO_MS
    );
  }

  /**
   * Acota una duración propuesta al rango válido `[30000, 50000]` ms
   * (Requirement 3.1).
   */
  private static acotarDuracion(ms: number): number {
    if (!Number.isFinite(ms)) return DURACION_DEFECTO_MS;
    return Math.min(DURACION_MAX_MS, Math.max(DURACION_MIN_MS, ms));
  }

  /**
   * Recibe del Shell las perillas resueltas, la fachada y el input antes de
   * `create()` (Requirement 8.4). Degrada con gracia si el Shell aún no está
   * cableado (Task 11): guarda lo que llegue sin fallar.
   */
  init(datos: DatosInicioEscena): void {
    this.shell = datos?.shell;
    this.inputUnificado = datos?.input;
    this.perillas = datos?.perillas;
    // Reinicia el estado por si la escena se reutiliza entre sesiones.
    this.reiniciarEstado();
  }

  /** Inyecta el input unificado (Requirements 9.5, 9.6). */
  setInput(input: InputUnificado): void {
    this.inputUnificado = input;
  }

  /**
   * Genera las texturas placeholder (Fase 1) y carga assets reales del pack
   * Space Shooter si están disponibles.
   */
  preload(): void {
    this.generarTexturaObjetivo();
    this.generarTexturaMira();

    // Cargar assets reales del pack Space Shooter.
    // Cargar aliens como spritesheets animados (tiras de 256x16, frames de 16x16).
    const alienKeys = ['alien_1', 'alien_2', 'alien_3', 'alien_4'];
    const alienPaths = [
      'src/assets/items/Aliens/Aliens1.png',
      'src/assets/items/Aliens/Aliens2.png',
      'src/assets/items/Aliens/Aliens3.png',
      'src/assets/items/Aliens/Aliens4.png',
    ];
    for (let i = 0; i < alienKeys.length; i++) {
      const k = alienKeys[i] as string;
      const p = alienPaths[i] as string;
      if (!this.textures.exists(k)) {
        this.load.spritesheet(k, p, { frameWidth: 32, frameHeight: 16 });
      }
    }

    // Cargar dinamita como spritesheet animado (3x3, 32x32 por frame).
    if (!this.textures.exists('dinamita')) {
      this.load.spritesheet('dinamita', 'src/assets/items/dynamite.png', {
        frameWidth: 32,
        frameHeight: 32,
      });
    }
  }

  /**
   * Construye la galería: fondo, mira, colaboradores de mutación, aplica las
   * perillas y arranca los temporizadores de spawn y de fin de sesión
   * (Requirements 3.1, 3.5, 3.6).
   */
  create(): void {
    // Validación de personaje seleccionado (Requirements 4.3, 4.4).
    const idPersonaje = this.game.registry.get(CLAVE_PERSONAJE) as string | null;
    if (!idPersonaje || !['pink_monster', 'owlet_monster', 'dude_monster'].includes(idPersonaje)) {
      if (this.shell) {
        this.shell.solicitarTransicion('seleccion_personaje');
      } else {
        // eslint-disable-next-line no-console
        console.warn('[NivelShooter] Sin personaje seleccionado y sin Shell: no se puede redirigir.');
      }
      return;
    }

    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor('#181840');

    // === DECORACIÓN DE FONDO ===
    this.crearFondoEspacial(width, height);
    this.crearDecoracionShooter(width, height);
    this.crearHudShooter(width);
    this.crearPersonajeDecorativoShooter();

    // Mira centrada al inicio — oculta hasta que arranque el juego.
    this.mira = this.add
      .sprite(width / 2, height / 2, KEY_TEX_MIRA)
      .setDepth(PROFUNDIDAD_MIRA)
      .setVisible(false);

    // Colaboradores de mutación (Requirement 7).
    this.gestorAudio = crearGestorAudio(this);
    this.overlayTexto = new OverlayTextoPhaser(this);

    // Aplica las perillas recibidas, si las hay (Requirements 3.6, 9.4).
    if (this.perillas) {
      this.aplicarPerillas(this.perillas);
    }

    // Esperar mostrando instrucciones (5s) + panel IA (5s) antes de arrancar.
    this.esperandoInicio = true;
    this.time.delayedCall(10000, () => {
      this.esperandoInicio = false;
      if (this.mira) this.mira.setVisible(true);
      // Temporizador de aparición de objetivos, según intensidad.
      this.programarSpawn();
      // Fin de sesión tras la duración configurada (Requirements 3.1, 3.5).
      this.timerFin = this.time.delayedCall(this.duracionMs, () => this.finalizar());
    });
  }

  // =========================================================================
  // Decoración visual
  // =========================================================================

  /** Fondo con muchas estrellas, nebulosas y estrellas que parpadean. */
  private crearFondoEspacial(width: number, height: number): void {
    const bg = this.add.graphics().setDepth(-10);

    // Muchas estrellas (120).
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() > 0.8 ? 2 : 1;
      const alpha = 0.15 + Math.random() * 0.6;
      const color = Math.random() > 0.6 ? 0xffffff : Math.random() > 0.5 ? 0x88ccff : 0xffcc88;
      bg.fillStyle(color, alpha);
      bg.fillRect(x, y, size, size);
    }

    // Nebulosas de color.
    bg.fillStyle(0x2211aa, 0.05);
    bg.fillCircle(width * 0.2, height * 0.3, 140);
    bg.fillStyle(0xaa1144, 0.04);
    bg.fillCircle(width * 0.75, height * 0.6, 110);
    bg.fillStyle(0x115533, 0.03);
    bg.fillCircle(width * 0.5, height * 0.8, 90);

    // Estrellas que parpadean (tweens).
    for (let i = 0; i < 8; i++) {
      const star = this.add
        .circle(
          Phaser.Math.Between(20, width - 20),
          Phaser.Math.Between(20, height - 20),
          1.5,
          0xffffff
        )
        .setAlpha(0.3)
        .setDepth(-9);
      this.tweens.add({
        targets: star,
        alpha: { from: 0.2, to: 0.9 },
        duration: 600 + Math.random() * 800,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 2000,
      });
    }

    // Estrellas extra grandes que brillan más.
    for (let i = 0; i < 5; i++) {
      const bigStar = this.add.graphics().setDepth(-9);
      const bx = Phaser.Math.Between(30, width - 30);
      const by = Phaser.Math.Between(30, height - 30);
      bigStar.fillStyle(0xffffff, 0.4);
      bigStar.fillRect(bx, by, 3, 1);
      bigStar.fillRect(bx + 1, by - 1, 1, 3);
      this.tweens.add({
        targets: bigStar,
        alpha: { from: 0.2, to: 1 },
        duration: 1000 + Math.random() * 1500,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 3000,
      });
    }

    // Planeta/luna decorativa lejana.
    const planeta = this.add.graphics().setDepth(-9);
    planeta.fillStyle(0x334466, 0.15);
    planeta.fillCircle(width - 80, 100, 35);
    planeta.fillStyle(0x445577, 0.1);
    planeta.fillCircle(width - 75, 95, 28);
  }

  /** Decoración: marcos, título, instrucción, partículas ambientales. */
  private crearDecoracionShooter(width: number, height: number): void {
    this.add
      .text(width / 2, 35, 'SHOOTER', {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#ff4444',
        shadow: { offsetX: 0, offsetY: 0, color: '#ff4444', blur: 8, fill: true },
      })
      .setOrigin(0.5, 0)
      .setDepth(100)
      .setAlpha(0.9);

    // Instrucción centrada que se muestra antes de arrancar.
    const instruccion = this.add
      .text(width / 2, height / 2, 'LOS ALIENS CRUZAN LA PANTALLA\nMOVE LA MIRA CON LAS FLECHAS\nDISPARA CON ESPACIO\n\n¡EVITA LAS DINAMITAS!', {
        fontFamily: '"Press Start 2P"',
        fontSize: '11px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 10,
        shadow: { offsetX: 0, offsetY: 0, color: '#ff4444', blur: 6, fill: true },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(101)
      .setAlpha(1);

    // Se desvanece cuando el juego arranca.
    this.time.delayedCall(4500, () => {
      this.tweens.add({
        targets: instruccion,
        alpha: 0,
        duration: 400,
        onComplete: () => instruccion.destroy(),
      });
    });

    const marcos = this.add.graphics().setDepth(-5);
    const len = 25;
    marcos.lineStyle(2, 0xff4444, 0.4);
    marcos.beginPath(); marcos.moveTo(10, 10 + len); marcos.lineTo(10, 10); marcos.lineTo(10 + len, 10); marcos.strokePath();
    marcos.beginPath(); marcos.moveTo(width - 10 - len, 10); marcos.lineTo(width - 10, 10); marcos.lineTo(width - 10, 10 + len); marcos.strokePath();
    marcos.beginPath(); marcos.moveTo(10, height - 10 - len); marcos.lineTo(10, height - 10); marcos.lineTo(10 + len, height - 10); marcos.strokePath();
    marcos.beginPath(); marcos.moveTo(width - 10 - len, height - 10); marcos.lineTo(width - 10, height - 10); marcos.lineTo(width - 10, height - 10 - len); marcos.strokePath();

    const keyPart = asegurarTexturaParticula(this);
    this.add.particles(0, 0, keyPart, {
      x: { min: 0, max: width },
      y: { min: 0, max: height },
      lifespan: 4000,
      speed: { min: 5, max: 15 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.15, end: 0 },
      alpha: { start: 0.3, end: 0 },
      tint: 0x4488ff,
      frequency: 400,
      quantity: 1,
    }).setDepth(-4);

    const scan = this.add.graphics().setDepth(-3);
    scan.lineStyle(1, 0xff4444, 0.06);
    for (let y = 50; y < height - 50; y += 40) {
      scan.beginPath();
      scan.moveTo(0, y);
      scan.lineTo(width, y);
      scan.strokePath();
    }
    this.tweens.add({
      targets: scan,
      alpha: { from: 0.3, to: 0.8 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Partículas extras — polvo rojo oscuro flotando.
    this.add.particles(0, 0, keyPart, {
      x: { min: 0, max: width },
      y: { min: 0, max: height },
      lifespan: 5000,
      speed: { min: 3, max: 12 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.1, end: 0 },
      alpha: { start: 0.2, end: 0 },
      tint: 0xff4444,
      frequency: 600,
      quantity: 1,
    }).setDepth(-4);

    // Cometas/estrellas fugaces ocasionales (líneas que cruzan).
    this.time.addEvent({
      delay: 3000,
      loop: true,
      callback: () => {
        const startX = Phaser.Math.Between(0, width);
        const linea = this.add.graphics().setDepth(-8).setAlpha(0.6);
        linea.lineStyle(1, 0xffffff, 0.8);
        linea.beginPath();
        linea.moveTo(startX, 0);
        linea.lineTo(startX + 60, 40);
        linea.strokePath();
        this.tweens.add({
          targets: linea,
          alpha: 0,
          x: 80,
          y: 60,
          duration: 600,
          onComplete: () => linea.destroy(),
        });
      },
    });

    // Grid de puntos tenues en los bordes (tipo radar).
    const grid = this.add.graphics().setDepth(-6);
    grid.fillStyle(0xff4444, 0.1);
    for (let gx = 20; gx < width; gx += 50) {
      for (let gy = 20; gy < height; gy += 50) {
        // Solo dibujar en los bordes (no en el centro donde van los aliens).
        if (gx > 100 && gx < width - 100 && gy > 60 && gy < height - 60) continue;
        grid.fillCircle(gx, gy, 1);
      }
    }
  }

  /** HUD con disparos, impactos y tiempo (lado derecho). */
  private crearHudShooter(width: number): void {
    const labelStyle = { fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ff4444' };
    const valStyle = {
      fontFamily: '"Press Start 2P"', fontSize: '13px', color: '#ffffff',
      shadow: { offsetX: 0, offsetY: 0, color: '#ff4444', blur: 4, fill: true },
    };
    this.add.text(width - 140, 48, 'DISPAROS', labelStyle).setScrollFactor(0).setDepth(100);
    this.add.text(width - 140, 60, '000', valStyle).setScrollFactor(0).setDepth(100).setName('hud_disparos');
    this.add.text(width - 140, 88, 'IMPACTOS', labelStyle).setScrollFactor(0).setDepth(100);
    this.add.text(width - 140, 100, '000', valStyle).setScrollFactor(0).setDepth(100).setName('hud_impactos');
    this.add.text(width - 140, 128, 'DINAMITAS', labelStyle).setScrollFactor(0).setDepth(100);
    this.add.text(width - 140, 140, '000', { fontFamily: '"Press Start 2P"', fontSize: '13px', color: '#ff4444', shadow: { offsetX: 0, offsetY: 0, color: '#ff0000', blur: 4, fill: true } }).setScrollFactor(0).setDepth(100).setName('hud_bombas');
    this.add.text(width - 140, 168, 'TIEMPO', labelStyle).setScrollFactor(0).setDepth(100);
    this.add.text(width - 140, 180, '00:40', valStyle).setScrollFactor(0).setDepth(100).setName('hud_tiempo');
  }

  /** Personaje decorativo en la esquina inferior izquierda. */
  private crearPersonajeDecorativoShooter(): void {
    const idPersonaje = this.game.registry.get(CLAVE_PERSONAJE) as string | null;
    if (!idPersonaje) return;
    const keyIdle = `${idPersonaje}_idle`;
    if (!this.textures.exists(keyIdle)) return;
    const animKey = `${idPersonaje}_idle_shooter`;
    if (!this.anims.exists(animKey)) {
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(keyIdle, { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    const personaje = this.add
      .sprite(50, this.scale.height - 70, keyIdle)
      .setScale(2)
      .setAlpha(0.8)
      .setDepth(5);
    personaje.play(animKey);
  }

  /**
   * Bucle por frame: actualiza el input, mueve la mira, procesa el disparo y
   * desplaza los objetivos de la galería (Requirements 3.2, 3.3, 3.4).
   *
   * @param _tiempo Tiempo absoluto del juego (no usado directamente).
   * @param deltaMs Delta en ms desde el frame anterior.
   */
  override update(_tiempo: number, deltaMs: number): void {
    if (this.terminado) return;
    if (this.esperandoInicio) return;

    // El input just-pressed exige actualizar una vez por frame (contrato de
    // InputTeclado). El método `update()` es propio del binding concreto y no
    // forma parte de InputUnificado, por lo que se invoca de forma defensiva.
    (this.inputUnificado as { update?: () => void } | undefined)?.update?.();

    this.moverMira(deltaMs);
    this.procesarDisparo();
    this.moverObjetivos(deltaMs);
    this.actualizarHudShooter();
  }

  /** Actualiza los valores del HUD del shooter. */
  private actualizarHudShooter(): void {
    const hudDisparos = this.children.getByName('hud_disparos') as Phaser.GameObjects.Text | null;
    const hudImpactos = this.children.getByName('hud_impactos') as Phaser.GameObjects.Text | null;
    const hudBombas = this.children.getByName('hud_bombas') as Phaser.GameObjects.Text | null;
    const hudTiempo = this.children.getByName('hud_tiempo') as Phaser.GameObjects.Text | null;

    if (hudDisparos) hudDisparos.setText(String(this.disparos).padStart(3, '0'));
    if (hudImpactos) hudImpactos.setText(String(this.impactos).padStart(3, '0'));
    if (hudBombas) hudBombas.setText(String(this.bombasImpactadas).padStart(3, '0'));
    if (hudTiempo && this.timerFin) {
      const restanteMs = Math.max(0, this.timerFin.getRemaining());
      const s = Math.ceil(restanteMs / 1000);
      const min = Math.floor(s / 60);
      const sec = s % 60;
      hudTiempo.setText(`${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
    }
  }

  /**
   * Declara los Rasgos que mide el shooter y sus topes de Oportunidad
   * (Requirement 4.2). Rasgos no medidos → tope 0 (Requirement 4.5).
   *
   * - `furia`: destruir objetivos (acción destructiva del género).
   * - `logro`: precisión de disparo (impactos / disparos).
   * - `riesgo`: reflejos / quick-draw (impactos logrados apenas aparece el objetivo).
   * - `curiosidad`: no se mide en este género → 0.
   */
  declararRasgos(): DeclaracionRasgos {
    return {
      oportunidadMaxima: {
        // Estimaciones de tope basadas en la duración; el Motor_Scoring usa la
        // oportunidad real de la telemetría para normalizar.
        furia: MAX_OBJETIVOS_BASE * 12,
        logro: MAX_OBJETIVOS_BASE * 16,
        riesgo: MAX_OBJETIVOS_BASE * 10,
        curiosidad: 0,
      },
    };
  }

  /**
   * Aplica las Perillas_Mutacion a la escena reutilizando los sprites existentes
   * (Requirements 3.6, 7, 9.4).
   *
   * Arma el {@link ContextoMutacion} con las referencias propias (mira +
   * objetivos como sprites tintables, capa de clima, spawner adaptador, gestor de
   * audio y overlay) y delega en el {@link SistemaMutacion}.
   */
  aplicarPerillas(perillas: PerillasMutacion): void {
    this.perillas = perillas;

    // Panel visual dramático para la demo (siempre al entrar)
    mostrarPanelIA(this, perillas, 5000);
    this.game.registry.set('ya_jugo_escena', true);

    // La escena podría no estar aún creada (llamada temprana); si falta la mira
    // se aplicará en create().
    if (!this.mira || !this.gestorAudio || !this.overlayTexto) return;

    // Capa de clima acorde a la perilla; si es 'ninguno' se crea un emisor vacío
    // detenido para satisfacer el contrato no nulo del ContextoMutacion.
    this.capaClima =
      crearCapaClima(this, perillas.clima) ?? this.crearEmisorVacio();

    const spritesTintables: Phaser.GameObjects.Sprite[] = [
      this.mira,
      ...this.objetivos.map((o) => o.sprite),
    ];

    this.sistemaMutacion.aplicar(this, perillas, {
      spritesTintables,
      capaClima: this.capaClima,
      spawnerEnemigos: this.crearSpawnerAdaptador(),
      audio: this.gestorAudio,
      overlayTexto: this.overlayTexto,
    });
  }

  /**
   * Construye la Telemetria_Rasgos al terminar (Requirements 3.7, 9.1).
   *
   * - `furia`: señal = objetivos destruidos, oportunidad = objetivos aparecidos.
   * - `logro`: señal = impactos, oportunidad = disparos (precisión).
   * - `riesgo`: señal = impactos rápidos, oportunidad = impactos totales.
   * - `curiosidad`: 0/0 (no medido → el Motor_Scoring lo excluye).
   */
  construirTelemetria(): TelemetriaRasgos {
    return {
      escena: 'shooter',
      porRasgo: {
        furia: { senal: this.objetivosDestruidos, oportunidad: this.totalObjetivos },
        logro: { senal: this.impactos, oportunidad: this.disparos },
        riesgo: { senal: this.impactosRapidos, oportunidad: this.impactos },
        curiosidad: { senal: 0, oportunidad: 0 },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Lógica interna
  // ---------------------------------------------------------------------------

  /** Reinicia contadores y colecciones para una sesión limpia. */
  private reiniciarEstado(): void {
    this.terminado = false;
    this.esperandoInicio = true;
    this.objetivos = [];
    this.totalObjetivos = 0;
    this.objetivosDestruidos = 0;
    this.disparos = 0;
    this.impactos = 0;
    this.impactosRapidos = 0;
    this.bombasImpactadas = 0;
  }

  /**
   * Mueve la mira según la dirección del input, acotándola a los límites de la
   * pantalla (Requirement 3.2).
   */
  private moverMira(deltaMs: number): void {
    if (!this.mira || !this.inputUnificado) return;

    const dir = this.inputUnificado.direccion();
    const paso = (VELOCIDAD_MIRA * deltaMs) / 1000;
    const { width, height } = this.scale;

    const nuevoX = Phaser.Math.Clamp(this.mira.x + dir.x * paso, 0, width);
    const nuevoY = Phaser.Math.Clamp(this.mira.y + dir.y * paso, 0, height);
    this.mira.setPosition(nuevoX, nuevoY);
  }

  /**
   * Si se presionó la acción primaria este frame, genera un disparo en la
   * posición de la mira y resuelve el impacto (Requirements 3.3, 3.4).
   */
  private procesarDisparo(): void {
    if (!this.mira || !this.inputUnificado) return;
    if (!this.inputUnificado.accionPrimariaJustPressed()) return;

    this.disparos += 1;
    sfxShoot();
    this.mostrarDestelloDisparo(this.mira.x, this.mira.y);
    this.resolverImpacto(this.mira.x, this.mira.y);
  }

  /**
   * Resuelve el impacto de un disparo en `(x, y)`: si toca un objetivo, registra
   * el impacto y lo remueve de la escena (Requirement 3.4).
   *
   * Solo se destruye un objetivo por disparo (el primero alcanzado).
   */
  private resolverImpacto(x: number, y: number): void {
    for (let i = 0; i < this.objetivos.length; i += 1) {
      const objetivo = this.objetivos[i];
      if (!objetivo) continue;

      const bounds = objetivo.sprite.getBounds();
      if (!bounds.contains(x, y)) continue;

      if (objetivo.esBomba) {
        // Penalización: flash rojo + shake fuerte + pierde impactos.
        this.cameras.main.shake(200, 0.012);
        this.cameras.main.flash(250, 255, 0, 0, false);
        this.impactos = Math.max(0, this.impactos - 2);
        this.bombasImpactadas += 1;
        this.removerObjetivo(i);
        return;
      }

      // Impacto confirmado (Requirement 3.4).
      this.impactos += 1;
      this.objetivosDestruidos += 1;
      sfxHit();

      // Quick-draw: destruido apenas apareció → señal de riesgo.
      const vida = this.time.now - objetivo.aparicionMs;
      if (vida <= VENTANA_QUICKDRAW_MS) {
        this.impactosRapidos += 1;
      }

      this.removerObjetivo(i);
      return;
    }
  }

  /**
   * Desplaza los objetivos activos horizontalmente (galería fija). Los que salen
   * de pantalla se retiran sin contar como impacto (objetivo "fallado").
   */
  private moverObjetivos(deltaMs: number): void {
    const { width } = this.scale;
    const paso = deltaMs / 1000;

    for (let i = this.objetivos.length - 1; i >= 0; i -= 1) {
      const objetivo = this.objetivos[i];
      if (!objetivo) continue;

      const nuevoX = objetivo.sprite.x + objetivo.velocidadX * paso;
      objetivo.sprite.setX(nuevoX);

      const fuera =
        nuevoX < -LADO_OBJETIVO || nuevoX > width + LADO_OBJETIVO;
      if (fuera) {
        this.removerObjetivo(i);
      }
    }
  }

  /** Retira el objetivo en el índice indicado, muestra explosión y destruye sprite. */
  private removerObjetivo(indice: number): void {
    const objetivo = this.objetivos[indice];
    if (!objetivo) return;

    // Explosión de partículas en la posición del enemigo.
    const ex = objetivo.sprite.x;
    const ey = objetivo.sprite.y;
    this.mostrarExplosion(ex, ey);

    objetivo.sprite.destroy();
    this.objetivos.splice(indice, 1);
  }

  /** Explosión visual exagerada al destruir un enemigo. */
  private mostrarExplosion(x: number, y: number): void {
    const keyPart = asegurarTexturaParticula(this);

    // Burst principal — muchas partículas rápidas.
    const emitter1 = this.add.particles(x, y, keyPart, {
      speed: { min: 100, max: 300 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xff4444, 0xff8800, 0xffff00],
      lifespan: 500,
      quantity: 16,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter1.setDepth(PROFUNDIDAD_DISPARO);
    emitter1.explode(16);
    this.time.delayedCall(600, () => emitter1.destroy());

    // Segundo burst — chispas blancas más lentas.
    const emitter2 = this.add.particles(x, y, keyPart, {
      speed: { min: 30, max: 80 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffffff, 0xffccaa],
      lifespan: 700,
      quantity: 8,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter2.setDepth(PROFUNDIDAD_DISPARO);
    emitter2.explode(8);
    this.time.delayedCall(800, () => emitter2.destroy());

    // Screen shake leve.
    this.cameras.main.shake(80, 0.005);
  }

  /**
   * Programa la aparición periódica de objetivos. El intervalo se acorta con la
   * intensidad (más densidad → aparición más frecuente, Requirement 7.2) y
   * también se acorta con el tiempo transcurrido (más presión conforme avanza).
   */
  private programarSpawn(): void {
    this.timerSpawn?.remove(false);
    // Intensidad alta → intervalo más corto (mínimo 250 ms).
    const factor = 1 - Phaser.Math.Clamp(this.intensidad, 0, 1) * 0.7;
    // Factor temporal: el intervalo se reduce progresivamente según el tiempo transcurrido.
    const tiempoTranscurrido = this.timerFin
      ? this.duracionMs - this.timerFin.getRemaining()
      : 0;
    const factorTemporal = 1 + tiempoTranscurrido / this.duracionMs; // 1 al inicio, ~2 al final
    const intervalo = Math.max(250, (INTERVALO_SPAWN_BASE_MS * factor) / factorTemporal);

    this.timerSpawn = this.time.addEvent({
      delay: intervalo,
      loop: false,
      callback: () => {
        this.aparecerObjetivo();
        // Re-programa con un intervalo potencialmente más corto.
        if (!this.terminado) this.programarSpawn();
      },
    });
  }

  /**
   * Hace aparecer un objetivo en un borde lateral con una altura aleatoria; su
   * velocidad crece con la agresividad (Requirement 7.3). Respeta un máximo de
   * objetivos simultáneos que crece con la intensidad (Requirement 7.2).
   */
  private aparecerObjetivo(): void {
    if (this.terminado) return;

    const maxSimultaneos =
      MAX_OBJETIVOS_BASE + Math.round(Phaser.Math.Clamp(this.intensidad, 0, 1) * 5);
    if (this.objetivos.length >= maxSimultaneos) return;

    const { width, height } = this.scale;
    const desdeIzquierda = Math.random() < 0.5;
    const x = desdeIzquierda ? -LADO_OBJETIVO / 2 : width + LADO_OBJETIVO / 2;
    const y = Phaser.Math.Between(LADO_OBJETIVO + 50, height - LADO_OBJETIVO);

    const velocidad =
      VELOCIDAD_OBJETIVO_BASE *
      (1 + Phaser.Math.Clamp(this.agresividad, 0, 1) * 2) *
      (desdeIzquierda ? 1 : -1);

    // 15% de chance de ser bomba (dinamita).
    const esBomba = Math.random() < 0.15;

    let sprite: Phaser.GameObjects.Sprite;

    // Usar aliens animados si se cargaron.
    const alienKeys = ['alien_1', 'alien_2', 'alien_3', 'alien_4'];
    const cargados = alienKeys.filter(k => this.textures.exists(k));

    if (cargados.length > 0 && !esBomba) {
      const key = cargados[Phaser.Math.Between(0, cargados.length - 1)] as string;
      const animKey = `${key}_anim`;
      if (!this.anims.exists(animKey)) {
        const totalFrames = this.textures.get(key).frameTotal - 1;
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: Math.max(0, totalFrames - 1) }),
          frameRate: 8,
          repeat: -1,
        });
      }
      sprite = this.add
        .sprite(x, y, key)
        .setDisplaySize(LADO_OBJETIVO + 8, LADO_OBJETIVO + 8)
        .setDepth(PROFUNDIDAD_OBJETIVO);
      sprite.play(animKey);
    } else {
      // Bomba o fallback.
      if (esBomba && this.textures.exists('dinamita')) {
        // Crear animación de dinamita si no existe.
        if (!this.anims.exists('dinamita_anim')) {
          this.anims.create({
            key: 'dinamita_anim',
            frames: this.anims.generateFrameNumbers('dinamita', { start: 0, end: 8 }),
            frameRate: 10,
            repeat: -1,
          });
        }
        sprite = this.add
          .sprite(x, y, 'dinamita')
          .setDisplaySize(LADO_OBJETIVO + 16, LADO_OBJETIVO + 16)
          .setDepth(PROFUNDIDAD_OBJETIVO);
        sprite.play('dinamita_anim');
      } else {
        sprite = this.add
          .sprite(x, y, KEY_TEX_OBJETIVO)
          .setDepth(PROFUNDIDAD_OBJETIVO);
        if (esBomba) {
          sprite.setTint(0xff2222);
          sprite.setDisplaySize(LADO_OBJETIVO - 6, LADO_OBJETIVO - 6);
        }
      }
      if (esBomba) {
        // Pulso para que se note que es peligrosa.
        this.tweens.add({
          targets: sprite,
          alpha: { from: 1, to: 0.5 },
          duration: 200,
          yoyo: true,
          repeat: -1,
        });
      }
    }

    // Flip si viene de la derecha.
    if (!desdeIzquierda) sprite.setFlipX(true);

    this.objetivos.push({
      sprite,
      velocidadX: velocidad,
      aparicionMs: this.time.now,
      esBomba,
    });
    this.totalObjetivos += 1;
  }

  /** Muestra un destello de disparo + efecto de retroceso en la mira. */
  private mostrarDestelloDisparo(x: number, y: number): void {
    // Destello principal.
    const destello = this.add
      .circle(x, y, 8, 0xfff27a)
      .setDepth(PROFUNDIDAD_DISPARO)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: destello,
      alpha: 0,
      scale: 2.5,
      duration: 180,
      onComplete: () => destello.destroy(),
    });

    // Anillo de onda expansiva.
    const anillo = this.add
      .circle(x, y, 4, 0xffffff, 0)
      .setStrokeStyle(2, 0xfff27a, 0.8)
      .setDepth(PROFUNDIDAD_DISPARO)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: anillo,
      scale: 3,
      alpha: 0,
      duration: 250,
      onComplete: () => anillo.destroy(),
    });
  }

  /**
   * Finaliza la sesión (Requirement 3.5): detiene temporizadores, construye la
   * telemetría, la reporta al Shell y solicita el retorno al Nivel_Plataformas.
   * Degrada con gracia si el Shell no está cableado (Task 11).
   */
  private finalizar(): void {
    if (this.terminado) return;
    this.terminado = true;

    this.timerSpawn?.remove(false);
    this.timerFin?.remove(false);

    this.mostrarResultadosYSalir();
  }

  /**
   * Shows a results overlay on top of the frozen game state for 3 seconds,
   * then reports telemetry and transitions back to plataformas.
   */
  private mostrarResultadosYSalir(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    // Semi-transparent dark overlay
    const bg = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.7);
    bg.setScrollFactor(0).setDepth(100);

    const telemetria = this.construirTelemetria();
    const rasgos = telemetria.porRasgo;

    this.add.text(w / 2, h * 0.3, `NIVEL SHOOTER\nCOMPLETADO!`, {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#ffd700',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

    const lines = [
      `FURIA: ${rasgos.furia.senal}/${rasgos.furia.oportunidad}`,
      `CURIOSIDAD: ${rasgos.curiosidad.senal}/${rasgos.curiosidad.oportunidad}`,
      `LOGRO: ${rasgos.logro.senal}/${rasgos.logro.oportunidad}`,
      `RIESGO: ${rasgos.riesgo.senal}/${rasgos.riesgo.oportunidad}`,
    ].join('\n');

    this.add.text(w / 2, h * 0.55, lines, {
      fontFamily: '"Press Start 2P"',
      fontSize: '9px',
      color: '#ffffff',
      align: 'center',
      lineSpacing: 8,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

    // Wait 3 seconds then transition
    this.time.delayedCall(3000, () => {
      if (this.shell) {
        this.shell.reportarTelemetria(telemetria);
        this.shell.solicitarTransicion('plataformas');
      } else {
        // eslint-disable-next-line no-console
        console.info('[NivelShooter] sesión finalizada; retorno a "plataformas" (Shell no cableado).', telemetria);
      }
    });
  }

  /**
   * Crea un adaptador {@link SpawnerEnemigos} que traduce las perillas de
   * densidad y comportamiento a los parámetros de spawn de la galería
   * (Requirements 7.2, 7.3).
   */
  private crearSpawnerAdaptador(): SpawnerEnemigos {
    return {
      // intensidad_enemigos → densidad de objetivos (frecuencia y máximo).
      ajustarIntensidad: (intensidad: number) => {
        this.intensidad = Phaser.Math.Clamp(intensidad, 0, 1);
        // Reprograma el spawn solo si la escena ya arrancó su timer.
        if (this.timerSpawn) this.programarSpawn();
      },
      // agresividad → velocidad de los objetivos.
      ajustarAgresividad: (agresividad: number) => {
        this.agresividad = Phaser.Math.Clamp(agresividad, 0, 1);
      },
    };
  }

  /**
   * Crea un emisor de partículas vacío y detenido, usado como capa de clima
   * cuando la perilla es `'ninguno'` (satisface el contrato no nulo del
   * ContextoMutacion sin emitir partículas).
   */
  private crearEmisorVacio(): Phaser.GameObjects.Particles.ParticleEmitter {
    const key = asegurarTexturaParticula(this);
    const emisor = this.add.particles(0, 0, key, {
      lifespan: 1,
      quantity: 0,
      frequency: -1,
    });
    emisor.stop();
    return emisor;
  }

  /** Genera la textura placeholder del objetivo (cuadrado con borde). */
  private generarTexturaObjetivo(): void {
    if (this.textures.exists(KEY_TEX_OBJETIVO)) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, LADO_OBJETIVO, LADO_OBJETIVO);
    g.lineStyle(3, 0x222233, 1);
    g.strokeRect(0, 0, LADO_OBJETIVO, LADO_OBJETIVO);
    g.generateTexture(KEY_TEX_OBJETIVO, LADO_OBJETIVO, LADO_OBJETIVO);
    g.destroy();
  }

  /** Genera la textura placeholder de la mira (cruz + anillo). */
  private generarTexturaMira(): void {
    if (this.textures.exists(KEY_TEX_MIRA)) return;
    const size = 40;
    const c = size / 2;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // Anillo exterior brillante blanco/cyan.
    g.lineStyle(3, 0x00ffff, 1);
    g.strokeCircle(c, c, c - 4);

    // Cruz gruesa con gap central.
    g.lineStyle(2, 0xffffff, 1);
    // Arriba
    g.lineBetween(c, 2, c, c - 10);
    // Abajo
    g.lineBetween(c, c + 10, c, size - 2);
    // Izquierda
    g.lineBetween(2, c, c - 10, c);
    // Derecha
    g.lineBetween(c + 10, c, size - 2, c);

    // Punto central brillante.
    g.fillStyle(0x00ffff, 1);
    g.fillCircle(c, c, 3);

    g.generateTexture(KEY_TEX_MIRA, size, size);
    g.destroy();
  }
}
