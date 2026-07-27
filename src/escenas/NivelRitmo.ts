/**
 * Nivel_Ritmo — nivel oculto de género ritmo (Requirement 2).
 *
 * Escena de Phaser 3 que implementa el {@link IEscena} del Contrato_Compartido.
 * Presenta una sesión jugable corta en la que "notas" (beats) descienden hacia
 * una línea de acierto; el jugador pulsa la acción primaria del
 * {@link InputUnificado} para golpearlas en el momento justo.
 *
 * Cobertura de requisitos:
 * - **Requirement 2.1**: la sesión dura entre 60 y 90 segundos
 *   ({@link NivelRitmo.duracionMs} acotada a `[30000, 50000]`), gobernada por el
 *   tiempo de la escena.
 * - **Requirement 2.2**: pulsar la acción primaria dentro de la ventana de
 *   acierto de un beat registra un ACIERTO.
 * - **Requirement 2.3**: pulsar fuera de la ventana de acierto de todo beat
 *   registra un FALLO.
 * - **Requirement 2.4**: al agotarse la duración, finaliza y notifica al Shell la
 *   solicitud de retorno (`solicitarTransicion('plataformas')`).
 * - **Requirements 2.5, 9.4**: aplica las Perillas_Mutacion recibidas en
 *   `create()` vía el {@link SistemaMutacion}.
 * - **Requirements 2.6, 9.1**: emite la Telemetria_Rasgos al terminar.
 *
 * Fase 2 — arte real: las notas se renderizan usando el spritesheet
 * `Music-Notes.png` (grilla 3x3 de notas musicales pixel art). La línea de
 * acierto mantiene una textura generada en runtime como fallback.
 *
 * @module escenas/NivelRitmo
 */

import Phaser from 'phaser';
import type {
  EscenaId,
  DeclaracionRasgos,
  TelemetriaRasgos,
  PerillasMutacion,
  InputUnificado,
  IShell,
  DatosInicioEscena,
  IEscena,
  ContextoMutacion,
} from '../contrato';
import {
  SistemaMutacion,
  GestorAudioPhaser,
  OverlayTextoPhaser,
  crearCapaClima,
} from '../mutacion';
import { mostrarPanelIA } from '../mutacion/panelIA';
import { sfxRhythmHit, sfxRhythmMiss } from '../audio/sfx';
import { CLAVE_PERSONAJE } from './EscenaSeleccion';

/** Duración mínima de la sesión en ms (Requirement 2.1). */
const DURACION_MIN_MS = 30000;
/** Duración máxima de la sesión en ms (Requirement 2.1). */
const DURACION_MAX_MS = 50000;
/** Duración por defecto en ms, dentro del rango `[30000, 50000]`. */
const DURACION_DEFECTO_MS = 40000;

/** Intervalo entre beats consecutivos (~100 BPM). */
const INTERVALO_BEAT_MS = 600;
/** Instante del primer beat medido desde el inicio de la sesión. */
const PRIMER_BEAT_MS = 2000;
/** Margen final sin beats antes de terminar la sesión. */
const MARGEN_FINAL_MS = 1500;

/** Tiempo que un beat tarda en descender desde el spawn hasta la línea. */
const LEAD_TIME_MS = 1800;
/** Semiancho de la ventana de acierto en ms (± respecto al instante objetivo). */
const VENTANA_ACIERTO_MS = 150;
/**
 * Umbral de "timing ajustado": un acierto cuyo desfase absoluto supera este
 * valor (cerca del borde de la ventana, o tarde) se considera arriesgado y
 * contribuye a la señal de Riesgo.
 */
const UMBRAL_AJUSTADO_MS = 90;

/** Tope de oportunidad de Curiosidad (exploración de la acción secundaria). */
const CURIOSIDAD_MAX = 3;

/** Perillas por defecto usadas si la escena corre sin Shell (standalone). */
const PERILLAS_DEFECTO: PerillasMutacion = {
  paleta: 'neon',
  intensidad_enemigos: 0,
  agresividad: 0,
  clima: 'ninguno',
  mood_musica: 'calma',
  mensaje: '',
};

/** Key de la textura blanca placeholder para la línea de acierto. */
const KEY_TEXTURA = 'ritmo_px';
/** Key del spritesheet de notas musicales (legacy — ya no se usa). */
// const KEY_NOTAS = 'ritmo_notas';
/** Keys de las notas individuales. */
const NOTAS_KEYS: string[] = [
  'nota_1', 'nota_2', 'nota_3', 'nota_4', 'nota_5', 'nota_6', 'nota_7',
];
/** Rutas de las notas individuales. */
const NOTAS_PATHS: string[] = [
  'src/assets/items/Notas/Music-Notes.png',
  'src/assets/items/Notas/Music-Notes - copia.png',
  'src/assets/items/Notas/Music-Notes - copia (2).png',
  'src/assets/items/Notas/Music-Notes - copia (3).png',
  'src/assets/items/Notas/Music-Notes - copia (4).png',
  'src/assets/items/Notas/Music-Notes - copia (5).png',
  'src/assets/items/Notas/Music-Notes - copia (6).png',
];

