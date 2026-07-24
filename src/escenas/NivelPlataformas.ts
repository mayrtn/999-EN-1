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
} from '../contrato';
import { InputTeclado } from '../input';
import {
  SistemaMutacion,
  GestorAudioPhaser,
  OverlayTextoPhaser,
  crearCapaClima,
  asegurarTexturaParticula,
} from '../mutacion';
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
const ANCHO_MUNDO = 1920;
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
  { x: 360, y: 400, ancho: 180, alto: 24 },
  { x: 640, y: 320, ancho: 160, alto: 24 },
  { x: 900, y: 250, ancho: 140, alto: 24 },
  { x: 1180, y: 360, ancho: 200, alto: 24 },
  { x: 1500, y: 280, ancho: 160, alto: 24 },
  // Cornisa alta "secreta" que oculta un acceso.
  { x: 1750, y: 140, ancho: 150, alto: 24 },
];

/** Monedas coleccionables (rasgo `logro`, Requirement 1.4). */
const MONEDAS: readonly { x: number; y: number }[] = [
  { x: 320, y: 360 },
  { x: 600, y: 280 },
  { x: 860, y: 210 },
  { x: 1140, y: 320 },
  { x: 1460, y: 240 },
  { x: 150, y: 480 },
  { x: 750, y: 480 },
  { x: 1250, y: 480 },
];

/** Enemigos hostiles (rasgo `furia` al derrotarlos, Requirement 1.5). */
const ENEMIGOS: readonly { x: number; y: number }[] = [
  { x: 500, y: 480 },
  { x: 760, y: 480 },
  { x: 1080, y: 480 },
  { x: 1400, y: 480 },
];

