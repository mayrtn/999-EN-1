/**
 * Escena_Carreras — tercer nivel oculto OPCIONAL de género carreras.
 *
 * Escena de Phaser 3 que implementa el {@link IEscena} del Contrato_Compartido.
 * Presenta una sesión de carrera pseudo-3D corta (60–90 segundos) con generación
 * procedural de pista, midiendo los cuatro rasgos de personalidad (Furia,
 * Curiosidad, Logro, Riesgo) a través de acciones de carrera.
 *
 * ## Integración con el Contrato_Compartido
 *
 * Se registra en el {@link REGISTRO_ESCENAS} y funciona sin modificar el Shell
 * ni el Motor_Scoring (Requirement 9.7). Declara sus rasgos vía
 * {@link declararRasgos}, consume InputUnificado y PerillasMutacion igual que
 * las demás escenas.
 *
 * @module escenas/EscenaCarreras
 * @see Requirement 7 — Integración con el Contrato Compartido.
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
  asegurarTexturaParticula,
} from '../mutacion';
import { mostrarPanelIA } from '../mutacion/panelIA';
import { sfxHit } from '../audio/sfx';
import { CLAVE_PERSONAJE } from './EscenaSeleccion';
import { TrackGenerator } from './carreras/TrackGenerator';
import { ScoringManager } from './carreras/ScoringManager';
import { SpawnerRivalesCarreras } from './carreras/SpawnerRivalesCarreras';
import { Renderer } from './carreras/Renderer';
import {
  VELOCIDAD_BASE,
  VELOCIDAD_MAXIMA,
  UMBRAL_ALTA_VELOCIDAD,
  MARGEN_PASADA_AL_RAS,
  CARRILES,
  DURACION_DEFECTO_MS,
} from './carreras/constantes';
import {
  aplicarColision,
  moverLateral,
  clampDuracion,
} from './carreras/fisicaVehiculo';
import type { PistaGenerada } from './carreras/tipos';

// ─── Perillas por defecto ────────────────────────────────────────────────────

/** Perillas por defecto usadas si la escena corre sin Shell (standalone). */
const perillasDefault: PerillasMutacion = {
  paleta: 'neon',
  intensidad_enemigos: 0.5,
  agresividad: 0.5,
  clima: 'ninguno',
  mood_musica: 'calma',
  mensaje: '',
};

// ─── Clase EscenaCarreras ────────────────────────────────────────────────────

/**
 * Escena_Carreras: implementación conforme al Contrato_Compartido.
 *
 * Orquesta los subsistemas internos (TrackGenerator, ScoringManager,
 * SpawnerRivalesCarreras) y gestiona el estado de la sesión de carrera.
 *
 * Requirements: 7.1, 7.2, 7.3, 1.1
 */
export class EscenaCarreras extends Phaser.Scene implements IEscena {
  /** Identidad lógica de la escena (Contrato_Compartido). */
  readonly id: EscenaId = 'carreras';

  // ─── Contrato_Compartido ─────────────────────────────────────────────────

  /** Fachada del Shell inyectada en init(); permite redirigir o reportar. */
  private shell: IShell | null = null;

  /** Input unificado inyectado por el Shell. */
  private entradaInput: InputUnificado | null = null;

  /** Perillas de mutación recibidas al inicio de la escena. */
  private perillasIniciales: PerillasMutacion = perillasDefault;

  // ─── Subsistemas (inicializados en create()) ─────────────────────────────

  /** Generador procedural de pista. */
  private trackGenerator: TrackGenerator | null = null;

  /** Manager de scoring/medición de rasgos. */
  private scoringManager: ScoringManager | null = null;

  /** Spawner de rivales controlados por IA. */
  private spawnerRivales: SpawnerRivalesCarreras | null = null;

  /** Renderer pseudo-3D de la pista y sprites. */
  private rendererCarreras: Renderer | null = null;

  // ─── Mutación (Requirement 7, 8) ────────────────────────────────────────

  /** Sistema_Mutacion que aplica las perillas (Requirement 7). */
  private readonly sistemaMutacion = new SistemaMutacion();

  /** Gestor de audio para el mood musical (Requirement 8.5). */
  private gestorAudio?: GestorAudioPhaser;

  /** Overlay de texto para el mensaje de la IA (Requirement 8.6). */
  private overlayTexto?: OverlayTextoPhaser;