/** Estado interno de un beat de la línea temporal. */
interface Beat {
  /** Sprite tintable que representa la nota (arte placeholder). */
  sprite: Phaser.GameObjects.Sprite;
  /** Instante objetivo (ms desde el inicio) en que la nota alcanza la línea. */
  tiempoObjetivo: number;
  /** `true` cuando ya fue acertada o se dio por perdida (no se re-evalúa). */
  juzgada: boolean;
  /** Offset X aleatorio dentro del carril para esta nota. */
  offsetX: number;
}

/**
 * Nivel_Ritmo: escena jugable de ritmo conforme al Contrato_Compartido.
 *
 * Registra aciertos/fallos según la ventana temporal y, al agotarse la duración,
 * emite su telemetría y solicita el retorno al Nivel_Plataformas.
 */
export class NivelRitmo extends Phaser.Scene implements IEscena {
  /** Identidad lógica de la escena (Contrato_Compartido). */
  readonly id: EscenaId = 'ritmo';

  /** Duración de la sesión, acotada a `[30000, 50000]` ms (Requirement 2.1). */
  private readonly duracionMs: number;

  /** Instantes objetivo de cada beat (deterministas a partir de la duración). */
  private readonly tiemposBeat: number[];
  /** Cantidad total de beats de la sesión (tope de oportunidad de Logro/Riesgo). */
  private readonly totalBeats: number;

  // --- Colaboradores del Contrato_Compartido ---
  private shell: IShell | null = null;
  private entradaInput: InputUnificado | null = null;
  private perillasIniciales: PerillasMutacion = PERILLAS_DEFECTO;

  // --- Sistema de mutación y sus colaboradores concretos ---
  private readonly sistemaMutacion = new SistemaMutacion();
  private audio: GestorAudioPhaser | null = null;
  private overlay: OverlayTextoPhaser | null = null;
  private capaClima: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private readonly spritesTintables: Phaser.GameObjects.Sprite[] = [];

  // --- Estado de la sesión ---
  private beats: Beat[] = [];
  private tiempoInicio = 0;
  private finalizado = false;
  private esperandoInicio = true;

  // --- Señales medidas por rasgo ---
  private aciertos = 0;
  private fallos = 0;
  private riesgoSenal = 0;
  private curiosidadSenal = 0;

  // --- Geometría de juego ---
  private spawnY = -20;
  private hitLineY = 0;
  private laneX = 0;

  // --- HUD ---
  private hudAciertos: Phaser.GameObjects.Text | null = null;
  private hudFallos: Phaser.GameObjects.Text | null = null;
  private hudTiempo: Phaser.GameObjects.Text | null = null;

  // --- Personaje decorativo ---
  private personajeDeco: Phaser.GameObjects.Sprite | null = null;

  /**
   * @param duracionMs Duración deseada de la sesión; se acota al rango válido
   *   `[30000, 50000]` (Requirement 2.1). Por defecto {@link DURACION_DEFECTO_MS}.
   */
  constructor(duracionMs: number = DURACION_DEFECTO_MS) {
    super({ key: 'ritmo' });
    this.duracionMs = Phaser.Math.Clamp(
      duracionMs,
      DURACION_MIN_MS,
      DURACION_MAX_MS
    );
    this.tiemposBeat = this.generarTiemposBeat();
    this.totalBeats = this.tiemposBeat.length;
  }

  /**
   * Recibe las perillas resueltas, la fachada del Shell y el input antes de
   * `create()` (Requirement 8.4). Degrada con gracia si el Shell no está
   * cableado todavía (Task 11): guarda `null` y registrará la transición por
   * consola en lugar de romper.
   */
  init(datos: DatosInicioEscena): void {
    this.shell = datos?.shell ?? null;
    this.entradaInput = datos?.input ?? this.entradaInput;
    this.perillasIniciales = datos?.perillas ?? PERILLAS_DEFECTO;
    // Reinicio de estado (la instancia de escena puede reutilizarse).
    this.finalizado = false;
    this.esperandoInicio = true;
    this.aciertos = 0;
    this.fallos = 0;
    this.riesgoSenal = 0;
    this.curiosidadSenal = 0;
    this.spritesTintables.length = 0;
    this.beats = [];
  }

  /** Inyecta el input unificado (Requirements 9.5, 9.6). */
  setInput(input: InputUnificado): void {
    this.entradaInput = input;
  }

  /** Carga las notas musicales individuales y animaciones del personaje. */
  preload(): void {
    // Cargar cada nota individual.
    for (let i = 0; i < NOTAS_KEYS.length; i++) {
      const key = NOTAS_KEYS[i] as string;
      const path = NOTAS_PATHS[i] as string;
      if (!this.textures.exists(key)) {
        this.load.image(key, path);
      }
    }

    // Cargar spritesheet de Jump del personaje seleccionado (para reacción).
    const idPersonaje = this.game.registry.get('personaje_seleccionado') as string | null;
    if (idPersonaje) {
      const mapa: Record<string, string> = {
        pink_monster: 'src/assets/personajes/1 Pink_Monster/Pink_Monster_Jump_8.png',
        owlet_monster: 'src/assets/personajes/2 Owlet_Monster/Owlet_Monster_Jump_8.png',
        dude_monster: 'src/assets/personajes/3 Dude_Monster/Dude_Monster_Jump_8.png',
      };
      const keyJump = `${idPersonaje}_jump`;
      if (mapa[idPersonaje] && !this.textures.exists(keyJump)) {
        this.load.spritesheet(keyJump, mapa[idPersonaje], {
          frameWidth: 32,
          frameHeight: 32,
        });
      }
    }
  }

