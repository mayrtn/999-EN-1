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
} from '../contrato';
import {
  SistemaMutacion,
  GestorAudioPhaser,
  OverlayTextoPhaser,
  crearCapaClima,
  asegurarTexturaParticula,
} from '../mutacion';

/** Duración mínima de la sesión (Requirement 3.1), en milisegundos. */
const DURACION_MIN_MS = 60_000;
/** Duración máxima de la sesión (Requirement 3.1), en milisegundos. */
const DURACION_MAX_MS = 90_000;
/** Duración por defecto si no se configura otra (dentro de `[60000,90000]`). */
const DURACION_DEFECTO_MS = 75_000;

/** Velocidad de desplazamiento de la mira, en píxeles por segundo. */
const VELOCIDAD_MIRA = 420;

/** Lado del objetivo cuadrado placeholder, en píxeles. */
const LADO_OBJETIVO = 40;
/** Lado de la textura de mira placeholder, en píxeles. */
const LADO_MIRA = 36;

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
}

/**
 * Opciones de construcción del {@link NivelShooter} (principalmente para tests
 * y ajustes finos). La duración se acota siempre a `[60000, 90000]`.
 */
export interface NivelShooterOpciones {
  /** Duración de la sesión en ms; se acota a `[60000, 90000]` (Requirement 3.1). */
  duracionMs?: number;
}

/**
 * Nivel_Shooter: shooter de galería fija que respeta el Contrato_Compartido
 * (Requirement 3).
 */
export class NivelShooter extends Phaser.Scene implements IEscena {
  /** Identidad lógica de la Escena (Requirement 9). */
  readonly id = 'shooter' as const;

  /** Duración efectiva de la sesión, acotada a `[60000, 90000]` (Requirement 3.1). */
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
  private gestorAudio?: GestorAudioPhaser;
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
   * Acota una duración propuesta al rango válido `[60000, 90000]` ms
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
   * Genera las texturas placeholder (Fase 1): un objetivo cuadrado y una mira en
   * cruz. No se cargan assets reales.
   */
  preload(): void {
    this.generarTexturaObjetivo();
    this.generarTexturaMira();
  }

  /**
   * Construye la galería: fondo, mira, colaboradores de mutación, aplica las
   * perillas y arranca los temporizadores de spawn y de fin de sesión
   * (Requirements 3.1, 3.5, 3.6).
   */
  create(): void {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor('#141422');

    // Mira centrada al inicio (Requirement 3.2).
    this.mira = this.add
      .sprite(width / 2, height / 2, KEY_TEX_MIRA)
      .setDepth(PROFUNDIDAD_MIRA);

    // Colaboradores de mutación (Requirement 7).
    this.gestorAudio = new GestorAudioPhaser(this);
    this.overlayTexto = new OverlayTextoPhaser(this);

    // Aplica las perillas recibidas, si las hay (Requirements 3.6, 9.4).
    if (this.perillas) {
      this.aplicarPerillas(this.perillas);
    }

    // Temporizador de aparición de objetivos, según intensidad.
    this.programarSpawn();

    // Fin de sesión tras la duración configurada (Requirements 3.1, 3.5).
    this.timerFin = this.time.delayedCall(this.duracionMs, () => this.finalizar());
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

    // El input just-pressed exige actualizar una vez por frame (contrato de
    // InputTeclado). El método `update()` es propio del binding concreto y no
    // forma parte de InputUnificado, por lo que se invoca de forma defensiva.
    (this.inputUnificado as { update?: () => void } | undefined)?.update?.();

    this.moverMira(deltaMs);
    this.procesarDisparo();
    this.moverObjetivos(deltaMs);
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
    this.objetivos = [];
    this.totalObjetivos = 0;
    this.objetivosDestruidos = 0;
    this.disparos = 0;
    this.impactos = 0;
    this.impactosRapidos = 0;
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

      // Impacto confirmado (Requirement 3.4).
      this.impactos += 1;
      this.objetivosDestruidos += 1;

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

  /** Retira el objetivo en el índice indicado y destruye su sprite. */
  private removerObjetivo(indice: number): void {
    const objetivo = this.objetivos[indice];
    if (!objetivo) return;
    objetivo.sprite.destroy();
    this.objetivos.splice(indice, 1);
  }

  /**
   * Programa la aparición periódica de objetivos. El intervalo se acorta con la
   * intensidad (más densidad → aparición más frecuente, Requirement 7.2).
   */
  private programarSpawn(): void {
    this.timerSpawn?.remove(false);
    // Intensidad alta → intervalo más corto (mínimo 250 ms).
    const factor = 1 - Phaser.Math.Clamp(this.intensidad, 0, 1) * 0.7;
    const intervalo = Math.max(250, INTERVALO_SPAWN_BASE_MS * factor);

    this.timerSpawn = this.time.addEvent({
      delay: intervalo,
      loop: true,
      callback: () => this.aparecerObjetivo(),
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
    const y = Phaser.Math.Between(LADO_OBJETIVO, height - LADO_OBJETIVO);

    const velocidad =
      VELOCIDAD_OBJETIVO_BASE *
      (1 + Phaser.Math.Clamp(this.agresividad, 0, 1) * 2) *
      (desdeIzquierda ? 1 : -1);

    const sprite = this.add
      .sprite(x, y, KEY_TEX_OBJETIVO)
      .setDepth(PROFUNDIDAD_OBJETIVO);

    // Mantiene el tinte de paleta activo, si ya se aplicaron perillas.
    if (this.perillas) {
      const color = this.mira?.tintTopLeft;
      if (typeof color === 'number') sprite.setTint(color);
    }

    this.objetivos.push({
      sprite,
      velocidadX: velocidad,
      aparicionMs: this.time.now,
    });
    this.totalObjetivos += 1;
  }

  /** Muestra un destello temporal en la posición del disparo (feedback visual). */
  private mostrarDestelloDisparo(x: number, y: number): void {
    const destello = this.add
      .circle(x, y, 6, 0xfff27a)
      .setDepth(PROFUNDIDAD_DISPARO);
    this.tweens.add({
      targets: destello,
      alpha: 0,
      scale: 2,
      duration: 160,
      onComplete: () => destello.destroy(),
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

    const telemetria = this.construirTelemetria();

    if (this.shell) {
      // Reporta la telemetría y solicita el retorno (Requirements 3.5, 3.7, 8.3).
      this.shell.reportarTelemetria(telemetria);
      this.shell.solicitarTransicion('plataformas');
    } else {
      // Sin Shell aún: registra la transición en vez de fallar (Task 11).
      // eslint-disable-next-line no-console
      console.info(
        '[NivelShooter] sesión finalizada; retorno a "plataformas" (Shell no cableado).',
        telemetria
      );
    }
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
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const c = LADO_MIRA / 2;
    g.lineStyle(2, 0xffffff, 1);
    g.strokeCircle(c, c, c - 2);
    g.lineBetween(c, 0, c, LADO_MIRA);
    g.lineBetween(0, c, LADO_MIRA, c);
    g.generateTexture(KEY_TEX_MIRA, LADO_MIRA, LADO_MIRA);
    g.destroy();
  }
}