  /** Emisor de partículas para el clima (Requirement 8.4). */
  private capaClima?: Phaser.GameObjects.Particles.ParticleEmitter;

  // ─── Estado de sesión ────────────────────────────────────────────────────

  /** Velocidad instantánea del Vehiculo_Jugador. */
  private velocidadActual: number = VELOCIDAD_BASE;

  /** Carril actual del vehículo (rango [-2..2] para 5 carriles). */
  private posicionLateral: number = 0;

  /** Milisegundos restantes del Temporizador_Sesion. */
  private temporizadorMs: number = DURACION_DEFECTO_MS;

  /** Distancia total recorrida durante la sesión. */
  private distanciaRecorrida: number = 0;

  /** Índice del segmento de pista en el que se encuentra el jugador. */
  private segmentoActual: number = 0;

  /** Indica si el jugador está transitando una Ruta_Alternativa. */
  private enRutaAlternativa: boolean = false;

  /** Indica si el boost temporal está activo. */
  private boostActivo: boolean = false;

  /** Milisegundos restantes de cooldown antes de poder activar boost nuevamente. */
  private boostCooldownMs: number = 0;

  /** Indica si la sesión ha finalizado. */
  private finalizado: boolean = false;

  // ─── HUD ─────────────────────────────────────────────────────────────────

  /** Texto HUD que muestra el tiempo restante de sesión. */
  private hudTemporizador: Phaser.GameObjects.Text | null = null;

  /** Texto HUD que muestra la velocidad actual del vehículo. */
  private hudVelocidad: Phaser.GameObjects.Text | null = null;

  // ─── Pista Generada ──────────────────────────────────────────────────────

  /** Resultado de la generación procedural de pista. */
  private pistaGenerada: PistaGenerada | null = null;

  // ─── Tracking de eventos (para evitar dobles registros) ──────────────────

  /** Distancias acumuladas por segmento para calcular índice de segmento actual. */
  private segmentosDistanciaAcumulada: number[] = [];

  /** Checkpoints ya alcanzados (por índice de segmento). */
  private checkpointsAlcanzados: Set<number> = new Set();

  /** Bifurcaciones ya tomadas (por índice de segmento). */
  private bifurcacionesTomadas: Set<number> = new Set();

  /** Rivales ya adelantados (por id de rival). */
  private rivalesAdelantados: Set<number> = new Set();

  /** Cooldown para cambio de carril (evita saltar múltiples carriles por frame). */
  private lateralCooldownMs: number = 0;

  /** Cantidad de choques con rivales. */
  private choques: number = 0;

  /** Cantidad de rivales esquivados. */
  private esquivados: number = 0;

  /** Flag: esperando que termine la descripción antes de arrancar gameplay. */
  private esperandoInicio: boolean = true;

  // ─── Constructor ─────────────────────────────────────────────────────────

  constructor() {
    super({ key: 'carreras' });
  }

  // ─── Ciclo de vida: init() ───────────────────────────────────────────────

  /**
   * Recibe los datos de inicio del Shell antes de `create()` (Requirement 7.2).
   *
   * Almacena las PerillasMutacion, la referencia al Shell y el InputUnificado.
   * Reinicia el estado de sesión para permitir reutilización de la instancia.
   *
   * @param datos - Datos de inicio proporcionados por el Shell
   */
  init(datos: DatosInicioEscena): void {
    this.shell = datos?.shell ?? null;
    this.entradaInput = datos?.input ?? this.entradaInput;
    this.perillasIniciales = datos?.perillas ?? perillasDefault;

    // Reinicio de estado de sesión (la instancia puede reutilizarse).
    this.velocidadActual = VELOCIDAD_BASE;
    this.posicionLateral = 0;
    this.temporizadorMs = DURACION_DEFECTO_MS;
    this.distanciaRecorrida = 0;
    this.segmentoActual = 0;
    this.enRutaAlternativa = false;
    this.boostActivo = false;
    this.boostCooldownMs = 0;
    this.finalizado = false;
    this.lateralCooldownMs = 0;
    this.choques = 0;
    this.esquivados = 0;
    this.esperandoInicio = true;
    this.segmentosDistanciaAcumulada = [];
    this.checkpointsAlcanzados = new Set();
    this.bifurcacionesTomadas = new Set();
    this.rivalesAdelantados = new Set();

    // Subsistemas se reinician (serán creados en create())
    this.trackGenerator = null;
    this.scoringManager = null;
    this.spawnerRivales = null;
    this.rendererCarreras = null;
    this.pistaGenerada = null;
    this.hudTemporizador = null;
    this.hudVelocidad = null;
    this.gestorAudio = undefined;
    this.overlayTexto = undefined;
    this.capaClima = undefined;
  }