  /**
   * Construye la escena: pista, línea de acierto, beats, HUD y colaboradores de
   * mutación; luego aplica las Perillas_Mutacion recibidas (Requirements 2.5, 9.4).
   */
  create(): void {
    // Validación de personaje seleccionado (Requirements 4.3, 4.4).
    const idPersonaje = this.game.registry.get(CLAVE_PERSONAJE) as string | null;
    if (!idPersonaje || !['pink_monster', 'owlet_monster', 'dude_monster'].includes(idPersonaje)) {
      if (this.shell) {
        this.shell.solicitarTransicion('seleccion_personaje');
      } else {
        // eslint-disable-next-line no-console
        console.warn('[NivelRitmo] Sin personaje seleccionado y sin Shell: no se puede redirigir.');
      }
      return;
    }

    this.asegurarTextura();

    const { width, height } = this.scale;
    this.laneX = width / 2;
    this.hitLineY = height - 90;
    this.spawnY = -20;

    this.dibujarFondo(width, height);
    this.crearTitulo(width);
    this.crearInstruccion(width);
    this.crearLineaAcierto(width);
    this.crearDecoracionAnimada(width, height);
    this.crearBeats();
    this.crearHud();
    this.crearPersonajeDecorativo(width, height);

    // Colaboradores concretos del Sistema_Mutacion.
    this.audio = new GestorAudioPhaser(this);
    this.overlay = new OverlayTextoPhaser(this);

    // Aplica las perillas resueltas por el Shell (Requirements 2.5, 9.4).
    this.aplicarPerillas(this.perillasIniciales);

    // Esperar mostrando instrucciones (5s) + panel IA (5s) antes de arrancar.
    this.esperandoInicio = true;
    this.time.delayedCall(10000, () => {
      this.esperandoInicio = false;
      this.tiempoInicio = this.time.now;
    });
  }

  /**
   * Bucle por frame. Llama `input.update()` una vez por frame (contrato de
   * {@link InputUnificado}), desplaza los beats, evalúa las pulsaciones y
   * finaliza al agotarse la duración (Requirement 2.4).
   *
   * @param tiempo Marca de tiempo actual de Phaser (equivalente a `this.time.now`).
   */
  override update(tiempo: number): void {
    if (this.finalizado) return;
    if (this.esperandoInicio) return;

    // Contrato de InputUnificado: actualizar el estado just-pressed cada frame.
    // `update()` es propio de la implementación concreta (InputTeclado) y no
    // forma parte de la interfaz; se invoca de forma opcional y segura.
    (this.entradaInput as { update?: () => void } | null)?.update?.();

    const transcurrido = tiempo - this.tiempoInicio;

    this.actualizarBeats(transcurrido);
    this.evaluarEntrada(transcurrido);
    this.actualizarHud(transcurrido);

    // Fin de sesión por duración (Requirements 2.1, 2.4).
    if (transcurrido >= this.duracionMs) {
      this.finalizar();
    }
  }

  /**
   * Declara los Rasgos que la escena mide y sus topes de oportunidad
   * (Requirement 4.2).
   *
   * Mapeo de diseño para ritmo:
   * - `logro`: total de beats (acertarlos es el logro).
   * - `riesgo`: total de beats (cada beat ofrece la ocasión de un timing ajustado).
   * - `curiosidad`: pequeña (explorar la acción secundaria).
   * - `furia`: no medida (0).
   */
  declararRasgos(): DeclaracionRasgos {
    return {
      oportunidadMaxima: {
        furia: 0,
        curiosidad: CURIOSIDAD_MAX,
        logro: this.totalBeats,
        riesgo: this.totalBeats,
      },
    };
  }

  /**
   * Aplica las Perillas_Mutacion a la escena reutilizando los sprites existentes
   * (Requirements 2.5, 7.*, 9.4).
   *
   * Arma el {@link ContextoMutacion} con las referencias propias de la escena:
   * sprites tintables (línea + notas), capa de clima creada con
   * {@link crearCapaClima}, gestor de audio para el mood y overlay para el
   * mensaje. `spawnerEnemigos` se omite: el ritmo no tiene enemigos.
   */
  aplicarPerillas(perillas: PerillasMutacion): void {
    this.perillasIniciales = perillas;

    // Panel visual dramático para la demo (siempre al entrar)
    mostrarPanelIA(this, perillas, 5000);
    this.game.registry.set('ya_jugo_escena', true);

    // Recrea la capa de clima según la perilla (o null para 'ninguno').
    this.capaClima = crearCapaClima(this, perillas.clima);

    const ctx: ContextoMutacion = {
      spritesTintables: this.spritesTintables,
      // La capa puede ser null ('ninguno'); el Sistema_Mutacion es defensivo y
      // lo maneja. Se castea para satisfacer el contrato sin cambiar la interfaz.
      capaClima: this
        .capaClima as unknown as Phaser.GameObjects.Particles.ParticleEmitter,
      audio: this.audio ?? new GestorAudioPhaser(this),
      overlayTexto: this.overlay ?? new OverlayTextoPhaser(this),
      // spawnerEnemigos omitido a propósito (ritmo sin enemigos).
    };

    this.sistemaMutacion.aplicar(this, perillas, ctx);
  }