/** Puntos de exploración ocultos/apartados (rasgo `curiosidad`). */
const PUNTOS_EXPLORACION: readonly { x: number; y: number }[] = [
  { x: 1780, y: 80 },
  { x: 40, y: 80 },
  { x: 940, y: 160 },
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
  // Escondido sobre la cornisa alta a la derecha.
  { x: 1750, y: 110, ancho: 48, alto: 56, destino: 'ritmo' },
  // Escondido en el rincón superior izquierdo, fuera de la ruta obvia.
  { x: 60, y: 90, ancho: 48, alto: 56, destino: 'shooter' },
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
  private audio: GestorAudioPhaser | null = null;
  private overlay: OverlayTextoPhaser | null = null;

  // --- Objetos del mundo ---
  private jugador!: Phaser.Physics.Arcade.Sprite;
  private jugadorUsaPlaceholder: boolean = true;
  private plataformas!: Phaser.Physics.Arcade.StaticGroup;
  private monedas!: Phaser.Physics.Arcade.Group;
  private enemigosGrupo!: Phaser.Physics.Arcade.Group;
  private exploracionGrupo!: Phaser.Physics.Arcade.Group;
  private readonly enemigos: Phaser.Physics.Arcade.Sprite[] = [];
  private readonly accesos: AccesoOculto[] = [];

  // --- Estado de juego ---
  private vidas = VIDAS_INICIALES;
  private invulnerableHasta = 0;
  private cooldownRiesgo = 0;
  private spawnX = 80;
  private spawnY = 440;
  /** Factor de agresividad aplicado a la velocidad de enemigos (Requirement 7.3). */
  private factorAgresividad = 1;

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
    // Collectible de exploración: Life
    this.load.image('star_collect', 'src/assets/plataformas/PNG/Collectable Object/Crystal_Caves_Forest_2D_Platformer_Tileset_Collectable Object - Life.png');
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
    const bg0 = this.add.tileSprite(0, 0, ANCHO_MUNDO, ALTO_MUNDO, 'bg_layer0');
    bg0.setOrigin(0, 0);
    bg0.setScrollFactor(0);
    bg0.setDepth(-10);

    const bg1 = this.add.tileSprite(0, 0, ANCHO_MUNDO, ALTO_MUNDO, 'bg_layer1');
    bg1.setOrigin(0, 0);
    bg1.setScrollFactor(0.3);
    bg1.setDepth(-9);

    this.crearPlataformas();
    this.crearJugador();
    this.crearMonedas();
    this.crearEnemigos();
    this.crearPuntosExploracion();
    this.crearAccesosOcultos();
    this.registrarColisiones();

    this.cameras.main.startFollow(this.jugador, true, 0.1, 0.1);

    // Si el input no vino del Shell, constrúyelo desde la escena (autónomo).
    if (!this.entrada) {
      this.entrada = InputTeclado.desdeEscena(this);
    }

    // Colaboradores de mutación armados con las referencias propias de la escena.
    this.audio = new GestorAudioPhaser(this);
    this.overlay = new OverlayTextoPhaser(this);

    // Aplica las perillas (remotas o fallback) sobre el mundo ya construido.
    if (this.perillas) {
      this.aplicarPerillas(this.perillas);
    }
  }

  /**
   * Bucle por frame. Lee el input unificado y traduce a movimiento/salto,
   * patrulla enemigos y mide el rasgo de riesgo por cercanía a enemigos vivos.
   */
  override update(_tiempo: number, deltaMs: number): void {
    if (!this.jugador || !this.jugador.body) return;

    const input = this.entrada;
    if (!input) return;

    // El InputTeclado calcula just-pressed en update(); debe llamarse primero.
    if (input instanceof InputTeclado) {
      input.update();
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

    // Sprites tintables: enemigos siempre; jugador solo si usa placeholder.
    // Las monedas usan sprite real con colores propios, no se tintan.
    const spritesTintables: Phaser.GameObjects.Sprite[] = [
      ...(this.jugadorUsaPlaceholder ? [this.jugador] : []),
      ...this.enemigos,
    ];

    // Capa de clima; si es 'ninguno' se crea un emisor placeholder detenido para
    // respetar el contrato (capaClima no admite null).
    const capaClima =
      crearCapaClima(this, perillas.clima) ?? this.crearEmisorClimaPlaceholder();

    const audio = this.audio ?? new GestorAudioPhaser(this);
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
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, 1);
    g.fillRect(0, 0, ancho, alto);
    g.generateTexture(key, ancho, alto);
    g.destroy();
  }

  /** Crea una textura circular sólida si aún no existe. */
  private generarCirculo(key: string, diametro: number, color: number): void {
    if (this.textures.exists(key)) return;
    const r = diametro / 2;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, 1);
    g.fillCircle(r, r, r);
    g.generateTexture(key, diametro, diametro);
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
    for (const m of MONEDAS) {
      const moneda = this.monedas.create(
        m.x,
        m.y,
        'coin_gold'
      ) as Phaser.Physics.Arcade.Sprite;
      moneda.setScale(2);
      moneda.play('coin_spin');
      moneda.setCircle(8);
    }
  }

  /** Crea el grupo de enemigos hostiles que patrullan (Requirement 1.5). */
  private crearEnemigos(): void {
    this.enemigosGrupo = this.physics.add.group();
    for (const e of ENEMIGOS) {
      const enemigo = this.enemigosGrupo.create(
        e.x,
        e.y,
        TX.enemigo
      ) as Phaser.Physics.Arcade.Sprite;
      enemigo.setCollideWorldBounds(true);
      enemigo.setBounce(1, 0);
      enemigo.setVelocityX(VELOCIDAD_ENEMIGO_BASE);
      enemigo.setData('hostil', true);
      this.enemigos.push(enemigo);
    }
  }

  /** Crea los puntos de exploración con estrellas (rasgo `curiosidad`). */
  private crearPuntosExploracion(): void {
    this.exploracionGrupo = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    for (const punto of PUNTOS_EXPLORACION) {
      const estrella = this.exploracionGrupo.create(
        punto.x,
        punto.y,
        'star_collect'
      ) as Phaser.Physics.Arcade.Sprite;
      estrella.setScale(0.35);
    }
  }

  /**
   * Crea al menos dos accesos ocultos en zonas secretas (Requirements 1.6, 1.7).
   */
  private crearAccesosOcultos(): void {
    for (const a of ACCESOS) {
      const objeto = this.add.rectangle(a.x, a.y, a.ancho, a.alto, COLOR.acceso, 0.35);
      objeto.setStrokeStyle(1, 0x6f7bd6, 0.6);
      this.physics.add.existing(objeto, true);
      this.accesos.push({ objeto, destino: a.destino, activado: false });
    }
  }

  /** Registra colisiones y solapamientos entre los objetos del mundo. */
  private registrarColisiones(): void {
    this.physics.add.collider(this.jugador, this.plataformas);
    this.physics.add.collider(this.enemigosGrupo, this.plataformas);

    this.physics.add.overlap(
      this.jugador,
      this.monedas,
      (_j, moneda) => this.recolectarMoneda(moneda),
      undefined,
      this
    );

    this.physics.add.overlap(
      this.jugador,
      this.enemigosGrupo,
      (_j, enemigo) => this.tocarEnemigo(enemigo),
      undefined,
      this
    );

    this.physics.add.overlap(
      this.jugador,
      this.exploracionGrupo,
      (_j, punto) => this.recolectarExploracion(punto),
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
  }

  /**
   * Contacto jugador↔enemigo (Requirement 1.5).
   *
   * - Pisotón (jugador cayendo sobre el enemigo): derrota al enemigo, rebota y
   *   suma al rasgo `furia` (destruir).
   * - Contacto lateral: aplica la consecuencia de daño (pierde vida, retroceso e
   *   invulnerabilidad temporal). Si se agotan las vidas, reaparece en el inicio.
   */
  private tocarEnemigo(
    enemigo: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ): void {
    const sprite = enemigo as Phaser.Physics.Arcade.Sprite;
    if (!sprite.active) return;

    const cuerpoJugador = this.jugador.body as Phaser.Physics.Arcade.Body;
    const cuerpoEnemigo = sprite.body as Phaser.Physics.Arcade.Body;
    const cayendoSobre =
      cuerpoJugador.velocity.y > 0 &&
      cuerpoJugador.bottom <= cuerpoEnemigo.top + cuerpoEnemigo.height * 0.5;

    if (cayendoSobre) {
      this.derrotarEnemigo(sprite);
      this.jugador.setVelocityY(-REBOTE_PISOTON);
      return;
    }

    this.recibirDanio(sprite);
  }

  /** Derrota un enemigo y suma al rasgo `furia`. */
  private derrotarEnemigo(sprite: Phaser.Physics.Arcade.Sprite): void {
    const indice = this.enemigos.indexOf(sprite);
    if (indice >= 0) this.enemigos.splice(indice, 1);
    sprite.disableBody(true, true);
    this.senalFuria = Math.min(this.senalFuria + 1, this.oportunidadFuria);
  }

  /** Aplica la consecuencia de daño al jugador con invulnerabilidad temporal. */
  private recibirDanio(enemigo: Phaser.Physics.Arcade.Sprite): void {
    if (this.time.now < this.invulnerableHasta) return;

    this.vidas = Math.max(0, this.vidas - 1);
    this.invulnerableHasta = this.time.now + INVULNERABILIDAD_MS;

    // Retroceso en dirección opuesta al enemigo.
    const direccion = this.jugador.x < enemigo.x ? -1 : 1;
    this.jugador.setVelocity(direccion * RETROCESO_DANIO, -RETROCESO_DANIO * 0.6);

    // Parpadeo de invulnerabilidad (feedback visual).
    this.jugador.setAlpha(0.5);
    this.time.delayedCall(INVULNERABILIDAD_MS, () => this.jugador.setAlpha(1));

    if (this.vidas <= 0) {
      this.reaparecerJugador();
    }
  }

  /** Reaparece al jugador en el punto de inicio y restaura las vidas. */
  private reaparecerJugador(): void {
    this.vidas = VIDAS_INICIALES;
    this.jugador.setVelocity(0, 0);
    this.jugador.setPosition(this.spawnX, this.spawnY);
  }

  /**
   * Activa un acceso oculto: suma al rasgo `curiosidad` (explorar) y solicita al
   * Shell la transición hacia la escena destino (Requirements 1.6, 1.7). Cada
   * acceso se activa una sola vez.
   */
  private activarAcceso(acceso: AccesoOculto): void {
    if (acceso.activado) return;
    acceso.activado = true;

    this.senalCuriosidad = Math.min(
      this.senalCuriosidad + 1,
      this.oportunidadCuriosidad
    );

    // Feedback visual: el acceso "se abre".
    acceso.objeto.setFillStyle(0x8affc1, 0.6);

    this.solicitarTransicion(acceso.destino);
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

  /** Patrulla enemigos: invierte dirección al chocar y escala por agresividad. */
  private actualizarEnemigos(): void {
    const velocidad = VELOCIDAD_ENEMIGO_BASE * this.factorAgresividad;
    for (const enemigo of this.enemigos) {
      if (!enemigo.active) continue;
      const cuerpo = enemigo.body as Phaser.Physics.Arcade.Body;
      if (cuerpo.blocked.left) {
        enemigo.setVelocityX(velocidad);
      } else if (cuerpo.blocked.right) {
        enemigo.setVelocityX(-velocidad);
      } else if (cuerpo.velocity.x === 0) {
        enemigo.setVelocityX(velocidad);
      } else {
        // Conserva el sentido actual, pero a la magnitud ajustada.
        const sentido = Math.sign(cuerpo.velocity.x) || 1;
        enemigo.setVelocityX(sentido * velocidad);
      }
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
}
