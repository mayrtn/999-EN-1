/**
 * Sistema_Mutacion — orquestador que aplica las Perillas_Mutacion a una Escena
 * (Requirement 7).
 *
 * Implementa {@link ISistemaMutacion.aplicar}: transforma el mundo de la Escena
 * reutilizando los sprites existentes (sin arte nuevo, Requirement 7.7) a partir
 * de un {@link ContextoMutacion} que la propia Escena arma con sus referencias
 * (sprites, capa de clima, spawner, audio, overlay).
 *
 * Cada perilla se traduce a un mecanismo concreto:
 * - `paleta` → `setTint()` sobre cada sprite tintable (Requirements 7.1, 7.7).
 * - `intensidad_enemigos` → densidad de spawn vía el spawner (Requirement 7.2).
 * - `agresividad` → IA de enemigos vía el spawner (Requirement 7.3).
 * - `clima` → arranque/paro/reconfiguración del emisor de partículas
 *   (Requirement 7.4).
 * - `mood_musica` → selección de pista vía el {@link GestorAudio} (Requirement 7.5).
 * - `mensaje` → overlay temporal vía el {@link OverlayTexto} (Requirement 7.6).
 *
 * Este componente es un **orquestador**: no construye los colaboradores
 * concretos (GestorAudio, OverlayTexto, emisores de partículas); los consume a
 * través del contrato. La construcción concreta vive en otra tarea del módulo.
 *
 * El método es **defensivo**: no arroja si el arreglo de sprites está vacío, si
 * el spawner es `undefined`, si la capa de clima es nula o si algún colaborador
 * no expone el método esperado.
 *
 * @module mutacion/sistemaMutacion
 * @see Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import type Phaser from 'phaser';
import type {
  PerillasMutacion,
  ContextoMutacion,
  ISistemaMutacion,
  Paleta,
  Clima,
} from '../contrato';

/**
 * Mapa `paleta → color de tinte` aplicado con `setTint()` sobre los sprites
 * existentes (Requirements 7.1, 7.7).
 *
 * Los tintes reutilizan los mismos sprites sin requerir arte nuevo por variante:
 * cada valor es un color RGB de 24 bits (formato `0xRRGGBB`) que Phaser multiplica
 * sobre la textura original.
 *
 * - `infierno`: rojo incandescente.
 * - `sueno`: violeta suave y onírico.
 * - `neon`: verde/cian eléctrico.
 * - `hostil`: verde enfermizo y amenazante.
 *
 * El mapa fino exacto de colores queda `[PENDIENTE — Documento_Decisiones]`
 * (Requirement 12.3); estos valores son una decisión sensata que no bloquea la
 * implementación.
 */
export const TINTES_POR_PALETA: Record<Paleta, number> = {
  infierno: 0xff3b1f,
  sueno: 0xb388ff,
  neon: 0x1fffd1,
  hostil: 0x7bd634,
};

/**
 * Sistema_Mutacion: aplica cada Perilla_Mutacion a una Escena reutilizando los
 * sprites existentes (Requirement 7).
 *
 * Orquesta los colaboradores del {@link ContextoMutacion} sin conocer sus
 * implementaciones concretas: depende solo del Contrato_Compartido.
 */
export class SistemaMutacion implements ISistemaMutacion {
  /**
   * Aplica el conjunto completo de perillas a la Escena.
   *
   * Es defensivo por diseño: cada mutación se aplica solo si su colaborador está
   * presente y expone el método esperado, de modo que un contexto parcial (sin
   * spawner, sin capa de clima, con arreglo de sprites vacío) nunca provoque una
   * excepción (Requirements 7.1–7.6).
   *
   * @param _scene Escena Phaser en curso. El contexto ya trae las referencias
   *   necesarias, por lo que la escena no se usa directamente aquí; se mantiene
   *   en la firma para respetar {@link ISistemaMutacion} y habilitar usos futuros.
   * @param perillas Perillas del conjunto cerrado a aplicar.
   * @param ctx Contexto con las referencias de la Escena (sprites, clima,
   *   spawner, audio, overlay).
   */
  aplicar(
    _scene: Phaser.Scene,
    perillas: PerillasMutacion,
    ctx: ContextoMutacion
  ): void {
    this.aplicarPaleta(perillas.paleta, ctx);
    this.aplicarEnemigos(perillas.intensidad_enemigos, perillas.agresividad, ctx);
    this.aplicarClima(perillas.clima, ctx);
    this.aplicarMood(perillas.mood_musica, ctx);
    this.aplicarMensaje(perillas.mensaje, ctx);
  }

