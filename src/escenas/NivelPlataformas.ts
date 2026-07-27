/**
 * Nivel_Plataformas — Escena principal de plataformas (Requirement 1).
 *
 * Nivel de arranque del juego (Requirement 1.1): correr y saltar
 * (Requirements 1.2, 1.3), recolectar monedas (Requirement 1.4), enemigos
 * hostiles que aplican daño (Requirement 1.5), y al menos dos accesos ocultos en
 * zonas secretas que solicitan una transición al Shell (Requirements 1.6, 1.7).
 * Al terminar emite su `Telemetria_Rasgos` (Requirements 1.8, 9.1).
 *
 * Cumple el contrato {@link IEscena} (Requirement 9) además de extender
 * `Phaser.Scene`: `init` recibe los datos del Shell, `declararRasgos` publica los
 * topes de oportunidad, `aplicarPerillas` transforma el mundo vía el
 * {@link SistemaMutacion} (Requirement 9.4) y `construirTelemetria` produce la
 * telemetría final.
 *
 * FASE 1 — "programmer art": todas las texturas se generan en runtime como
 * rectángulos de colores (`Graphics.generateTexture`); no se cargan assets de
 * arte reales todavía. El objetivo es una rebanada vertical jugable.
 *
 * Ejecutable de forma autónoma: si el Shell no fue inyectado (p. ej. al probar la
 * escena aislada antes de cablear el SceneManager en la tarea 11), las
 * solicitudes de transición degradan a un log en consola en vez de fallar.
 *
 * @module escenas/NivelPlataformas
 * @see Requirements 1.1–1.8, 9.1, 9.4
 */

import Phaser from 'phaser';
import type {
  DatosInicioEscena,
  DeclaracionRasgos,
  EscenaId,
  IEscena,
  IShell,
  InputUnificado,
  PerillasMutacion,
  SpawnerEnemigos,
  TelemetriaRasgos,
  GestorAudio,
} from '../contrato';
import { InputTeclado } from '../input';
import {
  SistemaMutacion,
  OverlayTextoPhaser,
  crearCapaClima,
  asegurarTexturaParticula,
} from '../mutacion';
import { mostrarPanelIA } from '../mutacion/panelIA';
import { sfxCoin, sfxCrystal, sfxJump, sfxPortal, sfxHit } from '../audio/sfx';
import { crearGestorAudio } from '../audio/gestorAudioHibrido';
import { CLAVE_PERSONAJE, PERSONAJES, type IdPersonaje } from './EscenaSeleccion';

/** Id lógico de esta escena dentro del Contrato_Compartido. */
const ID_ESCENA: EscenaId = 'plataformas';

/** Keys de las texturas placeholder generadas en runtime (Fase 1). */
const TX = {
  jugador: 'plat_jugador',
  suelo: 'plat_suelo',
  moneda: 'plat_moneda',
  enemigo: 'plat_enemigo',
  exploracion: 'plat_exploracion',
} as const;

/** Dimensiones del mundo (más ancho que la cámara para habilitar exploración). */
const ANCHO_MUNDO = 7300;
const ALTO_MUNDO = 540;

/** Parámetros de movimiento del jugador (Requirements 1.2, 1.3). */
const VELOCIDAD_JUGADOR = 220;
const IMPULSO_SALTO = 520;
const REBOTE_PISOTON = 320;

/** Parámetros de enemigos (Requirement 1.5). */
const VELOCIDAD_ENEMIGO_BASE = 60;
const VIDAS_INICIALES = 3;
const INVULNERABILIDAD_MS = 1200;
const RETROCESO_DANIO = 260;

/** Parámetros de medición de riesgo (rasgo `riesgo`). */
const RADIO_RIESGO = 96;
const COOLDOWN_RIESGO_MS = 900;
const MAX_RIESGO = 6;

/** Colores placeholder por elemento (programmer art). */
const COLOR = {
  jugador: 0x4dd2ff,
  suelo: 0x3a2f4a,
  moneda: 0xffd24a,
  enemigo: 0xff4d6d,
  exploracion: 0x8affc1,
  acceso: 0x2a2f45,
} as const;

/** Descriptor de layout de una plataforma estática. */
interface RectPlataforma {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Descriptor de un acceso oculto a otra escena (Requirements 1.6, 1.7). */
interface AccesoOculto {
  objeto: Phaser.GameObjects.Rectangle;
  destino: EscenaId;
  activado: boolean;
}

// --- Layout del nivel (Fase 1) --------------------------------------------

/** Plataformas y suelo. La primera es el suelo continuo. */
const PLATAFORMAS: readonly RectPlataforma[] = [
  { x: ANCHO_MUNDO / 2, y: ALTO_MUNDO - 16, ancho: ANCHO_MUNDO, alto: 32 },
  // --- Zona inicial ---
  { x: 400, y: 400, ancho: 180, alto: 24 },
  { x: 800, y: 350, ancho: 160, alto: 24 },
  { x: 1200, y: 400, ancho: 200, alto: 24 },
  // --- Escalera al portal ritmo (2 escalones + cornisa) ---
  { x: 1800, y: 400, ancho: 170, alto: 24 },
  { x: 2100, y: 280, ancho: 160, alto: 24 },
  { x: 2400, y: 160, ancho: 160, alto: 24 }, // cornisa portal ritmo
  // --- Zona media ---
  { x: 2900, y: 400, ancho: 180, alto: 24 },
  { x: 3300, y: 360, ancho: 160, alto: 24 },
  { x: 3700, y: 400, ancho: 180, alto: 24 },
  // --- Escalera al portal shooter (2 escalones + cornisa) ---
  { x: 4100, y: 400, ancho: 160, alto: 24 },
  { x: 4250, y: 280, ancho: 150, alto: 24 },
  { x: 4400, y: 160, ancho: 160, alto: 24 }, // cornisa portal shooter
  // --- Zona final ---
  { x: 4900, y: 410, ancho: 180, alto: 24 },
  { x: 5300, y: 370, ancho: 160, alto: 24 },
  { x: 5700, y: 400, ancho: 170, alto: 24 },
  // --- Escalera al portal carreras (2 escalones + cornisa) ---
  { x: 6100, y: 400, ancho: 160, alto: 24 },
  { x: 6250, y: 280, ancho: 150, alto: 24 },
  { x: 6400, y: 160, ancho: 160, alto: 24 }, // cornisa portal carreras
  // --- Después del último portal ---
  { x: 6650, y: 400, ancho: 170, alto: 24 },
  { x: 6850, y: 340, ancho: 150, alto: 24 },
];

/** Monedas coleccionables (rasgo `logro`, Requirement 1.4). */
const MONEDAS: readonly { x: number; y: number }[] = [
  { x: 400, y: 370 },    // sobre plataforma y:400
  { x: 800, y: 320 },    // sobre plataforma y:350
  { x: 1200, y: 370 },   // sobre plataforma y:400
  { x: 1800, y: 370 },   // sobre escalón y:400
  { x: 2100, y: 250 },   // sobre escalón y:280
  { x: 2900, y: 370 },   // sobre plataforma y:400
  { x: 3300, y: 330 },   // sobre plataforma y:360
  { x: 3700, y: 370 },   // sobre plataforma y:400
  { x: 4100, y: 370 },   // sobre escalón y:400
  { x: 4900, y: 380 },   // sobre plataforma y:410
  { x: 5300, y: 340 },   // sobre plataforma y:370
  { x: 5700, y: 370 },   // sobre plataforma y:400
  { x: 6100, y: 370 },   // sobre escalón y:400
  { x: 6650, y: 370 },   // sobre plataforma y:400
];

/** Enemigos hostiles (rasgo `furia` al derrotarlos, Requirement 1.5). */
const ENEMIGOS: readonly { x: number; y: number }[] = [
  { x: 800, y: 480 },
  { x: 1500, y: 480 },
  { x: 2200, y: 480 },
  { x: 3200, y: 480 },
  { x: 4200, y: 480 },
  { x: 5200, y: 480 },
  { x: 6200, y: 480 },
];

/** Puntos de exploración ocultos/apartados (rasgo `curiosidad`). */
const PUNTOS_EXPLORACION: readonly { x: number; y: number }[] = [
  { x: 550, y: 450 },
  { x: 1450, y: 450 },
  { x: 3000, y: 450 },
  { x: 4700, y: 450 },
  { x: 5500, y: 450 },
  { x: 6750, y: 450 },
];

/** Corazones de vida repartidos por el nivel (accesibles, sobre plataformas). */
const CORAZONES: readonly { x: number; y: number }[] = [
  { x: 1100, y: 440 },
  { x: 2800, y: 440 },
  { x: 4400, y: 440 },
  { x: 6000, y: 440 },
];

/**
 * Accesos ocultos: al menos dos, en zonas secretas, que solicitan transición al
 * Shell (Requirements 1.6, 1.7). Uno lleva al Nivel_Ritmo y otro al Nivel_Shooter.
 */
const ACCESOS: readonly {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  destino: EscenaId;
}[] = [
  // Sobre la cornisa del portal de ritmo (plataforma en x:2400, y:160)
  { x: 2400, y: 130, ancho: 48, alto: 56, destino: 'ritmo' },
  // Sobre la cornisa del portal de shooter (plataforma en x:4400, y:160)
  { x: 4400, y: 130, ancho: 48, alto: 56, destino: 'shooter' },
  // Sobre la cornisa del portal de carreras (plataforma en x:6400, y:160)
  { x: 6400, y: 130, ancho: 48, alto: 56, destino: 'carreras' },
];

/**
 * Escena de plataformas que implementa el Contrato_Compartido (Requirement 9).
 */
export class NivelPlataformas extends Phaser.Scene implements IEscena {
  /** Id lógico de la escena (Contrato_Compartido). */
  readonly id: EscenaId = ID_ESCENA;

