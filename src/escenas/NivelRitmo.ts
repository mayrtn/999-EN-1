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
 *   ({@link NivelRitmo.duracionMs} acotada a `[60000, 90000]`), gobernada por el
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
 * Fase 1 — arte placeholder: todos los objetos visuales se generan en runtime a
 * partir de una textura blanca mínima (sin assets reales).
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

/** Duración mínima de la sesión en ms (Requirement 2.1). */
const DURACION_MIN_MS = 60000;
/** Duración máxima de la sesión en ms (Requirement 2.1). */
const DURACION_MAX_MS = 90000;
/** Duración por defecto en ms, dentro del rango `[60000, 90000]`. */
const DURACION_DEFECTO_MS = 75000;

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

/** Key de la textura blanca placeholder generada en runtime (Fase 1). */
const KEY_TEXTURA = 'ritmo_px';

/** Estado interno de un beat de la línea temporal. */
interface Beat {
  /** Sprite tintable que representa la nota (arte placeholder). */
  sprite: Phaser.GameObjects.Sprite;
  /** Instante objetivo (ms desde el inicio) en que la nota alcanza la línea. */
  tiempoObjetivo: number;
  /** `true` cuando ya fue acertada o se dio por perdida (no se re-evalúa). */
  juzgada: boolean;
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

  /** Duración de la sesión, acotada a `[60000, 90000]` ms (Requirement 2.1). */
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
  private hud: Phaser.GameObjects.Text | null = null;

  /**
   * @param duracionMs Duración deseada de la sesión; se acota al rango válido
   *   `[60000, 90000]` (Requirement 2.1). Por defecto {@link DURACION_DEFECTO_MS}.
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

  /** Sin assets externos en Fase 1; las texturas se generan en `create()`. */
  preload(): void {
    // No-op: arte placeholder generado en runtime.
  }

  /**
   * Construye la escena: pista, línea de acierto, beats, HUD y colaboradores de
   * mutación; luego aplica las Perillas_Mutacion recibidas (Requirements 2.5, 9.4).
   */
  create(): void {
    this.asegurarTextura();

    const { width, height } = this.scale;
    this.laneX = width / 2;
    this.hitLineY = height - 90;
    this.spawnY = -20;

    this.dibujarFondo(width, height);
    this.crearLineaAcierto(width);
    this.crearBeats();
    this.crearHud();

    // Colaboradores concretos del Sistema_Mutacion.
    this.audio = new GestorAudioPhaser(this);
    this.overlay = new OverlayTextoPhaser(this);

    // Marca de inicio de sesión (Requirement 2.1).
    this.tiempoInicio = this.time.now;

    // Aplica las perillas resueltas por el Shell (Requirements 2.5, 9.4).
    this.aplicarPerillas(this.perillasIniciales);
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
   * Genera los instantes objetivo de los beats de forma determinista a partir de
   * la duración de la sesión.
   */
  private generarTiemposBeat(): number[] {
    const tiempos: number[] = [];
    const limite = this.duracionMs - MARGEN_FINAL_MS;
    for (let t = PRIMER_BEAT_MS; t <= limite; t += INTERVALO_BEAT_MS) {
      tiempos.push(t);
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

  /** Fondo sólido oscuro para contraste del arte placeholder. */
  private dibujarFondo(width: number, height: number): void {
    this.add
      .rectangle(0, 0, width, height, 0x0b0b12)
      .setOrigin(0, 0)
      .setDepth(-10);
  }

  /** Crea la línea de acierto como sprite tintable ancho y fino. */
  private crearLineaAcierto(width: number): void {
    const linea = this.add
      .sprite(this.laneX, this.hitLineY, KEY_TEXTURA)
      .setDisplaySize(width, 6)
      .setTint(0xffffff);
    this.spritesTintables.push(linea);
  }

  /** Crea todos los sprites de beats (invisibles hasta entrar en pantalla). */
  private crearBeats(): void {
    this.beats = this.tiemposBeat.map((tiempoObjetivo) => {
      const sprite = this.add
        .sprite(this.laneX, this.spawnY, KEY_TEXTURA)
        .setDisplaySize(30, 30)
        .setVisible(false);
      this.spritesTintables.push(sprite);
      return { sprite, tiempoObjetivo, juzgada: false };
    });
  }

  /** Crea el HUD de aciertos/fallos/tiempo. */
  private crearHud(): void {
    this.hud = this.add
      .text(12, 12, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#7cf9ff',
      })
      .setScrollFactor(0)
      .setDepth(1000);
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
    } else {
      // Pulsación fuera de la ventana de todo beat (Requirement 2.3).
      this.fallos += 1;
    }
  }

  /** Refresca el HUD con el estado actual de la sesión. */
  private actualizarHud(transcurrido: number): void {
    if (!this.hud) return;
    const restanteS = Math.max(
      0,
      Math.ceil((this.duracionMs - transcurrido) / 1000)
    );
    this.hud.setText(
      `RITMO  aciertos:${this.aciertos}  fallos:${this.fallos}  t:${restanteS}s`
    );
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

    const telemetria = this.construirTelemetria();

    if (this.shell) {
      this.shell.reportarTelemetria(telemetria);
      this.shell.solicitarTransicion('plataformas');
    } else {
      // Degradación con gracia sin Shell (Task 11 cableará el Shell real).
      // eslint-disable-next-line no-console
      console.info(
        '[NivelRitmo] Sin Shell: retorno a plataformas.',
        telemetria
      );
    }
  }
}