  // ─── Ciclo de vida: preload() ────────────────────────────────────────────

  /**
   * Carga assets para la escena de carreras (Requirement 9.1, 9.5).
   *
   * Carga assets placeholder para el vehículo, rivales, pista y obstáculos.
   * Si los assets específicos no existen, se generarán texturas en create()
   * mediante generateTexture.
   */
  preload(): void {
    // Auto del jugador
    this.load.image('vehiculo_jugador', 'src/assets/items/Autos/Car.png');
    // Rivales (5 variantes que se alternan)
    this.load.image('rival_1', 'src/assets/items/Autos/Mark 1 series (1) - copia.png');
    this.load.image('rival_2', 'src/assets/items/Autos/Mark 1 series (1).png');
    this.load.image('rival_3', 'src/assets/items/Autos/Mark 1 series (2) - copia.png');
    this.load.image('rival_4', 'src/assets/items/Autos/Mark 1 series (3) - copia.png');
    this.load.image('rival_5', 'src/assets/items/Autos/Mark 1 series (4) - copia.png');
    // Decoración
    this.load.image('arbol', 'src/assets/items/Arbol.png');
    this.load.image('arbusto', 'src/assets/items/Arbusto.png');
    this.load.image('obstaculo_sprite', 'src/assets/items/dynamite.png');
  }

  // ─── Ciclo de vida: create() ─────────────────────────────────────────────

  /**
   * Construye la escena: genera pista, configura subsistemas, crea HUD e inicia
   * el temporizador de sesión.
   *
   * Requirements: 1.1, 2.1, 2.2, 8.1, 8.4, 8.5, 8.6, 9.3, 9.4
   */
  create(): void {
    // Validación de personaje seleccionado (Requirements 4.3, 4.4).
    const idPersonaje = this.game.registry.get(CLAVE_PERSONAJE) as string | null;
    if (!idPersonaje || !['pink_monster', 'owlet_monster', 'dude_monster'].includes(idPersonaje)) {
      if (this.shell) {
        this.shell.solicitarTransicion('seleccion_personaje');
      } else {
        // eslint-disable-next-line no-console
        console.warn('[EscenaCarreras] Sin personaje seleccionado y sin Shell: no se puede redirigir.');
      }
      return;
    }

    // ─── 1. Instanciar subsistemas ───────────────────────────────────────────
    this.trackGenerator = new TrackGenerator();
    this.scoringManager = new ScoringManager();
    this.spawnerRivales = new SpawnerRivalesCarreras();

    // ─── 2. Generar pista procedural ─────────────────────────────────────────
    const semilla = Date.now();
    const duracion = clampDuracion(DURACION_DEFECTO_MS);
    this.pistaGenerada = this.trackGenerator.generar(semilla, duracion);

    // ─── 3. Inicializar ScoringManager con la pista generada ─────────────────
    this.scoringManager.inicializar(this.pistaGenerada, duracion);

    // ─── 4. Configurar SpawnerRivalesCarreras con perillas iniciales ─────────
    this.spawnerRivales.ajustarIntensidad(this.perillasIniciales.intensidad_enemigos);
    this.spawnerRivales.ajustarAgresividad(this.perillasIniciales.agresividad);

    // Spawn initial rival so there's something from the start
    const rivalInicial = this.spawnerRivales.forzarSpawn();
    if (rivalInicial) {
      rivalInicial.distancia = 450; // Start from the very top
    }

    // ─── 4b. Inicializar subsistemas de mutación ─────────────────────────────
    asegurarTexturaParticula(this);
    this.gestorAudio = new GestorAudioPhaser(this);
    this.overlayTexto = new OverlayTextoPhaser(this);
    this.rendererCarreras = new Renderer(this);
    this.rendererCarreras.inicializar();

    // ─── 5. Aplicar perillas iniciales via SistemaMutacion ───────────────────
    this.aplicarPerillas(this.perillasIniciales);

    // ─── 6. Crear HUD (temporizador + velocidad) ──────────────────────────
    const hudStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Press Start 2P"',
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    };

    // Temporizador — ya se muestra en el panel izquierdo, no duplicar arriba a la derecha
    this.hudTemporizador = null;