  // --- Dependencias inyectadas por el Shell (Requirement 8.4) ---
  private shell: IShell | null = null;
  private entrada: InputUnificado | null = null;
  private perillas: PerillasMutacion | null = null;

  // --- Sistema de mutación y colaboradores concretos (Requirement 9.4) ---
  private readonly sistemaMutacion = new SistemaMutacion();
  private audio: GestorAudio | null = null;
  private overlay: OverlayTextoPhaser | null = null;

  // --- Objetos del mundo ---
  private jugador!: Phaser.Physics.Arcade.Sprite;
  private jugadorUsaPlaceholder: boolean = true;
  private plataformas!: Phaser.Physics.Arcade.StaticGroup;
  private monedas!: Phaser.Physics.Arcade.Group;
  private exploracionGrupo!: Phaser.Physics.Arcade.Group;
  private corazonesGrupo!: Phaser.Physics.Arcade.Group;
  private readonly enemigos: Phaser.Physics.Arcade.Sprite[] = [];
  private readonly accesos: AccesoOculto[] = [];

  // --- Estado de juego ---
  private vidas = VIDAS_INICIALES;
  private invulnerableHasta = 0;
  private cooldownRiesgo = 0;
  private spawnX = 80;
  private spawnY = 440;
  private posicionAnteDePortal: { x: number; y: number } | null = null;
  /** Factor de agresividad aplicado a la velocidad de enemigos (Requirement 7.3). */
  private factorAgresividad = 1;
  /** Bloquea el input durante el overlay de instrucciones. */
  private entradaBloqueada = false;

  // --- Progress bar (Feature 1) ---
  private barraProgresoFill!: Phaser.GameObjects.Rectangle;

  // --- Backgrounds (para tintar con paleta) ---
  private bgLayer0!: Phaser.GameObjects.TileSprite;
  private bgLayer1!: Phaser.GameObjects.TileSprite;



  // --- Acumuladores de señal por rasgo (Requirement 9.1) ---
  private senalFuria = 0;
  private senalCuriosidad = 0;
  private senalLogro = 0;
  private senalRiesgo = 0;

  // --- Topes de oportunidad que ofrece la escena (Requirement 4.2) ---
  private readonly oportunidadFuria = ENEMIGOS.length;
  private readonly oportunidadLogro = MONEDAS.length;
  private readonly oportunidadCuriosidad = ACCESOS.length + PUNTOS_EXPLORACION.length;
  private readonly oportunidadRiesgo = MAX_RIESGO;

  constructor() {
    super({ key: ID_ESCENA });
  }

  // =========================================================================
  // Ciclo de vida — Contrato_Compartido + Phaser
  // =========================================================================

  /**
   * Recibe las dependencias resueltas por el Shell antes de `create()`
   * (Requirement 8.4). Es tolerante a `undefined` para permitir arrancar la
   * escena de forma autónoma (sin Shell) durante el desarrollo.
   */
  init(datos?: DatosInicioEscena): void {
    if (datos) {
      this.shell = datos.shell ?? null;
      this.perillas = datos.perillas ?? null;
      if (datos.input) this.setInput(datos.input);
    }



    // Reinicia el estado por si la escena se reutiliza entre reinicios.
    this.vidas = VIDAS_INICIALES;
    this.invulnerableHasta = 0;
    this.cooldownRiesgo = 0;
    this.factorAgresividad = 1;
    this.entradaBloqueada = false;
    this.senalFuria = 0;
    this.senalCuriosidad = 0;
    this.senalLogro = 0;
    this.senalRiesgo = 0;
    this.enemigos.length = 0;
    this.accesos.length = 0;
  }

  /** Inyecta el input unificado (Requirements 9.5, 9.6). */
  setInput(input: InputUnificado): void {
    this.entrada = input;
  }