  /**
   * Construye la Telemetria_Rasgos emitida al terminar (Requirements 2.6, 9.1).
   *
   * - `logro.senal` = aciertos; `logro.oportunidad` = total de beats.
   * - `riesgo.senal` = aciertos con timing ajustado/tardío; `oportunidad` = beats.
   * - `curiosidad`: exploración de la acción secundaria (acotada a su tope).
   * - `furia`: no medida (señal y oportunidad 0 ⇒ el Motor_Scoring la excluye).
   */
  construirTelemetria(): TelemetriaRasgos {
    return {
      escena: 'ritmo',
      porRasgo: {
        furia: { senal: 0, oportunidad: 0 },
        curiosidad: {
          senal: this.curiosidadSenal,
          oportunidad: CURIOSIDAD_MAX,
        },
        logro: { senal: this.aciertos, oportunidad: this.totalBeats },
        riesgo: { senal: this.riesgoSenal, oportunidad: this.totalBeats },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  /**
   * Genera los instantes objetivo de los beats con intervalo decreciente:
   * comienza con INTERVALO_BEAT_MS y se acorta progresivamente hacia el final
   * de la sesión (las notas caen cada vez más rápido).
   */
  private generarTiemposBeat(): number[] {
    const tiempos: number[] = [];
    const limite = this.duracionMs - MARGEN_FINAL_MS;
    let t = PRIMER_BEAT_MS;
    while (t <= limite) {
      tiempos.push(t);
      // Factor de velocidad: 1 al inicio, hasta ~2 al final de la sesión.
      const progreso = t / this.duracionMs;
      const factorVelocidad = 1 + progreso;
      const intervaloActual = INTERVALO_BEAT_MS / factorVelocidad;
      t += intervaloActual;
    }
    return tiempos;
  }

  /** Genera (una vez) la textura blanca placeholder reutilizable (Fase 1). */
  private asegurarTextura(): void {
    if (!this.textures.exists(KEY_TEXTURA)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 8, 8);
      g.generateTexture(KEY_TEXTURA, 8, 8);
      g.destroy();
    }
  }

  /** Fondo negro puro + carril ancho + líneas guía + decoración neón pro. */
  private dibujarFondo(width: number, height: number): void {
    // Fondo negro puro.
    this.add
      .rectangle(0, 0, width, height, 0x000000)
      .setOrigin(0, 0)
      .setDepth(-10);

    // Ancho del carril amplio (zona donde caen las notas).
    const anchoCarril = 340;
    const izqCarril = this.laneX - anchoCarril / 2;
    const derCarril = this.laneX + anchoCarril / 2;

    // Fondo sutil del carril (un poco más claro que el negro puro).
    this.add
      .rectangle(this.laneX, height / 2, anchoCarril, height, 0x06061a)
      .setDepth(-9);

    // Gradiente lateral sutil (bordes del carril con un toque de color).
    const grad = this.add.graphics().setDepth(-8);
    grad.fillStyle(0xff44cc, 0.03);
    grad.fillRect(izqCarril - 4, 0, 4, height);
    grad.fillRect(derCarril, 0, 4, height);

    // Líneas guía verticales punteadas (magenta/rosa).
    const guia = this.add.graphics().setDepth(-5);
    const dashLen = 10;
    const gapLen = 14;
    const colorGuia = 0xff44cc;

    // Bordes del carril — más visibles.
    guia.lineStyle(2, colorGuia, 0.7);
    for (let y = 0; y < height; y += dashLen + gapLen) {
      guia.beginPath();
      guia.moveTo(izqCarril, y);
      guia.lineTo(izqCarril, Math.min(y + dashLen, height));
      guia.strokePath();
      guia.beginPath();
      guia.moveTo(derCarril, y);
      guia.lineTo(derCarril, Math.min(y + dashLen, height));
      guia.strokePath();
    }

    // Línea central punteada sutil.
    guia.lineStyle(1, colorGuia, 0.15);
    for (let y = 0; y < height; y += dashLen + gapLen) {
      guia.beginPath();
      guia.moveTo(this.laneX, y);
      guia.lineTo(this.laneX, Math.min(y + dashLen, height));
      guia.strokePath();
    }

    // === DECORACIÓN PRO ===

    const deco = this.add.graphics().setDepth(-7);

    // Barras de ecualizador a los lados (varias alturas, efecto visual estático).
    const colorCyan = 0x00e5ff;
    const colorMagenta = 0xff44cc;
    for (let i = 0; i < 10; i++) {
      const yPos = 50 + i * 48;
      const largoIzq = 20 + Math.floor(Math.random() * 80);
      const largoDer = 20 + Math.floor(Math.random() * 80);
      const alpha = 0.06 + Math.random() * 0.08;
      const color = i % 2 === 0 ? colorCyan : colorMagenta;

      // Lado izquierdo — barras que crecen hacia la izquierda
      deco.fillStyle(color, alpha);
      deco.fillRect(izqCarril - largoIzq - 15, yPos, largoIzq, 3);

      // Lado derecho — barras que crecen hacia la derecha
      deco.fillStyle(color, alpha);
      deco.fillRect(derCarril + 15, yPos, largoDer, 3);
    }

    // Puntos brillantes dispersos (estrellas/partículas estáticas).
    for (let i = 0; i < 20; i++) {
      const px = Math.random() * width;
      const py = Math.random() * height;
      // Evitar poner puntos dentro del carril.
      if (px > izqCarril - 10 && px < derCarril + 10) continue;
      const size = 1 + Math.floor(Math.random() * 2);
      const dotColor = Math.random() > 0.5 ? colorCyan : colorMagenta;
      deco.fillStyle(dotColor, 0.15 + Math.random() * 0.2);
      deco.fillRect(px, py, size, size);
    }

    // Líneas horizontales decorativas finas (grid cyberpunk).
    deco.lineStyle(1, colorCyan, 0.04);
    for (let y = 100; y < height - 100; y += 60) {
      deco.beginPath();
      deco.moveTo(0, y);
      deco.lineTo(izqCarril - 20, y);
      deco.strokePath();
      deco.beginPath();
      deco.moveTo(derCarril + 20, y);
      deco.lineTo(width, y);
      deco.strokePath();
    }

    // Esquinas decorativas (marcos en las esquinas de la pantalla).
    const esquina = this.add.graphics().setDepth(-6);
    const cornerLen = 30;
    esquina.lineStyle(2, colorCyan, 0.3);
    // Superior izquierda
    esquina.beginPath();
    esquina.moveTo(8, 8 + cornerLen);
    esquina.lineTo(8, 8);
    esquina.lineTo(8 + cornerLen, 8);
    esquina.strokePath();
    // Superior derecha
    esquina.beginPath();
    esquina.moveTo(width - 8 - cornerLen, 8);
    esquina.lineTo(width - 8, 8);
    esquina.lineTo(width - 8, 8 + cornerLen);
    esquina.strokePath();
    // Inferior izquierda
    esquina.beginPath();
    esquina.moveTo(8, height - 8 - cornerLen);
    esquina.lineTo(8, height - 8);
    esquina.lineTo(8 + cornerLen, height - 8);
    esquina.strokePath();
    // Inferior derecha
    esquina.beginPath();
    esquina.moveTo(width - 8 - cornerLen, height - 8);
    esquina.lineTo(width - 8, height - 8);
    esquina.lineTo(width - 8, height - 8 - cornerLen);
    esquina.strokePath();
  }

  /** Título del nivel en la parte superior centrado. */
  private crearTitulo(width: number): void {
    this.add
      .text(width / 2, 18, '♪ RITMO ♪', {
        fontFamily: '"Press Start 2P"',
        fontSize: '20px',
        color: '#00ffff',
        shadow: {
          offsetX: 0,
          offsetY: 0,
          color: '#00ffff',
          blur: 8,
          fill: true,
        },
      })
      .setOrigin(0.5, 0)
      .setDepth(1000)
      .setAlpha(0.9);
  }

  /** Texto de instrucción centrado que aparece antes de que arranque el juego. */
  private crearInstruccion(width: number): void {
    const { height } = this.scale;
    const instruccion = this.add
      .text(width / 2, height / 2, 'LAS NOTAS CAEN POR EL CENTRO\nCUANDO LLEGUEN A LA LINEA\nPRESIONA ESPACIO', {
        fontFamily: '"Press Start 2P"',
        fontSize: '11px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 10,
        shadow: {
          offsetX: 0,
          offsetY: 0,
          color: '#ff44cc',
          blur: 6,
          fill: true,
        },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(1001)
      .setAlpha(1);

    // Se desvanece cuando el juego arranca (tras 5 segundos).
    this.time.delayedCall(4500, () => {
      this.tweens.add({
        targets: instruccion,
        alpha: 0,
        duration: 400,
        onComplete: () => instruccion.destroy(),
      });
    });
  }

  /** Crea la línea de acierto con glow intenso, partículas y animaciones. */
  private crearLineaAcierto(width: number): void {
    // Glow externo muy amplio (halo difuso).
    this.add
      .rectangle(this.laneX, this.hitLineY, width, 28, 0x00e5ff)
      .setAlpha(0.08)
      .setDepth(0);
    // Glow medio.
    this.add
      .rectangle(this.laneX, this.hitLineY, width, 14, 0x00e5ff)
      .setAlpha(0.25)
      .setDepth(1);
    // Glow cercano.
    this.add
      .rectangle(this.laneX, this.hitLineY, width, 6, 0x00ffff)
      .setAlpha(0.5)
      .setDepth(1);
    // Línea central brillante.
    const linea = this.add
      .sprite(this.laneX, this.hitLineY, KEY_TEXTURA)
      .setDisplaySize(width, 3)
      .setTint(0x00ffff);
    linea.setDepth(2);
    this.spritesTintables.push(linea);

    // Pulso de la línea (breath animation).
    this.tweens.add({
      targets: linea,
      alpha: { from: 1, to: 0.6 },
      displayHeight: { from: 3, to: 5 },
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Partículas principales — cuadraditos cyan flotando sobre la línea.
    this.add.particles(0, 0, KEY_TEXTURA, {
      x: { min: 0, max: width },
      y: { min: this.hitLineY - 8, max: this.hitLineY + 8 },
      lifespan: 1000,
      speed: { min: 30, max: 80 },
      angle: { min: 160, max: 200 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: 0x00e5ff,
      frequency: 40,
      quantity: 2,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(3);

    // Partículas secundarias — magenta/rosa más lentas.
    this.add.particles(0, 0, KEY_TEXTURA, {
      x: { min: 0, max: width },
      y: { min: this.hitLineY - 12, max: this.hitLineY + 12 },
      lifespan: 1800,
      speed: { min: 10, max: 30 },
      angle: { min: 250, max: 290 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.6, end: 0 },
      tint: 0xff44cc,
      frequency: 120,
      quantity: 1,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(3);

    // Chispas rápidas que se elevan desde la línea.
    this.add.particles(0, 0, KEY_TEXTURA, {
      x: { min: this.laneX - 140, max: this.laneX + 140 },
      y: this.hitLineY,
      lifespan: 600,
      speed: { min: 40, max: 100 },
      angle: { min: 250, max: 290 },
      scale: { start: 0.2, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xffffff,
      frequency: 200,
      quantity: 1,
      blendMode: Phaser.BlendModes.ADD,
    }).setDepth(4);
  }

  /** Agrega decoración ambiental animada (partículas de fondo + efectos). */
  private crearDecoracionAnimada(width: number, height: number): void {
    // Partículas ambientales lentas cayendo por toda la pantalla (como polvo/estrellas).
    this.add.particles(0, 0, KEY_TEXTURA, {
      x: { min: 0, max: width },
      y: -10,
      lifespan: 6000,
      speed: { min: 10, max: 25 },
      angle: { min: 85, max: 95 },
      scale: { start: 0.15, end: 0.05 },
      alpha: { start: 0.3, end: 0 },
      tint: 0x00e5ff,
      frequency: 300,
      quantity: 1,
    }).setDepth(-4);

    // Partículas magenta ambientales más escasas.
    this.add.particles(0, 0, KEY_TEXTURA, {
      x: { min: 0, max: width },
      y: -10,
      lifespan: 8000,
      speed: { min: 5, max: 15 },
      angle: { min: 80, max: 100 },
      scale: { start: 0.1, end: 0 },
      alpha: { start: 0.2, end: 0 },
      tint: 0xff44cc,
      frequency: 500,
      quantity: 1,
    }).setDepth(-4);

    // Pulso de luz en el centro cada cierto tiempo (como un latido rítmico).
    const pulso = this.add
      .circle(this.laneX, this.hitLineY, 60, 0x00ffff, 0)
      .setDepth(-3);
    this.tweens.add({
      targets: pulso,
      alpha: { from: 0, to: 0.12 },
      scale: { from: 0.5, to: 1.5 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Líneas horizontales que parpadean suavemente a los costados.
    // Solo en la zona media, sin tocar los bordes de la pantalla.
    const lados = this.add.graphics().setDepth(-3);
    lados.lineStyle(1, 0x00e5ff, 0.15);
    const anchoCarril = 340;
    const izq = this.laneX - anchoCarril / 2;
    const der = this.laneX + anchoCarril / 2;
    for (let i = 0; i < 3; i++) {
      const y = height * 0.35 + i * (height * 0.15);
      // Solo dibujar lejos de los bordes (dejar 50px de margen).
      lados.beginPath();
      lados.moveTo(50, y);
      lados.lineTo(izq - 40, y);
      lados.strokePath();
      lados.beginPath();
      lados.moveTo(der + 40, y);
      lados.lineTo(width - 50, y);
      lados.strokePath();
    }
    this.tweens.add({
      targets: lados,
      alpha: { from: 0.3, to: 0.8 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Ecualizador animado a ambos lados (barras que suben/bajan).
    const numBarras = 8;
    const barraAncho = 4;
    const barraGap = 6;
    const eqBaseY = height * 0.7;
    const colores = [0x00ffff, 0x00e5ff, 0xff44cc, 0x00ffff, 0xff44cc, 0x00e5ff, 0x00ffff, 0xff44cc];

    for (let i = 0; i < numBarras; i++) {
      const color = colores[i % colores.length] as number;
      // Lado izquierdo
      const barraIzq = this.add
        .rectangle(
          30 + i * (barraAncho + barraGap),
          eqBaseY,
          barraAncho,
          10,
          color
        )
        .setOrigin(0, 1)
        .setAlpha(0.5)
        .setDepth(-2);
      this.tweens.add({
        targets: barraIzq,
        displayHeight: { from: 10, to: 20 + Math.random() * 40 },
        duration: 300 + Math.random() * 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 80,
      });

      // Lado derecho (espejado)
      const barraDer = this.add
        .rectangle(
          width - 30 - i * (barraAncho + barraGap),
          eqBaseY,
          barraAncho,
          10,
          color
        )
        .setOrigin(1, 1)
        .setAlpha(0.5)
        .setDepth(-2);
      this.tweens.add({
        targets: barraDer,
        displayHeight: { from: 10, to: 20 + Math.random() * 40 },
        duration: 300 + Math.random() * 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: i * 80 + 100,
      });
    }
  }

  /** Crea todos los sprites de beats usando las notas individuales. */
  private crearBeats(): void {
    // Verificar si al menos una nota cargó.
    const notasCargadas = NOTAS_KEYS.filter(k => this.textures.exists(k));
    const usarNotas = notasCargadas.length > 0;

    // Ancho del carril para randomizar posiciones.
    const anchoCarril = 340;

    this.beats = this.tiemposBeat.map((tiempoObjetivo, i) => {
      // Posición X aleatoria dentro del carril.
      const offsetX = (Math.random() - 0.5) * (anchoCarril - 60);

      let sprite: Phaser.GameObjects.Sprite;
      if (usarNotas) {
        const key = notasCargadas[i % notasCargadas.length] as string;
        sprite = this.add
          .sprite(this.laneX + offsetX, this.spawnY, key)
          .setDisplaySize(40, 40)
          .setVisible(false);
      } else {
        // Fallback al placeholder si ninguna nota cargó.
        sprite = this.add
          .sprite(this.laneX + offsetX, this.spawnY, KEY_TEXTURA)
          .setDisplaySize(30, 30)
          .setTint(0xffffff)
          .setVisible(false);
      }
      sprite.setDepth(10);
      return { sprite, tiempoObjetivo, juzgada: false, offsetX };
    });
  }

  /** Crea el HUD profesional estilo arcade neón — compacto. */
  private crearHud(): void {
    const valorStyle = {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#ffffff',
      shadow: {
        offsetX: 0,
        offsetY: 0,
        color: '#00ffff',
        blur: 6,
        fill: true,
      },
    };
    const labelStyle = {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#ff44cc',
    };

    // ACIERTOS
    this.add.text(20, 48, 'ACIERTOS', labelStyle).setScrollFactor(0).setDepth(1000);
    this.hudAciertos = this.add.text(20, 60, '0000', valorStyle).setScrollFactor(0).setDepth(1000);

    // FALLOS
    this.add.text(20, 90, 'FALLOS', labelStyle).setScrollFactor(0).setDepth(1000);
    this.hudFallos = this.add.text(20, 102, '0000', valorStyle).setScrollFactor(0).setDepth(1000);

    // TIEMPO
    this.add.text(20, 132, 'TIEMPO', labelStyle).setScrollFactor(0).setDepth(1000);
    this.hudTiempo = this.add.text(20, 144, '00:40', valorStyle).setScrollFactor(0).setDepth(1000);
  }

  /**
   * Muestra el personaje seleccionado como decoración al costado izquierdo,
   * más chico, sobre la línea de acierto. Reacciona al acertar con Jump.
   */
  private crearPersonajeDecorativo(_width: number, _height: number): void {
    const idPersonaje = this.game.registry.get(CLAVE_PERSONAJE) as string | null;
    if (!idPersonaje) return;

    const keyIdle = `${idPersonaje}_idle`;
    if (!this.textures.exists(keyIdle)) return;

    // Crear animación idle.
    const animKey = `${idPersonaje}_idle_anim_ritmo`;
    if (!this.anims.exists(animKey)) {
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(keyIdle, { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1,
      });
    }

    // Crear animación de Jump para reacción al acierto (8 frames).
    const keyJump = `${idPersonaje}_jump`;
    const animJumpKey = `${idPersonaje}_jump_ritmo`;
    if (this.textures.exists(keyJump) && !this.anims.exists(animJumpKey)) {
      this.anims.create({
        key: animJumpKey,
        frames: this.anims.generateFrameNumbers(keyJump, { start: 0, end: 7 }),
        frameRate: 16,
        repeat: 0,
      });
    }

    // Posición: bien a la izquierda, separado del carril.
    const posX = 80;
    const posY = this.hitLineY - 10;

    this.personajeDeco = this.add
      .sprite(posX, posY, keyIdle)
      .setScale(2.5)
      .setAlpha(0.9)
      .setDepth(5);
    this.personajeDeco.play(animKey);
  }

  /**
   * Reacción del personaje al acertar: solo un flash breve, sin saltos ni explosiones.
   */
  private reaccionPersonajeAcierto(): void {
    if (!this.personajeDeco) return;

    // Solo flash de brillo momentáneo — sin saltos ni scale.
    this.personajeDeco.setAlpha(1);
    this.time.delayedCall(150, () => {
      this.personajeDeco?.setAlpha(0.9);
    });
  }

  /**
   * Desplaza cada beat no juzgado hacia la línea según el tiempo transcurrido.
   * Los beats no pulsados que rebasan la ventana se dan por perdidos (no cuentan
   * como fallo — el fallo solo surge de una pulsación fuera de ventana,
   * Requirement 2.3).
   */
  private actualizarBeats(transcurrido: number): void {
    for (const beat of this.beats) {
      if (beat.juzgada) continue;

      const restante = beat.tiempoObjetivo - transcurrido;

      // Aún no debe aparecer.
      if (restante > LEAD_TIME_MS) {
        beat.sprite.setVisible(false);
        continue;
      }

      // Rebasó la ventana sin ser pulsado: se pierde (sin registrar fallo).
      if (restante < -VENTANA_ACIERTO_MS) {
        beat.sprite.setVisible(false);
        beat.juzgada = true;
        continue;
      }

      const progreso = 1 - restante / LEAD_TIME_MS; // 0 en spawn, 1 en la línea
      beat.sprite.setVisible(true);
      beat.sprite.y = this.spawnY + (this.hitLineY - this.spawnY) * progreso;

      // Posición X aleatoria preasignada + oscilación lateral suave (wobble).
      const wobble = Math.sin(transcurrido * 0.004 + beat.tiempoObjetivo) * 6;
      beat.sprite.x = this.laneX + beat.offsetX + wobble;

      // Rotación sutil.
      beat.sprite.rotation = Math.sin(transcurrido * 0.003 + beat.tiempoObjetivo) * 0.15;

      // Scale pulsante leve (late mientras cae).
      const pulse = 1 + Math.sin(transcurrido * 0.008 + beat.tiempoObjetivo) * 0.08;
      beat.sprite.setScale(pulse);
    }
  }

  /**
   * Evalúa las pulsaciones del frame: acción primaria (acierto/fallo,
   * Requirements 2.2, 2.3) y acción secundaria (curiosidad).
   */
  private evaluarEntrada(transcurrido: number): void {
    const input = this.entradaInput;
    if (!input) return;

    if (input.accionPrimariaJustPressed()) {
      this.procesarPulsacion(transcurrido);
    }

    // Curiosidad: exploración de la acción secundaria (acotada al tope).
    if (
      input.accionSecundariaJustPressed() &&
      this.curiosidadSenal < CURIOSIDAD_MAX
    ) {
      this.curiosidadSenal += 1;
    }
  }

  /**
   * Procesa una pulsación de la acción primaria: busca el beat no juzgado más
   * cercano dentro de la ventana de acierto. Si existe, registra ACIERTO
   * (Requirement 2.2) y, si el timing fue ajustado, suma a Riesgo. Si no hay
   * ningún beat en ventana, registra FALLO (Requirement 2.3).
   */
  private procesarPulsacion(transcurrido: number): void {
    let mejor: Beat | null = null;
    let mejorAbs = Infinity;

    for (const beat of this.beats) {
      if (beat.juzgada) continue;
      const abs = Math.abs(transcurrido - beat.tiempoObjetivo);
      if (abs <= VENTANA_ACIERTO_MS && abs < mejorAbs) {
        mejor = beat;
        mejorAbs = abs;
      }
    }

    if (mejor) {
      mejor.juzgada = true;
      mejor.sprite.setVisible(false);
      this.aciertos += 1;
      // Timing ajustado/tardío = intento arriesgado (Riesgo).
      if (mejorAbs > UMBRAL_AJUSTADO_MS) {
        this.riesgoSenal += 1;
      }
      // Efecto visual de explosión en la posición del beat.
      this.efectoAcierto(mejor.sprite.x, mejor.sprite.y);
      // Reacción del personaje decorativo al acertar.
      this.reaccionPersonajeAcierto();
      sfxRhythmHit();
    } else {
      // Pulsación fuera de la ventana de todo beat (Requirement 2.3).
      this.fallos += 1;
      // Flash rojo sutil en la línea al fallar.
      this.efectoFallo();
      sfxRhythmMiss();
    }
  }

  /** Explosión de partículas al acertar un beat. */
  private efectoAcierto(x: number, y: number): void {
    // Burst de partículas cyan/blancas desde la posición del beat.
    const emitter = this.add.particles(x, y, KEY_TEXTURA, {
      speed: { min: 80, max: 200 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0x00ffff, 0xffffff, 0x00e5ff],
      lifespan: 400,
      quantity: 8,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter.setDepth(15);
    emitter.explode(8);
    // Limpiar el emitter después de que terminen las partículas.
    this.time.delayedCall(500, () => emitter.destroy());

    // Flash circular momentáneo.
    const flash = this.add
      .circle(x, y, 20, 0x00ffff, 0.6)
      .setDepth(14)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2,
      duration: 200,
      onComplete: () => flash.destroy(),
    });
  }

  /** Flash rojo en la línea al fallar. */
  private efectoFallo(): void {
    const flash = this.add
      .rectangle(this.laneX, this.hitLineY, this.scale.width, 6, 0xff2222)
      .setAlpha(0.6)
      .setDepth(14)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 150,
      onComplete: () => flash.destroy(),
    });
  }

  /** Refresca los valores del HUD. */
  private actualizarHud(transcurrido: number): void {
    const restanteS = Math.max(
      0,
      Math.ceil((this.duracionMs - transcurrido) / 1000)
    );
    const minutos = Math.floor(restanteS / 60);
    const segundos = restanteS % 60;
    const tiempoStr = `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;

    this.hudAciertos?.setText(String(this.aciertos).padStart(4, '0'));
    this.hudFallos?.setText(String(this.fallos).padStart(4, '0'));
    this.hudTiempo?.setText(tiempoStr);
  }

  /**
   * Finaliza la sesión una sola vez: emite la telemetría (Requirements 2.6, 9.1)
   * y solicita al Shell el retorno al Nivel_Plataformas (Requirement 2.4).
   *
   * Si el Shell no está cableado (Task 11), registra la transición por consola en
   * lugar de romper.
   */
  private finalizar(): void {
    if (this.finalizado) return;
    this.finalizado = true;

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

    this.add.text(w / 2, h * 0.3, `NIVEL RITMO\nCOMPLETADO!`, {
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
        console.info('[NivelRitmo] Sin Shell: retorno a plataformas.', telemetria);
      }
    });
  }
}