  /**
   * Aplica la paleta como tinte de color sobre cada sprite tintable
   * (Requirements 7.1, 7.7). Reutiliza los sprites existentes: solo multiplica el
   * color, sin sustituir texturas.
   */
  private aplicarPaleta(paleta: Paleta, ctx: ContextoMutacion): void {
    const color = TINTES_POR_PALETA[paleta];
    const sprites = ctx.spritesTintables;
    if (!Array.isArray(sprites)) return;

    for (const sprite of sprites) {
      // Guarda defensiva: algún elemento podría no exponer setTint.
      if (sprite && typeof sprite.setTint === 'function') {
        sprite.setTint(color);
      }
    }
  }

  /**
   * Ajusta densidad (`intensidad_enemigos`) y comportamiento (`agresividad`) de
   * los enemigos a través del spawner opcional (Requirements 7.2, 7.3).
   *
   * Si la Escena no expone un spawner, no hace nada (algunas escenas —ritmo—
   * pueden no tener enemigos).
   */
  private aplicarEnemigos(
    intensidad: number,
    agresividad: number,
    ctx: ContextoMutacion
  ): void {
    const spawner = ctx.spawnerEnemigos;
    if (!spawner) return;

    if (typeof spawner.ajustarIntensidad === 'function') {
      spawner.ajustarIntensidad(intensidad);
    }
    if (typeof spawner.ajustarAgresividad === 'function') {
      spawner.ajustarAgresividad(agresividad);
    }
  }

  /**
   * Configura la capa de clima (emisor de partículas) según la perilla `clima`
   * (Requirement 7.4).
   *
   * El emisor concreto (tipo de partícula, textura, velocidad) lo construye la
   * Escena/otro helper; aquí solo se arranca, se detiene o se reconfigura de forma
   * genérica:
   * - `'ninguno'`: detiene la emisión.
   * - cualquier otro clima: arranca la emisión.
   *
   * Defensivo: si la capa de clima es nula o no expone `start`/`stop`, no hace nada.
   */
  private aplicarClima(clima: Clima, ctx: ContextoMutacion): void {
    const capa = ctx.capaClima;
    if (!capa) return;

    if (clima === 'ninguno') {
      if (typeof capa.stop === 'function') {
        capa.stop();
      }
      return;
    }

    // Reactiva la emisión para climas con partículas (lluvia, brasas, niebla).
    if (typeof capa.start === 'function') {
      capa.start();
    }
  }

  /**
   * Selecciona la pista de música correspondiente al `mood_musica`
   * (Requirement 7.5) a través del {@link GestorAudio}.
   *
   * Defensivo: no hace nada si el gestor no está presente o no expone
   * `reproducirMood`.
   */
  private aplicarMood(
    mood: PerillasMutacion['mood_musica'],
    ctx: ContextoMutacion
  ): void {
    const audio = ctx.audio;
    if (audio && typeof audio.reproducirMood === 'function') {
      audio.reproducirMood(mood);
    }
  }

  /**
   * Muestra el `mensaje` corto de la IA como overlay temporal al iniciar la
   * Escena (Requirement 7.6) a través del {@link OverlayTexto}.
   *
   * Defensivo: no hace nada si el overlay no está presente o no expone `mostrar`.
   */
  private aplicarMensaje(mensaje: string, ctx: ContextoMutacion): void {
    const overlay = ctx.overlayTexto;
    if (overlay && typeof overlay.mostrar === 'function') {
      overlay.mostrar(mensaje);
    }
  }
}