  /**
   * Precarga de assets reales.
   */
  preload(): void {
    // Background layers (parallax)
    this.load.image('bg_layer0', 'src/assets/plataformas/PNG/Background/Crystal_Caves_Forest_2D_Platformer_Tileset_Background - Layer 00.png');
    this.load.image('bg_layer1', 'src/assets/plataformas/PNG/Background/Crystal_Caves_Forest_2D_Platformer_Tileset_Background - Layer 01.png');
    // Plataformas: Ground 02 para suelo, Ground 10/11/12 para flotantes (bordes + centro)
    this.load.image('plat_ground', 'src/assets/plataformas/PNG/Platfromer/Crystal_Caves_Forest_2D_Platformer_Tileset_Platformer - Ground 02.png');
    this.load.image('plat_float_center', 'src/assets/plataformas/PNG/Platfromer/Crystal_Caves_Forest_2D_Platformer_Tileset_Platformer - Ground 11.png');
    this.load.image('plat_float_left', 'src/assets/plataformas/PNG/Platfromer/Crystal_Caves_Forest_2D_Platformer_Tileset_Platformer - Ground 10.png');
    this.load.image('plat_float_right', 'src/assets/plataformas/PNG/Platfromer/Crystal_Caves_Forest_2D_Platformer_Tileset_Platformer - Ground 12.png');
    // Moneda animada (spritesheet 16x16)
    this.load.spritesheet('coin_gold', 'src/assets/items/coinGold.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    // Collectible de exploración: Crystal
    this.load.image('star_collect', 'src/assets/plataformas/PNG/Collectable Object/Crystal_Caves_Forest_2D_Platformer_Tileset_Collectable Object - Crystal.png');
    // Enemigos: Flying Demon spritesheet (79x69 per frame, 4 frames flying)
    this.load.spritesheet('demon_fly', 'src/assets/Flying Demon 2D Pixel Art/Sprites/without_outline/FLYING.png', {
      frameWidth: 79,
      frameHeight: 69,
    });
    this.load.spritesheet('demon_death', 'src/assets/Flying Demon 2D Pixel Art/Sprites/without_outline/DEATH.png', {
      frameWidth: 79,
      frameHeight: 69,
    });
  }

  /**
   * Construye el mundo con texturas placeholder y aplica las perillas recibidas
   * (Requirement 9.4). No usa assets de arte reales (Fase 1).
   */
  create(): void {
    // Validación de personaje seleccionado (Requirements 4.3, 4.4).
    const idPersonaje = this.game.registry.get(CLAVE_PERSONAJE) as string | null;
    if (!idPersonaje || !['pink_monster', 'owlet_monster', 'dude_monster'].includes(idPersonaje)) {
      if (this.shell) {
        this.shell.solicitarTransicion('seleccion_personaje');
      } else {
        // eslint-disable-next-line no-console
        console.warn('[NivelPlataformas] Sin personaje seleccionado y sin Shell: no se puede redirigir.');
      }
      return;
    }

    this.generarTexturas();

    this.physics.world.setBounds(0, 0, ANCHO_MUNDO, ALTO_MUNDO);
    this.cameras.main.setBounds(0, 0, ANCHO_MUNDO, ALTO_MUNDO);
    this.cameras.main.setBackgroundColor('#12101c');

    // Background parallax (Layer 00 = fondo lejano, Layer 01 = cercano)
    this.bgLayer0 = this.add.tileSprite(0, 0, ANCHO_MUNDO, ALTO_MUNDO, 'bg_layer0');
    this.bgLayer0.setOrigin(0, 0);
    this.bgLayer0.setScrollFactor(0);
    this.bgLayer0.setDepth(-10);

    this.bgLayer1 = this.add.tileSprite(0, 0, ANCHO_MUNDO, ALTO_MUNDO, 'bg_layer1');
    this.bgLayer1.setOrigin(0, 0);
    this.bgLayer1.setScrollFactor(0.3);
    this.bgLayer1.setDepth(-9);

    this.crearPlataformas();
    this.crearJugador();

    // Restaurar posición del jugador si viene de un portal
    const posSaved = this.game.registry.get('plataformas_posicion') as { x: number; y: number } | null;
    if (posSaved) {
      this.jugador.setPosition(posSaved.x, posSaved.y);
      this.spawnX = posSaved.x;
      this.spawnY = posSaved.y;
      this.game.registry.remove('plataformas_posicion');
    }

    this.crearMonedas();
    this.crearEnemigos();
    this.crearPuntosExploracion();
    this.crearCorazones();
    this.crearAccesosOcultos();
    this.crearPuertaFinal();

    // Mark portals that have already been used (prevent re-entry)
    for (const acceso of this.accesos) {
      if (this.game.registry.get('portal_usado_' + acceso.destino)) {
        acceso.activado = true;
        // Visually indicate it's used (dim the portal)
        acceso.objeto.setAlpha(0.3);
      }
    }

    this.registrarColisiones();

    this.cameras.main.startFollow(this.jugador, true, 0.1, 0.1);

    // Crear input de teclado. El Shell inyecta un placeholder en init() que
    // se reemplaza aquí con el InputTeclado real de la escena.
    this.entrada = InputTeclado.desdeEscena(this);

    // Colaboradores de mutación armados con las referencias propias de la escena.
    this.audio = crearGestorAudio(this);
    this.overlay = new OverlayTextoPhaser(this);

    // Siempre arrancar con música calma al entrar a plataformas (Decisión 4).
    this.audio.reproducirMood('calma');

    // Aplica las perillas (remotas o fallback) sobre el mundo ya construido.
    if (this.perillas) {
      this.aplicarPerillas(this.perillas);
    }

    // ─── HUD: conteo de monedas y cristales ──────────────────────────────
    const hudStyle = { fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 };
    // Moneda sprite + texto
    this.add.sprite(24, 22, 'coin_gold').setScrollFactor(0).setDepth(100).setScale(1.5);
    this.add.text(42, 16, `0/${MONEDAS.length}`, hudStyle).setScrollFactor(0).setDepth(100).setName('hud_monedas');
    // Cristal sprite + texto
    this.add.sprite(24, 48, 'star_collect').setScrollFactor(0).setDepth(100).setScale(0.18);
    this.add.text(42, 42, `0/${PUNTOS_EXPLORACION.length}`, hudStyle).setScrollFactor(0).setDepth(100).setName('hud_cristales');
    // Vidas (corazones) — arriba a la derecha
    const camW = this.cameras.main.width;
    this.add.text(camW - 20, 16, '❤️'.repeat(this.vidas), {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#ff4444',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100).setName('hud_vidas');

    // ─── Feature 1: Progress bar ───────────────────────────────────────────
    const barWidth = 100;
    const barHeight = 8;
    const barX = camW / 2;
    const barY = 12;
    this.add.rectangle(barX, barY, barWidth, barHeight, 0x555555)
      .setScrollFactor(0)
      .setDepth(100)
      .setOrigin(0.5, 0.5);
    this.barraProgresoFill = this.add.rectangle(barX - barWidth / 2, barY, 0, barHeight, 0x44ff44)
      .setScrollFactor(0)
      .setDepth(100)
      .setOrigin(0, 0.5);

    // ─── Feature 2: Controls overlay (only first time entering plataformas) ─
    if (!this.game.registry.get('plataformas_instrucciones_mostradas')) {
      this.mostrarOverlayControles();
    }

    // ─── Feature 3: TAB → abrir resumen de perfil ─────────────────────────
    this.input.keyboard!.on('keydown-TAB', () => {
      this.scene.pause();
      this.scene.launch('resumen_perfil');
    });

  }

  /**
   * Bucle por frame. Lee el input unificado y traduce a movimiento/salto,
   * patrulla enemigos y mide el rasgo de riesgo por cercanía a enemigos vivos.
   */
  override update(_tiempo: number, deltaMs: number): void {
    if (!this.jugador || !this.jugador.body) return;
    if (this.entradaBloqueada) return;

    const input = this.entrada;
    if (!input) return;

    // El InputTeclado calcula just-pressed en update(); debe llamarse primero.
    if (input instanceof InputTeclado) {
      input.update();
    }

    // Feature 1: update progress bar based on player X position
    if (this.barraProgresoFill) {
      const progreso = Phaser.Math.Clamp(this.jugador.x / ANCHO_MUNDO, 0, 1);
      this.barraProgresoFill.width = progreso * 100;
    }

    this.actualizarJugador(input);
    this.actualizarEnemigos();
    this.actualizarRiesgo(deltaMs);
  }

  // =========================================================================
  // Contrato_Compartido: rasgos, perillas, telemetría
  // =========================================================================

  /**
   * Declara los topes de oportunidad por rasgo que ESTA escena ofrece
   * (Requirement 4.2). Los rasgos no medidos tendrían tope 0; aquí los cuatro
   * se miden (destruir, explorar, juntar, arriesgar).
   */
  declararRasgos(): DeclaracionRasgos {
    return {
      oportunidadMaxima: {
        furia: this.oportunidadFuria,
        curiosidad: this.oportunidadCuriosidad,
        logro: this.oportunidadLogro,
        riesgo: this.oportunidadRiesgo,
      },
    };
  }

  /**
   * Aplica las Perillas_Mutacion a la escena reutilizando sus propios sprites
   * (Requirements 7.x, 9.4). Arma un `ContextoMutacion` con las referencias
   * locales (sprites tintables, capa de clima, spawner de enemigos, audio y
   * overlay) y delega en el {@link SistemaMutacion}.
   */
  aplicarPerillas(perillas: PerillasMutacion): void {
    this.perillas = perillas;

    // Primera entrada a plataformas: sin mutación visual (limpio).
    // Solo aplicar tint/clima/panel cuando ya se jugó algo antes.
    const yaJugoAntes = this.game.registry.get('ya_jugo_escena') === true;
    this.game.registry.set('ya_jugo_escena', true);

    if (!yaJugoAntes) {
      // Primera vez: no aplicar nada visual, salir temprano
      return;
    }

    // Panel visual dramático para la demo (muestra qué decidió la IA)
    // Sin delay porque las instrucciones solo se muestran la primera vez
    mostrarPanelIA(this, perillas, 0);

    // Después de que el panel se cierre (4.2s), mostrar resumen de perfil automáticamente
    // si el jugador ya jugó al menos un sub-nivel (para que los jueces lo vean)
    const jugoPotal = ['ritmo', 'shooter', 'carreras'].some(
      (d) => this.game.registry.get('portal_usado_' + d)
    );
    if (jugoPotal) {
      this.time.delayedCall(4500, () => {
        this.scene.pause();
        this.scene.launch('resumen_perfil');
      });
    }

    // Mutación técnica (tint, clima, enemigos, audio, overlay)
    // Tintar fondos de parallax según paleta
    const tintsFondo: Record<string, number> = {
      infierno: 0xff4422,
      sueno: 0x8855ff,
      neon: 0x22ff88,
      hostil: 0xaacc33,
    };
    const tintBg = tintsFondo[perillas.paleta] ?? 0xffffff;
    if (this.bgLayer0) this.bgLayer0.setTint(tintBg);
    if (this.bgLayer1) this.bgLayer1.setTint(tintBg);

    const spritesTintables: Phaser.GameObjects.Sprite[] = [
      ...(this.jugadorUsaPlaceholder ? [this.jugador] : []),
      ...this.enemigos,
    ];

    const capaClima =
      crearCapaClima(this, perillas.clima) ?? this.crearEmisorClimaPlaceholder();

    const audio = this.audio ?? crearGestorAudio(this);
    const overlay = this.overlay ?? new OverlayTextoPhaser(this);

    this.sistemaMutacion.aplicar(this, perillas, {
      spritesTintables,
      capaClima,
      spawnerEnemigos: this.crearSpawnerEnemigos(),
      audio,
      overlayTexto: overlay,
    });
  }

  /**
   * Construye la telemetría final de la escena (Requirements 1.8, 9.1): por cada
   * rasgo, la señal acumulada y la oportunidad que la escena ofreció.
   */
  construirTelemetria(): TelemetriaRasgos {
    return {
      escena: ID_ESCENA,
      porRasgo: {
        furia: { senal: this.senalFuria, oportunidad: this.oportunidadFuria },
        curiosidad: {
          senal: this.senalCuriosidad,
          oportunidad: this.oportunidadCuriosidad,
        },
        logro: { senal: this.senalLogro, oportunidad: this.oportunidadLogro },
        riesgo: { senal: this.senalRiesgo, oportunidad: this.oportunidadRiesgo },
      },
    };
  }

  // =========================================================================
  // Construcción del mundo (programmer art)
  // =========================================================================

  /** Genera las texturas placeholder restantes en runtime (solo jugador y enemigos). */
  private generarTexturas(): void {
    this.generarRect(TX.jugador, 28, 36, COLOR.jugador);
    this.generarRect(TX.enemigo, 30, 28, COLOR.enemigo);
  }

  /** Crea una textura rectangular sólida si aún no existe. */
  private generarRect(key: string, ancho: number, alto: number, color: number): void {
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRect(0, 0, ancho, alto);
    g.generateTexture(key, ancho, alto);
    g.destroy();
  }

  /** Crea el suelo y las plataformas con tiles escalados del pack. */
  private crearPlataformas(): void {
    this.plataformas = this.physics.add.staticGroup();
    const tileSize = 32;

    PLATAFORMAS.forEach((p, index) => {
      if (index === 0) {
        // Suelo principal: repetir Ground 02
        const cantidadX = Math.ceil(p.ancho / tileSize);
        const cantidadY = Math.ceil(p.alto / tileSize);
        for (let tx = 0; tx < cantidadX; tx++) {
          for (let ty = 0; ty < cantidadY; ty++) {
            const posX = (p.x - p.ancho / 2) + tx * tileSize + tileSize / 2;
            const posY = (p.y - p.alto / 2) + ty * tileSize + tileSize / 2;
            const sprite = this.plataformas.create(posX, posY, 'plat_ground') as Phaser.Physics.Arcade.Sprite;
            sprite.setDisplaySize(tileSize, tileSize);
            sprite.refreshBody();
          }
        }
      } else {
        // Plataformas flotantes: borde izq + centro repetido + borde der
        const cantidadX = Math.max(3, Math.ceil(p.ancho / tileSize));
        const startX = p.x - (cantidadX * tileSize) / 2 + tileSize / 2;

        for (let tx = 0; tx < cantidadX; tx++) {
          const posX = startX + tx * tileSize;
          let textureKey: string;

          if (tx === 0) {
            textureKey = 'plat_float_left';
          } else if (tx === cantidadX - 1) {
            textureKey = 'plat_float_right';
          } else {
            textureKey = 'plat_float_center';
          }

          const sprite = this.plataformas.create(posX, p.y, textureKey) as Phaser.Physics.Arcade.Sprite;
          sprite.setDisplaySize(tileSize, tileSize);
          sprite.refreshBody();
        }
      }
    });
  }

  /** Crea el jugador con física de arcade (gravedad, colisión con bordes). */
  private crearJugador(): void {
    const idPersonaje = this.game.registry.get(CLAVE_PERSONAJE) as IdPersonaje | null;
    const datosPersonaje = PERSONAJES.find((p) => p.id === idPersonaje);

    if (datosPersonaje && this.textures.exists(datosPersonaje.spriteKey)) {
      // Usar el spritesheet del personaje seleccionado
      this.jugadorUsaPlaceholder = false;
      if (!this.anims.exists(datosPersonaje.animKey)) {
        this.anims.create({
          key: datosPersonaje.animKey,
          frames: this.anims.generateFrameNumbers(datosPersonaje.spriteKey, {
            start: 0,
            end: 3,
          }),
          frameRate: 6,
          repeat: -1,
        });
      }

      this.jugador = this.physics.add.sprite(this.spawnX, this.spawnY, datosPersonaje.spriteKey);
      this.jugador.setScale(2);
      this.jugador.play(datosPersonaje.animKey);
    } else {
      // Fallback: placeholder rectangle
      this.jugador = this.physics.add.sprite(this.spawnX, this.spawnY, TX.jugador);
    }

    this.jugador.setCollideWorldBounds(true);
    this.jugador.setBounce(0);
  }

  /** Crea el grupo de monedas animadas (Requirement 1.4). */
  private crearMonedas(): void {
    if (!this.anims.exists('coin_spin')) {
      const frames = this.anims.generateFrameNumbers('coin_gold', {
        start: 0,
        end: -1,
      });
      this.anims.create({
        key: 'coin_spin',
        frames,
        frameRate: 8,
        repeat: -1,
      });
    }

    this.monedas = this.physics.add.group({ allowGravity: false, immovable: true });
    const monedasRecolectadas = (this.game.registry.get('monedas_recolectadas') as number[]) ?? [];
    for (let i = 0; i < MONEDAS.length; i++) {
      if (monedasRecolectadas.includes(i)) {
        // Moneda ya recolectada: contar para señal y no crear sprite
        this.senalLogro = Math.min(this.senalLogro + 1, this.oportunidadLogro);
        continue;
      }
      const m = MONEDAS[i]!;
      const moneda = this.monedas.create(
        m.x,
        m.y,
        'coin_gold'
      ) as Phaser.Physics.Arcade.Sprite;
      moneda.setScale(2);
      moneda.play('coin_spin');
      moneda.setCircle(8);
      moneda.setData('idx', i);
    }
  }

  /** Crea el grupo de enemigos hostiles que patrullan (Requirement 1.5). */
  private crearEnemigos(): void {
    const tieneDemon = this.textures.exists('demon_fly');

    if (tieneDemon && !this.anims.exists('demon_fly_anim')) {
      this.anims.create({
        key: 'demon_fly_anim',
        frames: this.anims.generateFrameNumbers('demon_fly', { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1,
      });
    }
    if (tieneDemon && !this.anims.exists('demon_death_anim')) {
      this.anims.create({
        key: 'demon_death_anim',
        frames: this.anims.generateFrameNumbers('demon_death', { start: 0, end: 6 }),
        frameRate: 10,
        repeat: 0,
      });
    }

    for (const pos of ENEMIGOS) {
      const textura = tieneDemon ? 'demon_fly' : TX.enemigo;
      // Demons flotan un poco más arriba que el suelo
      const yPos = tieneDemon ? pos.y - 20 : pos.y;
      const enemigo = this.physics.add.sprite(pos.x, yPos, textura);
      enemigo.setScale(tieneDemon ? 0.8 : 1);
      enemigo.setData('spawnX', pos.x);
      enemigo.setData('velX', VELOCIDAD_ENEMIGO_BASE);
      enemigo.setData('isDemon', tieneDemon);
      // Sin gravedad ni colisión física — la patrulla y colisión se manejan manual
      enemigo.body!.allowGravity = false;
      (enemigo.body as Phaser.Physics.Arcade.Body).immovable = true;
      if (tieneDemon) enemigo.play('demon_fly_anim');
      this.enemigos.push(enemigo);
    }
  }

  /** Crea los puntos de exploración con estrellas (rasgo `curiosidad`). */
  private crearPuntosExploracion(): void {
    this.exploracionGrupo = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    const cristalesRecolectados = (this.game.registry.get('cristales_recolectados') as number[]) ?? [];
    for (let i = 0; i < PUNTOS_EXPLORACION.length; i++) {
      if (cristalesRecolectados.includes(i)) {
        this.senalCuriosidad = Math.min(this.senalCuriosidad + 1, this.oportunidadCuriosidad);
        continue;
      }
      const punto = PUNTOS_EXPLORACION[i]!;
      const estrella = this.exploracionGrupo.create(
        punto.x,
        punto.y,
        'star_collect'
      ) as Phaser.Physics.Arcade.Sprite;
      estrella.setScale(0.35);
      estrella.setData('idx', i);
    }
  }

  /** Crea corazones de vida repartidos por el nivel (recuperan 1 vida). */
  private crearCorazones(): void {
    this.corazonesGrupo = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    // Generar textura de corazón si no existe
    if (!this.textures.exists('heart_pickup')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xff4444, 1);
      // Forma de corazón simple (dos círculos + triángulo)
      g.fillCircle(5, 4, 4);
      g.fillCircle(11, 4, 4);
      g.fillTriangle(1, 6, 15, 6, 8, 14);
      g.generateTexture('heart_pickup', 16, 16);
      g.destroy();
    }

    for (const pos of CORAZONES) {
      const corazon = this.corazonesGrupo.create(pos.x, pos.y, 'heart_pickup') as Phaser.Physics.Arcade.Sprite;
      corazon.setScale(1.5);
      // Ocultar si tiene vidas completas
      if (this.vidas >= VIDAS_INICIALES) {
        corazon.setVisible(false);
        corazon.body!.enable = false;
      }
      // Animación de flotación suave
      this.tweens.add({
        targets: corazon,
        y: pos.y - 6,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /**
   * Crea la puerta de fin de nivel al final del mundo. Al tocarla, se muestra
   * la pantalla de "NIVEL COMPLETADO" con estadísticas.
   */
  private crearPuertaFinal(): void {
    // Centrado entre la última plataforma (x:6850) y el fin del mundo (7300)
    const puertaX = 7075;
    const puertaY = ALTO_MUNDO - 32 - 50; // sobre el suelo

    // Base/pedestal
    const pedestal = this.add.graphics();
    pedestal.fillStyle(0x222244, 1);
    pedestal.fillRect(puertaX - 40, puertaY + 30, 80, 14);
    pedestal.fillStyle(0x333366, 1);
    pedestal.fillRect(puertaX - 34, puertaY + 24, 68, 8);

    // Arco del portal — estilo piedra mágica con borde dorado
    const arco = this.add.graphics();
    // Fondo oscuro del portal (interior)
    arco.fillStyle(0x050510, 0.95);
    arco.beginPath();
    arco.moveTo(puertaX - 28, puertaY + 30);
    arco.lineTo(puertaX - 28, puertaY - 10);
    arco.arc(puertaX, puertaY - 10, 28, Math.PI, 0, false);
    arco.lineTo(puertaX + 28, puertaY + 30);
    arco.closePath();
    arco.fillPath();
    // Borde exterior dorado
    arco.lineStyle(3, 0xffd700, 1);
    arco.beginPath();
    arco.moveTo(puertaX - 30, puertaY + 30);
    arco.lineTo(puertaX - 30, puertaY - 10);
    arco.arc(puertaX, puertaY - 10, 30, Math.PI, 0, false);
    arco.lineTo(puertaX + 30, puertaY + 30);
    arco.strokePath();
    // Borde interior brillante
    arco.lineStyle(1.5, 0x7cf9ff, 0.6);
    arco.beginPath();
    arco.moveTo(puertaX - 24, puertaY + 28);
    arco.lineTo(puertaX - 24, puertaY - 8);
    arco.arc(puertaX, puertaY - 8, 24, Math.PI, 0, false);
    arco.lineTo(puertaX + 24, puertaY + 28);
    arco.strokePath();

    // Vórtice interior animado (anillos girando)
    for (let i = 0; i < 4; i++) {
      const radio = 6 + i * 5;
      const anillo = this.add.circle(puertaX, puertaY, radio, 0x000000, 0);
      anillo.setStrokeStyle(1.2, 0x7cf9ff, 0.5 - i * 0.1);
      this.tweens.add({
        targets: anillo,
        angle: i % 2 === 0 ? 360 : -360,
        duration: 2500 + i * 400,
        repeat: -1,
        ease: 'Linear',
      });
      this.tweens.add({
        targets: anillo,
        scaleX: { from: 0.8, to: 1.2 },
        scaleY: { from: 1.2, to: 0.8 },
        duration: 1200 + i * 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Texto "META" encima del arco
    this.add.text(puertaX, puertaY - 50, '🏁', {
      fontSize: '20px',
    }).setOrigin(0.5);

    // Partículas doradas alrededor del portal
    if (!this.textures.exists('_p_gold')) {
      const pg = this.make.graphics({ x: 0, y: 0 }, false);
      pg.fillStyle(0xffd700, 1);
      pg.fillCircle(2, 2, 2);
      pg.generateTexture('_p_gold', 4, 4);
      pg.destroy();
    }
    this.add.particles(puertaX, puertaY - 10, '_p_gold', {
      speed: { min: 15, max: 40 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 1500,
      frequency: 200,
      quantity: 2,
      angle: { min: 0, max: 360 },
      blendMode: 'ADD',
    });

    // Zona de colisión
    const zona = this.add.rectangle(puertaX, puertaY, 56, 70, 0x000000, 0);
    this.physics.add.existing(zona, true);

    // Overlap con el jugador
    this.physics.add.overlap(this.jugador, zona, () => {
      if (this.game.registry.get('nivel_completado')) return;
      this.game.registry.set('nivel_completado', true);
      this.mostrarNivelCompletado();
    });

    // Pulso de brillo en el arco
    this.tweens.add({
      targets: arco,
      alpha: { from: 0.85, to: 1 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * Pantalla de "NIVEL COMPLETADO" — muestra estadísticas y luego transiciona.
   */
  private mostrarNivelCompletado(): void {
    // Congelar al jugador
    this.jugador.setVelocity(0, 0);
    (this.jugador.body as Phaser.Physics.Arcade.Body).enable = false;

    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;

    // Overlay oscuro
    const overlay = this.add.rectangle(camW / 2, camH / 2, camW, camH, 0x000000, 0)
      .setScrollFactor(0).setDepth(400);
    this.tweens.add({ targets: overlay, fillAlpha: 0.85, duration: 500 });

    // Título
    const titulo = this.add.text(camW / 2, camH / 2 - 70, '🏆 NIVEL COMPLETADO 🏆', {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#ffd700',
      shadow: { offsetX: 0, offsetY: 0, color: '#ffd700', blur: 12, fill: true },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(401).setAlpha(0);

    // Estadísticas
    const monedasRecolectadas = ((this.game.registry.get('monedas_recolectadas') as number[]) ?? []).length;
    const cristalesRecolectados = ((this.game.registry.get('cristales_recolectados') as number[]) ?? []).length;
    const portalesUsados = ['ritmo', 'shooter', 'carreras'].filter(
      (d) => this.game.registry.get('portal_usado_' + d)
    ).length;

    const stats = this.add.text(camW / 2, camH / 2 - 15, [
      `🪙 Monedas: ${monedasRecolectadas}/${MONEDAS.length}`,
      `💎 Cristales: ${cristalesRecolectados}/${PUNTOS_EXPLORACION.length}`,
      `👾 Enemigos: ${this.senalFuria}/${ENEMIGOS.length}`,
      `🌀 Portales: ${portalesUsados}/3`,
    ].join('\n'), {
      fontFamily: '"Press Start 2P"',
      fontSize: '9px',
      color: '#ffffff',
      align: 'center',
      lineSpacing: 10,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(401).setAlpha(0);

    // Mensaje final
    const mensaje = this.add.text(camW / 2, camH / 2 + 70, '⚡ LA IA ANALIZÓ TU ESTILO Y MUTARÁ EL JUEGO ⚡', {
      fontFamily: '"Press Start 2P"',
      fontSize: '7px',
      color: '#7cf9ff',
      align: 'center',
      shadow: { offsetX: 0, offsetY: 0, color: '#7cf9ff', blur: 6, fill: true },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(401).setAlpha(0);

    // Animaciones de entrada
    this.tweens.add({ targets: titulo, alpha: 1, duration: 600, delay: 400 });
    this.tweens.add({ targets: stats, alpha: 1, duration: 600, delay: 800 });
    this.tweens.add({ targets: mensaje, alpha: 1, duration: 600, delay: 1400 });

    // Después de 4 segundos, reportar telemetría y volver a plataformas (mutado por IA)
    this.time.delayedCall(4000, () => {
      // Reportar telemetría al Shell para que la IA pueda mutar
      if (this.shell) {
        this.shell.reportarTelemetria(this.construirTelemetria());
        this.shell.solicitarTransicion('plataformas');
      }
    });
  }

  /**
   * Crea al menos dos accesos ocultos en zonas secretas (Requirements 1.6, 1.7).
   * Portales con arco, interior lleno de líneas circulares en movimiento,
   * y partículas afuera.
   */
  private crearAccesosOcultos(): void {
    for (const a of ACCESOS) {
      const cx = a.x;
      const cy = a.y;
      const w = a.ancho + 12;
      const h = a.alto + 12;

      // Dibujar arco (U invertida) con Graphics
      const arco = this.add.graphics();
      arco.setDepth(-1);
      arco.lineStyle(4, 0x8866cc, 1);
      arco.fillStyle(0x0a0020, 0.9);
      arco.beginPath();
      arco.moveTo(cx - w / 2, cy + h / 2);
      arco.lineTo(cx - w / 2, cy - h / 4);
      arco.arc(cx, cy - h / 4, w / 2, Math.PI, 0, false);
      arco.lineTo(cx + w / 2, cy + h / 2);
      arco.closePath();
      arco.fillPath();
      arco.strokePath();

      // Interior: muchas líneas/círculos en movimiento circular (efecto vortex)
      const numLineas = 6;
      for (let c = 0; c < numLineas; c++) {
        const radio = 4 + c * 3;
        const circulo = this.add.circle(cx, cy, radio, 0x000000, 0);
        circulo.setStrokeStyle(1.5, 0x7cf9ff, 0.6 - c * 0.08);
        circulo.setDepth(-1);

        // Cada anillo rota a diferente velocidad
        this.tweens.add({
          targets: circulo,
          angle: 360,
          duration: 2000 + c * 500,
          repeat: -1,
          ease: 'Linear',
        });

        // Pulso de escala para dar sensación de profundidad
        this.tweens.add({
          targets: circulo,
          scaleX: 0.7,
          scaleY: 1.3,
          duration: 1500 + c * 200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      // Partículas AFUERA del portal (alrededor del arco)
      this.add.particles(cx, cy - h / 4, '__WHITE', {
        speed: { min: 30, max: 60 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.8, end: 0 },
        lifespan: 1500,
        frequency: 250,
        quantity: 2,
        tint: [0x7cf9ff, 0xaa66ff, 0xff66aa],
        angle: { min: 180, max: 360 },
      }).setDepth(-1);

      this.add.particles(cx, cy + h / 3, '__WHITE', {
        speed: { min: 20, max: 40 },
        scale: { start: 0.4, end: 0 },
        alpha: { start: 0.6, end: 0 },
        lifespan: 1000,
        frequency: 400,
        quantity: 1,
        tint: [0x66ffaa, 0x7cf9ff],
        angle: { min: 0, max: 180 },
      }).setDepth(-1);

      // Zona de colisión invisible
      const objeto = this.add.rectangle(cx, cy, a.ancho, a.alto, 0x000000, 0);
      this.physics.add.existing(objeto, true);
      this.accesos.push({ objeto, destino: a.destino, activado: false });

      // Indicador visual: haz de luz que cae desde el portal para guiar al jugador
      const beam = this.add.rectangle(cx, cy + h / 2 + 80, 6, 160, 0x7cf9ff, 0.15);
      beam.setDepth(-2);
      this.tweens.add({
        targets: beam,
        alpha: { from: 0.08, to: 0.25 },
        scaleX: { from: 0.8, to: 1.5 },
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /** Registra colisiones y solapamientos entre los objetos del mundo. */
  private registrarColisiones(): void {
    this.physics.add.collider(this.jugador, this.plataformas);
    // Enemigos se manejan manualmente en actualizarEnemigos (sin grupo de física)

    this.physics.add.overlap(
      this.jugador,
      this.monedas,
      (_j, moneda) => this.recolectarMoneda(moneda),
      undefined,
      this
    );

    // Colisión jugador↔enemigo se maneja manualmente en actualizarEnemigos

    this.physics.add.overlap(
      this.jugador,
      this.exploracionGrupo,
      (_j, punto) => this.recolectarExploracion(punto),
      undefined,
      this
    );

    this.physics.add.overlap(
      this.jugador,
      this.corazonesGrupo,
      (_j, corazon) => this.recolectarCorazon(corazon),
      undefined,
      this
    );

    for (const acceso of this.accesos) {
      this.physics.add.overlap(
        this.jugador,
        acceso.objeto,
        () => this.activarAcceso(acceso),
        undefined,
        this
      );
    }
  }

  // =========================================================================
  // Gameplay: movimiento, monedas, enemigos, accesos, riesgo
  // =========================================================================

  /** Traduce el input unificado a movimiento horizontal y salto (Req 1.2, 1.3). */
  private actualizarJugador(input: InputUnificado): void {
    const cuerpo = this.jugador.body as Phaser.Physics.Arcade.Body;

    const dir = input.direccion();
    this.jugador.setVelocityX(dir.x * VELOCIDAD_JUGADOR);

    // Voltear el sprite según la dirección de movimiento
    if (dir.x < 0) {
      this.jugador.setFlipX(true);
    } else if (dir.x > 0) {
      this.jugador.setFlipX(false);
    }

    // Animación: solo reproducir cuando se mueve, pausar cuando está quieto
    if (!this.jugadorUsaPlaceholder) {
      if (dir.x !== 0) {
        this.jugador.anims.resume();
      } else {
        this.jugador.anims.pause();
      }
    }

    // Salto: sólo cuando el jugador está apoyado en el suelo/plataforma.
    if (input.accionPrimariaJustPressed() && cuerpo.blocked.down) {
      this.jugador.setVelocityY(-IMPULSO_SALTO);
      sfxJump();
    }
  }

  /** Recolecta una moneda: la remueve y suma al rasgo `logro` (Requirement 1.4). */
  private recolectarMoneda(
    moneda: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ): void {
    const sprite = moneda as Phaser.Physics.Arcade.Sprite;
    if (!sprite.active) return;
    sprite.disableBody(true, true);
    this.senalLogro = Math.min(this.senalLogro + 1, this.oportunidadLogro);
    sfxCoin();
    // Persistir moneda recolectada en registry para que no reaparezca
    const idx = sprite.getData('idx') as number;
    const recolectadas = (this.game.registry.get('monedas_recolectadas') as number[]) ?? [];
    if (!recolectadas.includes(idx)) {
      recolectadas.push(idx);
      this.game.registry.set('monedas_recolectadas', recolectadas);
    }
    // Update HUD
    const hud = this.children.getByName('hud_monedas') as Phaser.GameObjects.Text | null;
    if (hud) hud.setText(`${this.senalLogro}/${MONEDAS.length}`);
  }

  /** Recolecta un punto de exploración: suma al rasgo `curiosidad`. */
  private recolectarExploracion(
    punto: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ): void {
    const sprite = punto as Phaser.Physics.Arcade.Sprite;
    if (!sprite.active) return;
    sprite.disableBody(true, true);
    this.senalCuriosidad = Math.min(
      this.senalCuriosidad + 1,
      this.oportunidadCuriosidad
    );
    sfxCrystal();
    // Persistir cristal recolectado en registry
    const idx = sprite.getData('idx') as number;
    const recolectados = (this.game.registry.get('cristales_recolectados') as number[]) ?? [];
    if (!recolectados.includes(idx)) {
      recolectados.push(idx);
      this.game.registry.set('cristales_recolectados', recolectados);
    }
    // Update HUD
    const hud = this.children.getByName('hud_cristales') as Phaser.GameObjects.Text | null;
    if (hud) hud.setText(`${this.senalCuriosidad}/${PUNTOS_EXPLORACION.length}`);
  }

  /** Recolecta un corazón: recupera 1 vida si no está al máximo. */
  private recolectarCorazon(
    corazon: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ): void {
    const sprite = corazon as Phaser.Physics.Arcade.Sprite;
    if (!sprite.active) return;
    if (this.vidas >= VIDAS_INICIALES) return; // Ya tiene todas las vidas
    sprite.disableBody(true, true);
    this.vidas = Math.min(this.vidas + 1, VIDAS_INICIALES);
    this.actualizarHudVidas();
    sfxCrystal();
  }

  /** Reaparece al jugador en el punto de inicio y restaura las vidas. */
  private reaparecerJugador(): void {
    this.vidas = VIDAS_INICIALES;
    this.actualizarHudVidas();
    this.jugador.setVelocity(0, 0);
    this.jugador.setPosition(this.spawnX, this.spawnY);
  }

  /** Actualiza el HUD de vidas (corazones) según el estado actual. */
  private actualizarHudVidas(): void {
    const hud = this.children.getByName('hud_vidas') as Phaser.GameObjects.Text | null;
    if (hud) {
      const llenos = '❤️'.repeat(this.vidas);
      const vacios = '🖤'.repeat(VIDAS_INICIALES - this.vidas);
      hud.setText(llenos + vacios);
    }
    // Mostrar/ocultar corazones de pickup según si faltan vidas
    if (this.corazonesGrupo) {
      this.corazonesGrupo.getChildren().forEach((child) => {
        const c = child as Phaser.Physics.Arcade.Sprite;
        if (!c.active) return; // ya fue recogido
        if (this.vidas >= VIDAS_INICIALES) {
          c.setVisible(false);
          c.body!.enable = false;
        } else {
          c.setVisible(true);
          c.body!.enable = true;
        }
      });
    }
  }

  /**
   * Activa un acceso oculto: suma al rasgo `curiosidad` (explorar) y solicita al
   * Shell la transición hacia la escena destino (Requirements 1.6, 1.7). Cada
   * acceso se activa una sola vez. Muestra una pantalla de "entrando al portal"
   * antes de transicionar.
   */
  private activarAcceso(acceso: AccesoOculto): void {
    if (acceso.activado) return;
    acceso.activado = true;
    sfxPortal();

    this.senalCuriosidad = Math.min(
      this.senalCuriosidad + 1,
      this.oportunidadCuriosidad
    );

    // Feedback visual: flash de cámara al activar el portal
    this.cameras.main.flash(300, 120, 200, 255, false);

    // Mark this portal as permanently used in the registry
    this.game.registry.set('portal_usado_' + acceso.destino, true);

    // Guardar posición del jugador para regresar al mismo punto
    this.posicionAnteDePortal = { x: this.jugador.x, y: this.jugador.y };
    this.game.registry.set('plataformas_posicion', this.posicionAnteDePortal);

    // --- Pantalla de "Entrando al portal" ---
    // Congelar al jugador
    this.jugador.setVelocity(0, 0);
    (this.jugador.body as Phaser.Physics.Arcade.Body).enable = false;

    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;

    // Overlay oscuro
    const overlay = this.add.rectangle(
      camW / 2, camH / 2, camW, camH, 0x000000, 0
    ).setScrollFactor(0).setDepth(200);

    this.tweens.add({
      targets: overlay,
      fillAlpha: 0.8,
      duration: 400,
    });

    // Texto "PORTAL ACTIVADO"
    const titulo = this.add.text(camW / 2, camH / 2 - 30, '⚡ PORTAL ACTIVADO ⚡', {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#7cf9ff',
      align: 'center',
      shadow: { offsetX: 0, offsetY: 0, color: '#7cf9ff', blur: 12, fill: true },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201).setAlpha(0);

    const destinos: Record<string, string> = {
      ritmo: '🎵 NIVEL RITMO',
      shooter: '🔫 NIVEL SHOOTER',
      carreras: '🏎️ NIVEL CARRERAS',
    };
    const subtitulo = this.add.text(
      camW / 2, camH / 2 + 10,
      destinos[acceso.destino] ?? acceso.destino.toUpperCase(),
      {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: '#ffffff',
        align: 'center',
      }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(201).setAlpha(0);

    // Animación de entrada
    this.tweens.add({
      targets: [titulo, subtitulo],
      alpha: 1,
      duration: 400,
      delay: 300,
    });

    // Transicionar después de la animación
    this.time.delayedCall(1500, () => {
      this.solicitarTransicion(acceso.destino);
    });
  }

  /**
   * Solicita una transición al Shell. Degrada con gracia (log) si el Shell aún
   * no fue inyectado, de modo que la escena sea ejecutable de forma autónoma
   * antes de cablear el SceneManager (tarea 11).
   */
  private solicitarTransicion(destino: EscenaId): void {
    if (this.shell) {
      this.shell.reportarTelemetria(this.construirTelemetria());
      this.shell.solicitarTransicion(destino);
      return;
    }
    // eslint-disable-next-line no-console
    console.info(
      `[NivelPlataformas] Sin Shell inyectado: se omite la transición a '${destino}'.`
    );
  }

  /** Patrulla enemigos: invierte dirección basándose en distancia al spawn. */
  private actualizarEnemigos(): void {
    const velocidad = VELOCIDAD_ENEMIGO_BASE * this.factorAgresividad;
    const rangoPatrulla = 100;
    const deltaS = 1 / 60; // approximate frame time

    for (const enemigo of this.enemigos) {
      if (!enemigo.active) continue;
      const spawnX = enemigo.getData('spawnX') as number;
      let velX = enemigo.getData('velX') as number;

      // Move manually
      enemigo.x += velX * deltaS;

      // Reverse direction at patrol edges
      if (enemigo.x > spawnX + rangoPatrulla) {
        velX = -velocidad;
        enemigo.setFlipX(false);
      } else if (enemigo.x < spawnX - rangoPatrulla) {
        velX = velocidad;
        enemigo.setFlipX(true);
      }
      enemigo.setData('velX', velX);

      // Manual collision with player (distance-based)
      if (this.jugador && this.jugador.active) {
        const dx = Math.abs(enemigo.x - this.jugador.x);
        const dy = Math.abs(enemigo.y - this.jugador.y);
        if (dx < 24 && dy < 28) {
          this.tocarEnemigoManual(enemigo);
        }
      }
    }
  }

  /** Maneja colisión manual jugador↔enemigo. */
  private tocarEnemigoManual(enemigo: Phaser.GameObjects.Image | Phaser.Physics.Arcade.Sprite): void {
    if (!this.jugador || !this.jugador.body) return;
    const cuerpo = this.jugador.body as Phaser.Physics.Arcade.Body;

    // Pisotón: jugador cayendo sobre enemigo
    if (cuerpo.velocity.y > 0 && this.jugador.y < enemigo.y - 10) {
      cuerpo.setVelocityY(-REBOTE_PISOTON);
      sfxHit();
      this.cameras.main.shake(80, 0.005);
      this.senalFuria = Math.min(this.senalFuria + 1, this.oportunidadFuria);

      // Texto flotante "+1 🔥" que sube y desaparece
      const floatText = this.add.text(enemigo.x, enemigo.y - 20, '+1 🔥', {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: '#ff4444',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(200);
      this.tweens.add({
        targets: floatText,
        y: enemigo.y - 60,
        alpha: 0,
        duration: 800,
        ease: 'Power2',
        onComplete: () => floatText.destroy(),
      });

      // Desactivar inmediatamente para que no vuelva a colisionar
      enemigo.setActive(false);

      // Efecto de muerte: si es demon, reproducir animación de muerte; si no, desaparecer
      const isDemon = enemigo.getData('isDemon');
      if (isDemon && this.anims.exists('demon_death_anim')) {
        (enemigo as Phaser.Physics.Arcade.Sprite).play('demon_death_anim');
        enemigo.setData('velX', 0);
        // Flash blanco + shake en el demon al morir
        enemigo.setTintFill(0xffffff);
        this.time.delayedCall(100, () => enemigo.clearTint());
        this.tweens.add({
          targets: enemigo,
          x: enemigo.x + 3,
          duration: 40,
          yoyo: true,
          repeat: 3,
        });
        // Fade out y desaparecer
        this.tweens.add({
          targets: enemigo,
          alpha: 0,
          y: enemigo.y + 20,
          delay: 400,
          duration: 300,
          onComplete: () => {
            enemigo.setVisible(false);
          },
        });
      } else {
        // Efecto rápido de escala + fade
        this.tweens.add({
          targets: enemigo,
          scaleX: 0,
          scaleY: 0,
          alpha: 0,
          duration: 200,
          onComplete: () => {
            enemigo.setVisible(false);
            enemigo.setActive(false);
          },
        });
      }
      return;
    }

    // Daño al jugador
    if (this.time.now < this.invulnerableHasta) return;
    this.vidas = Math.max(0, this.vidas - 1);
    this.actualizarHudVidas();
    this.invulnerableHasta = this.time.now + INVULNERABILIDAD_MS;
    sfxHit();
    // Flash rojo en pantalla al recibir daño
    this.cameras.main.flash(200, 255, 0, 0, false, undefined, this);
    cuerpo.setVelocityX(this.jugador.x < enemigo.x ? -RETROCESO_DANIO : RETROCESO_DANIO);
    this.jugador.setAlpha(0.5);
    this.time.delayedCall(INVULNERABILIDAD_MS, () => this.jugador.setAlpha(1));
    if (this.vidas <= 0) {
      this.reaparecerJugador();
    }
  }

  /**
   * Mide el rasgo `riesgo`: contar "roces" con enemigos vivos (estar dentro del
   * radio de riesgo sin recibir daño), con un cooldown para no sobre-contar.
   */
  private actualizarRiesgo(deltaMs: number): void {
    if (this.cooldownRiesgo > 0) {
      this.cooldownRiesgo -= deltaMs;
      return;
    }
    if (this.senalRiesgo >= this.oportunidadRiesgo) return;

    for (const enemigo of this.enemigos) {
      if (!enemigo.active) continue;
      const distancia = Phaser.Math.Distance.Between(
        this.jugador.x,
        this.jugador.y,
        enemigo.x,
        enemigo.y
      );
      if (distancia <= RADIO_RIESGO) {
        this.senalRiesgo = Math.min(this.senalRiesgo + 1, this.oportunidadRiesgo);
        this.cooldownRiesgo = COOLDOWN_RIESGO_MS;
        return;
      }
    }
  }

  // =========================================================================
  // Colaboradores de mutación
  // =========================================================================

  /**
   * Adaptador {@link SpawnerEnemigos} sobre los enemigos de la escena
   * (Requirements 7.2, 7.3): la intensidad activa/desactiva enemigos y la
   * agresividad escala su velocidad.
   */
  private crearSpawnerEnemigos(): SpawnerEnemigos {
    return {
      ajustarIntensidad: (intensidad: number) => {
        const total = this.enemigos.length;
        const activos = Math.round(Phaser.Math.Clamp(intensidad, 0, 1) * total);
        this.enemigos.forEach((enemigo, i) => {
          const debeEstarActivo = i < activos;
          enemigo.setActive(debeEstarActivo);
          enemigo.setVisible(debeEstarActivo);
          const cuerpo = enemigo.body as Phaser.Physics.Arcade.Body | null;
          if (cuerpo) cuerpo.enable = debeEstarActivo;
        });
      },
      ajustarAgresividad: (agresividad: number) => {
        // 0 → lentos (0.5x), 1 → rápidos (1.5x).
        this.factorAgresividad = 0.5 + Phaser.Math.Clamp(agresividad, 0, 1);
      },
    };
  }

  /**
   * Crea un emisor de partículas detenido como placeholder cuando el clima es
   * `'ninguno'`, para satisfacer el contrato `ContextoMutacion.capaClima` (no
   * admite null). El {@link SistemaMutacion} lo mantiene detenido.
   */
  private crearEmisorClimaPlaceholder(): Phaser.GameObjects.Particles.ParticleEmitter {
    const key = asegurarTexturaParticula(this);
    const emisor = this.add.particles(0, 0, key, { lifespan: 1, quantity: 0 });
    emisor.stop();
    emisor.setScrollFactor(0);
    return emisor;
  }

  // =========================================================================
  // Feature 2: Controls overlay at start
  // =========================================================================

  /** Shows an informational controls overlay that fades out after 5 seconds. 
   *  During this time, gameplay elements (platforms, player, coins) are hidden.
   */
  private mostrarOverlayControles(): void {
    this.game.registry.set('plataformas_instrucciones_mostradas', true);

    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;

    // Bloquear movimiento durante las instrucciones
    this.entradaBloqueada = true;

    // Fondo oscuro
    const fondoOverlay = this.add.rectangle(camW / 2, camH / 2, camW, camH, 0x000000, 0.8)
      .setScrollFactor(0).setDepth(100);

    const titulo = this.add
      .text(camW / 2, camH / 2 - 50, 'PLATAFORMAS', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#00ffff',
        shadow: { offsetX: 0, offsetY: 0, color: '#00ffff', blur: 8, fill: true },
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(101);

    const controles = this.add
      .text(camW / 2, camH / 2, '← → MOVER  |  ↑ SALTAR  |  SPACE SALTAR\n\n⚔️ SALTÁ SOBRE LOS ENEMIGOS PARA MATARLOS', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 6,
        shadow: { offsetX: 0, offsetY: 0, color: '#00ffff', blur: 4, fill: true },
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(101);

    const tip = this.add
      .text(camW / 2, camH / 2 + 40, 'EXPLORA Y ENCUENTRA LOS PORTALES OCULTOS', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#aaffaa',
        align: 'center',
        shadow: { offsetX: 0, offsetY: 0, color: '#00ff88', blur: 4, fill: true },
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(101);

    const overlayElements = [fondoOverlay, titulo, controles, tip];

    this.time.delayedCall(5000, () => {
      this.tweens.add({
        targets: overlayElements,
        alpha: 0,
        duration: 500,
        onComplete: () => {
          overlayElements.forEach((el) => el.destroy());
          this.entradaBloqueada = false;
        },
      });
    });
  }

}