    // Velocidad (top-center)
    this.hudVelocidad = this.add.text(
      this.scale.width / 2,
      12,
      `${Math.round(this.velocidadActual)} km/h`,
      { ...hudStyle, fontSize: '13px', color: '#7cf9ff' },
    );
    this.hudVelocidad.setOrigin(0.5, 0);
    this.hudVelocidad.setDepth(50);

    // HUD panel IZQUIERDO — CHOQUES y ESQUIVADOS
    const labelStyle = { fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ff4444', stroke: '#000000', strokeThickness: 2 };
    const valStyle = { fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 };

    this.add.text(16, 40, 'CHOQUES', labelStyle).setDepth(50);
    this.add.text(16, 54, '000', valStyle).setDepth(50).setName('hud_choques');
    this.add.text(16, 74, 'ESQUIVADOS', { ...labelStyle, color: '#44ff44' }).setDepth(50);
    this.add.text(16, 88, '000', valStyle).setDepth(50).setName('hud_esquivados');

    // TIEMPO en panel izquierdo
    this.add.text(16, 108, 'TIEMPO', labelStyle).setDepth(50);
    this.add.text(16, 122, '00:40', valStyle).setDepth(50).setName('hud_tiempo_panel');

    // ─── 7. Iniciar Temporizador_Sesion ──────────────────────────────────────
    this.temporizadorMs = clampDuracion(DURACION_DEFECTO_MS);

    // ─── 8. Generar texturas de vehículos (formas geométricas claras) ───────
    // Vehículo del jugador: rectángulo verde con ventana
    if (!this.textures.exists('vehiculo_jugador')) {
      const gfx = this.add.graphics();
      // Cuerpo del coche
      gfx.fillStyle(0x00cc44, 1);
      gfx.fillRect(4, 8, 24, 40);
      // Cabina/ventana
      gfx.fillStyle(0x88ffaa, 1);
      gfx.fillRect(8, 14, 16, 12);
      // Ruedas
      gfx.fillStyle(0x222222, 1);
      gfx.fillRect(2, 10, 4, 10);
      gfx.fillRect(26, 10, 4, 10);
      gfx.fillRect(2, 34, 4, 10);
      gfx.fillRect(26, 34, 4, 10);
      gfx.generateTexture('vehiculo_jugador', 32, 48);
      gfx.destroy();
    }

    // Rival: rectángulo rojo con ventana
    if (!this.textures.exists('rival_sprite')) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0xcc2222, 1);
      gfx.fillRect(4, 8, 24, 40);
      gfx.fillStyle(0xff8888, 1);
      gfx.fillRect(8, 14, 16, 12);
      gfx.fillStyle(0x222222, 1);
      gfx.fillRect(2, 10, 4, 10);
      gfx.fillRect(26, 10, 4, 10);
      gfx.fillRect(2, 34, 4, 10);
      gfx.fillRect(26, 34, 4, 10);
      gfx.generateTexture('rival_sprite', 32, 48);
      gfx.destroy();
    }

    // Obstáculo: triángulo amarillo (cono de peligro)
    if (!this.textures.exists('obstaculo_sprite')) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0xffcc00, 1);
      gfx.fillTriangle(16, 0, 0, 32, 32, 32);
      gfx.fillStyle(0x000000, 1);
      gfx.fillRect(14, 12, 4, 12);
      gfx.generateTexture('obstaculo_sprite', 32, 32);
      gfx.destroy();
    }

    // ─── 9. Instrucciones al inicio (juego no empieza hasta que terminen) ──
    this.esperandoInicio = true;
    const { width, height } = this.scale;

    // Título
    this.add.text(width / 2, height * 0.25, 'CARRERAS', {
      fontFamily: '"Press Start 2P"',
      fontSize: '16px',
      color: '#7cf9ff',
      shadow: { offsetX: 0, offsetY: 0, color: '#7cf9ff', blur: 8, fill: true },
    }).setOrigin(0.5).setDepth(101).setName('titulo_carreras');

    // Descripción
    const instruccion = this.add.text(width / 2, height / 2, [
      'ESQUIVA LOS AUTOS QUE VIENEN',
      'USA ← → PARA CAMBIAR DE CARRIL',
      '',
      'LA VELOCIDAD AUMENTA CON EL TIEMPO',
      '¡NO TE CHOQUES!',
    ].join('\n'), {
      fontFamily: '"Press Start 2P"',
      fontSize: '10px',
      color: '#ffffff',
      align: 'center',
      lineSpacing: 10,
      shadow: { offsetX: 0, offsetY: 0, color: '#7cf9ff', blur: 6, fill: true },
    }).setOrigin(0.5).setDepth(101);

    // Después de 5 segundos: desvanece instrucciones y arranca el juego
    this.time.delayedCall(5000, () => {
      this.esperandoInicio = false;
      this.tweens.add({
        targets: instruccion,
        alpha: 0,
        duration: 400,
        onComplete: () => instruccion.destroy(),
      });
      const titulo = this.children.getByName('titulo_carreras');
      if (titulo) {
        this.tweens.add({
          targets: titulo,
          alpha: 0,
          duration: 400,
          onComplete: () => titulo.destroy(),
        });
      }
    });
  }

  // ─── Ciclo de vida: update() ─────────────────────────────────────────────

  /**
   * Bucle principal de gameplay por frame.
   *
   * Lee InputUnificado, actualiza física del vehículo, gestiona boost,
   * avanza segmentos, spawns rivales, detecta colisiones/pasadas al ras/
   * checkpoints/bifurcaciones/adelantamientos, acumula scoring, decrementa
   * temporizador y finaliza la sesión al expirar.
   *
   * Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.3, 2.4,
   * 3.2, 4.3, 5.3, 5.4, 6.2, 6.3, 7.3, 7.5, 11.1, 11.2, 11.3, 11.4, 11.5
   */
  override update(_tiempo: number, deltaMs: number): void {
    if (this.finalizado) return;

    // During waiting period: still render the road background but don't run gameplay
    if (this.esperandoInicio) {
      if (this.rendererCarreras && this.pistaGenerada) {
        this.rendererCarreras.renderizarFrame({
          velocidadActual: 30,
          posicionLateral: this.posicionLateral,
          distanciaRecorrida: this.distanciaRecorrida += 0.3,
          segmentoActual: 0,
          rivalesActivos: [],
          obstaculos: [],
          boostActivo: false,
        });
      }
      return;
    }

    // Guard: no update sin subsistemas inicializados.
    if (!this.trackGenerator || !this.scoringManager || !this.spawnerRivales) return;
    if (!this.entradaInput) return;
    if (!this.pistaGenerada) return;

    const input = this.entradaInput;
    const dir = input.direccion();
    const maxCarril = Math.floor(CARRILES / 2); // 2 for 5 lanes → [-2..2]

    // ─── 1. Auto-aceleración (el auto acelera solo, cada vez más rápido) ───

    // Speed increases gradually over time (faster as session progresses)
    const tiempoTranscurrido = clampDuracion(DURACION_DEFECTO_MS) - this.temporizadorMs;
    const factorTiempo = Math.min(tiempoTranscurrido / 60000, 1); // 0 to 1 over 60s
    const velocidadObjetivo = VELOCIDAD_BASE + (VELOCIDAD_MAXIMA - VELOCIDAD_BASE) * factorTiempo;

    // Suavemente acercar la velocidad al objetivo
    if (this.velocidadActual < velocidadObjetivo) {
      this.velocidadActual = Math.min(this.velocidadActual + 0.5, velocidadObjetivo);
    }

    // Velocidad efectiva
    const velocidadEfectiva = this.velocidadActual;

    // ─── 2. Actualizar posición lateral (solo izquierda/derecha) ──────────

    if (this.lateralCooldownMs > 0) {
      this.lateralCooldownMs -= deltaMs;
    }

    const direccionLateral = Math.sign(dir.x); // -1, 0, or +1
    if (direccionLateral !== 0 && this.lateralCooldownMs <= 0) {
      this.posicionLateral = moverLateral(this.posicionLateral, direccionLateral, maxCarril);
      this.lateralCooldownMs = 150; // 150ms entre cambios de carril
    }

    // ─── 4. Acumular distancia y avanzar segmento ─────────────────────────

    const deltaSeg = deltaMs / 1000;
    this.distanciaRecorrida += velocidadEfectiva * deltaSeg;

    // Compute current segment from cumulative distances
    if (this.segmentosDistanciaAcumulada.length === 0 && this.pistaGenerada.segmentos.length > 0) {
      let acumulado = 0;
      for (const seg of this.pistaGenerada.segmentos) {
        acumulado += seg.longitud;
        this.segmentosDistanciaAcumulada.push(acumulado);
      }
    }

    // Find current segment index based on distance
    let nuevoSegmento = this.segmentoActual;
    for (let i = this.segmentoActual; i < this.segmentosDistanciaAcumulada.length; i++) {
      const distAcum = this.segmentosDistanciaAcumulada[i] ?? Infinity;
      if (this.distanciaRecorrida < distAcum) {
        nuevoSegmento = i;
        break;
      }
      // If past all segments, stay on last
      if (i === this.segmentosDistanciaAcumulada.length - 1) {
        nuevoSegmento = i;
      }
    }
    this.segmentoActual = nuevoSegmento;

    // ─── 5. Spawn rivales via SpawnerRivalesCarreras ──────────────────────

    const segActual = this.pistaGenerada.segmentos[this.segmentoActual];
    if (segActual) {
      this.spawnerRivales.spawnear(segActual);
    }

    // ─── 6. Actualizar rivales (mover) ────────────────────────────────────

    this.spawnerRivales.actualizarRivales(deltaMs, velocidadEfectiva);

    // ─── 7. Detectar colisiones con rivales (embestida) (Requirement 1.7, 3.2) ──

    const rivalesActivos = this.spawnerRivales.obtenerRivalesActivos();
    const DISTANCIA_COLISION = 80; // Colisión cuando el rival está cerca pero no encima
    const PENALIZACION_COLISION = 50;

    for (const rival of rivalesActivos) {
      const mismoCarril = rival.carril === (this.posicionLateral + maxCarril); // rival.carril is [0, CARRILES-1]
      const cercano = rival.distancia > 0 && rival.distancia < DISTANCIA_COLISION;

      if (mismoCarril && cercano) {
        // Colisión → embestida
        this.scoringManager.registrarEmbestida();
        this.velocidadActual = aplicarColision(this.velocidadActual, PENALIZACION_COLISION);
        rival.activo = false;
        this.choques += 1;

        // Efecto visual: camera shake + flash rojo + partículas de colisión
        this.cameras.main.shake(300, 0.015);
        this.cameras.main.flash(200, 255, 50, 0, false);
        sfxHit();

        // Partículas de partes volando
        const px = this.scale.width / 2 + this.posicionLateral * (this.scale.width * 0.45 / CARRILES);
        const py = this.scale.height - 100;
        for (let p = 0; p < 6; p++) {
          const part = this.add.rectangle(
            px + (Math.random() - 0.5) * 20,
            py,
            6 + Math.random() * 6,
            4 + Math.random() * 4,
            Phaser.Display.Color.RandomRGB().color,
          );
          part.setDepth(20);
          this.tweens.add({
            targets: part,
            x: part.x + (Math.random() - 0.5) * 150,
            y: part.y - 50 - Math.random() * 100,
            alpha: 0,
            angle: Math.random() * 360,
            duration: 600 + Math.random() * 400,
            onComplete: () => part.destroy(),
          });
        }
      }
    }

    // ─── 8. Detectar pasadas al ras (Requirement 6.3) ────────────────────

    for (const rival of rivalesActivos) {
      if (!rival.activo) continue;
      const carrilRival = rival.carril;
      const carrilJugador = this.posicionLateral + maxCarril; // Normalize to [0, CARRILES-1]
      const distanciaLateral = Math.abs(carrilRival - carrilJugador);
      const cercanoZ = Math.abs(rival.distancia) < MARGEN_PASADA_AL_RAS;

      // Near-miss: adjacent lane and close Z distance, but NOT same lane (not collision)
      if (distanciaLateral === 1 && cercanoZ) {
        this.scoringManager.registrarPasadaAlRas();
      }
    }

    // ─── 9. Detectar checkpoints alcanzados (Requirement 5.3) ─────────────

    if (segActual && segActual.tieneCheckpoint && !this.checkpointsAlcanzados.has(this.segmentoActual)) {
      this.checkpointsAlcanzados.add(this.segmentoActual);
      this.scoringManager.registrarCheckpoint();
    }

    // ─── 10. Detectar rutas alternativas tomadas (Requirement 4.3) ────────

    if (segActual && segActual.bifurcacion && !this.bifurcacionesTomadas.has(this.segmentoActual)) {
      // Player takes alternative route if they are on a non-center lane
      if (this.posicionLateral !== 0) {
        this.bifurcacionesTomadas.add(this.segmentoActual);
        this.enRutaAlternativa = true;
        this.scoringManager.registrarRutaAlternativa();
      }
    } else if (segActual && !segActual.bifurcacion) {
      this.enRutaAlternativa = false;
    }

    // ─── 11. Detectar adelantamientos de rivales (Requirement 5.4) ────────

    for (const rival of this.spawnerRivales.obtenerRivalesActivos()) {
      // A rival is "overtaken" when their distance goes negative (passed behind player)
      if (rival.distancia < 0 && !this.rivalesAdelantados.has(rival.id)) {
        this.rivalesAdelantados.add(rival.id);
        this.scoringManager.registrarAdelantar();
        this.esquivados += 1;
      }
    }

    // ─── 12. Acumular velocidad alta en ScoringManager (Requirement 6.2) ──

    this.scoringManager.acumularVelocidadAlta(
      deltaMs,
      velocidadEfectiva,
      VELOCIDAD_MAXIMA,
      UMBRAL_ALTA_VELOCIDAD,
    );

    // ─── 13. Decrementar temporizador ─────────────────────────────────────

    this.temporizadorMs -= deltaMs;

    // ─── 14. Renderizar frame (pista pseudo-3D, vehículo, rivales) ────────

    if (this.rendererCarreras) {
      this.rendererCarreras.renderizarFrame({
        velocidadActual: velocidadEfectiva,
        posicionLateral: this.posicionLateral,
        distanciaRecorrida: this.distanciaRecorrida,
        segmentoActual: this.segmentoActual,
        rivalesActivos: this.spawnerRivales.obtenerRivalesActivos(),
        obstaculos: [],
        boostActivo: this.boostActivo,
      });
    }

    // ─── 15. Actualizar HUD ───────────────────────────────────────────────

    const tiempoRestanteSeg = Math.max(0, Math.ceil(this.temporizadorMs / 1000));
    this.hudTemporizador?.setText(`⏱ ${tiempoRestanteSeg}s`);
    this.hudVelocidad?.setText(`${Math.round(velocidadEfectiva)} km/h`);

    // Flash timer when low
    if (tiempoRestanteSeg <= 10 && this.hudTemporizador) {
      const flash = Math.floor(Date.now() / 500) % 2 === 0;
      this.hudTemporizador.setColor(flash ? '#ff4444' : '#ffffff');
    }

    // Update panel HUD
    const hudChoques = this.children.getByName('hud_choques') as Phaser.GameObjects.Text | null;
    const hudEsquivados = this.children.getByName('hud_esquivados') as Phaser.GameObjects.Text | null;
    const hudTiempoPanel = this.children.getByName('hud_tiempo_panel') as Phaser.GameObjects.Text | null;
    if (hudChoques) hudChoques.setText(String(this.choques).padStart(3, '0'));
    if (hudEsquivados) hudEsquivados.setText(String(this.esquivados).padStart(3, '0'));
    if (hudTiempoPanel) {
      const min = Math.floor(tiempoRestanteSeg / 60);
      const sec = tiempoRestanteSeg % 60;
      hudTiempoPanel.setText(`${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
    }

    // ─── 15. Finalizar sesión al expirar temporizador (Requirement 2.3, 7.5) ──

    if (this.temporizadorMs <= 0 && !this.finalizado) {
      this.finalizado = true;
      this.mostrarResultadosYSalir();
    }
  }

  // ─── IEscena: setInput ───────────────────────────────────────────────────

  /** Inyecta el input unificado (Requirements 9.5, 9.6). */
  setInput(input: InputUnificado): void {
    this.entradaInput = input;
  }

  // ─── IEscena: declararRasgos ─────────────────────────────────────────────

  /**
   * Declara los topes de oportunidad por Rasgo (Requirements 3.1, 4.1, 5.1, 6.1).
   * Delega al ScoringManager que calcula las oportunidades a partir de la pista generada.
   */
  declararRasgos(): DeclaracionRasgos {
    if (this.scoringManager) {
      return this.scoringManager.declararRasgos();
    }
    // Fallback si no hay scoring manager (escena no inicializada aún)
    return {
      oportunidadMaxima: {
        furia: 0,
        curiosidad: 0,
        logro: 0,
        riesgo: 0,
      },
    };
  }

  // ─── IEscena: aplicarPerillas ────────────────────────────────────────────

  /** Aplica las Perillas_Mutacion (Requirements 2.5, 3.6, 8.1–8.7, 9.4).
   *
   * Arma el {@link ContextoMutacion} con las referencias propias de la escena
   * (sprites tintables del Renderer, capa de clima, SpawnerRivalesCarreras,
   * gestor de audio y overlay) y delega en el {@link SistemaMutacion}.
   * Reutiliza sprites existentes sin requerir arte adicional (Requirement 8.7).
   */
  aplicarPerillas(perillas: PerillasMutacion): void {
    this.perillasIniciales = perillas;

    // Panel visual dramático para la demo (delay para no solaparse con instrucciones)
    // Solo mostrar si la IA real se invocó (no es la primera escena)
    if (this.game.registry.get('ya_jugo_escena') === true) {
      mostrarPanelIA(this, perillas, 5000);
    }
    this.game.registry.set('ya_jugo_escena', true);

    // Ajustar spawner con intensidad y agresividad (Requirements 8.2, 8.3).
    if (this.spawnerRivales) {
      this.spawnerRivales.ajustarIntensidad(perillas.intensidad_enemigos);
      this.spawnerRivales.ajustarAgresividad(perillas.agresividad);
    }

    // Aplicar tinte de paleta vía Renderer sobre pista, vehículo, rivales (Requirement 8.1).
    if (this.rendererCarreras) {
      this.rendererCarreras.aplicarTinte(perillas.paleta);
    }

    // Si los colaboradores de mutación no están listos (llamada temprana), salir.
    if (!this.gestorAudio || !this.overlayTexto) return;

    // Crear/actualizar capa de clima con partículas (Requirement 8.4).
    // Si es 'ninguno', crearCapaClima retorna null; se crea emisor vacío como
    // placeholder para satisfacer el contrato no-nulo de ContextoMutacion.
    this.capaClima =
      crearCapaClima(this, perillas.clima) ?? this.crearEmisorVacio();

    // Sprites tintables: recopilar los que el Renderer expone (Requirement 8.7).
    const spritesTintables: Phaser.GameObjects.Sprite[] = [];

    // Armar ContextoMutacion y delegar al SistemaMutacion (Requirements 8.1–8.6).
    const ctx: ContextoMutacion = {
      spritesTintables,
      capaClima: this.capaClima,
      spawnerEnemigos: this.spawnerRivales ?? undefined,
      audio: this.gestorAudio,
      overlayTexto: this.overlayTexto,
    };

    this.sistemaMutacion.aplicar(this, perillas, ctx);
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

  // ─── IEscena: construirTelemetria ────────────────────────────────────────

  /**
   * Construye la TelemetriaRasgos al finalizar la sesión (Requirements 3.3, 4.4, 5.5, 6.4, 7.4).
   * Delega al ScoringManager que acumula señales y oportunidades durante la carrera.
   */
  construirTelemetria(): TelemetriaRasgos {
    // Delegar al scoringManager cuando esté inicializado.
    if (this.scoringManager) {
      return this.scoringManager.construirTelemetria();
    }
    return {
      escena: 'carreras',
      porRasgo: {
        furia: { senal: 0, oportunidad: 0 },
        curiosidad: { senal: 0, oportunidad: 0 },
        logro: { senal: 0, oportunidad: 0 },
        riesgo: { senal: 0, oportunidad: 0 },
      },
    };
  }

  // ─── Helpers internos (estado de sesión) ─────────────────────────────────

  /**
   * Retorna un snapshot de solo lectura del estado de sesión actual.
   * Útil para el HUD, tests y debugging.
   */
  obtenerEstadoSesion(): Readonly<{
    velocidadActual: number;
    posicionLateral: number;
    temporizadorMs: number;
    distanciaRecorrida: number;
    segmentoActual: number;
    enRutaAlternativa: boolean;
    boostActivo: boolean;
    boostCooldownMs: number;
    finalizado: boolean;
  }> {
    return {
      velocidadActual: this.velocidadActual,
      posicionLateral: this.posicionLateral,
      temporizadorMs: this.temporizadorMs,
      distanciaRecorrida: this.distanciaRecorrida,
      segmentoActual: this.segmentoActual,
      enRutaAlternativa: this.enRutaAlternativa,
      boostActivo: this.boostActivo,
      boostCooldownMs: this.boostCooldownMs,
      finalizado: this.finalizado,
    };
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

    this.add.text(w / 2, h * 0.3, `NIVEL CARRERAS\nCOMPLETADO!`, {
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
        console.info('[EscenaCarreras] sesión finalizada; retorno a "plataformas" (Shell no cableado).', telemetria);
      }
    });
  }
}
