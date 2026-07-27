/**
 * Música sintetizada por mood — generación procedural con Web Audio API.
 *
 * Produce loops musicales en tiempo real para cada `MoodMusica` del conjunto
 * cerrado (`calma`, `epico`, `tenso`, `furioso`) sin archivos de audio externos.
 * Cada mood tiene un patrón armónico, rítmico y tímbrico distinto que refuerza
 * la atmósfera de la mutación (Requirement 7.5).
 *
 * Diseño: cada "pista" es un conjunto de osciladores y nodos de ganancia
 * configurados en un patrón loopeado con `setValueAtTime` / ramps. El loop se
 * reconstruye cada ciclo usando un `setInterval` sincronizado.
 *
 * @module audio/musicaSintetizada
 */

import type { GestorAudio, MoodMusica } from '../contrato';

/** Duración de un ciclo de loop en segundos por mood. */
const DURACION_CICLO: Record<MoodMusica, number> = {
  calma: 4.0,
  epico: 2.0,
  tenso: 1.5,
  furioso: 1.0,
};

/** Volumen maestro (evita saturación). */
const VOLUMEN_MAESTRO = 0.12;

/** Duración del crossfade en ms. */
const CROSSFADE_MS = 600;

/**
 * Contexto de audio compartido (singleton lazy). Se crea al primer uso y se
 * resume ante interacción del usuario (política de autoplay de navegadores).
 */
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// ---------------------------------------------------------------------------
// Patrones musicales por mood
// ---------------------------------------------------------------------------

/** Notas MIDI → frecuencia Hz. */
function midiAHz(nota: number): number {
  return 440 * Math.pow(2, (nota - 69) / 12);
}

/** Secuencia de notas (MIDI) para cada mood. */
const SECUENCIAS: Record<MoodMusica, number[]> = {
  // Am pentatónica relajada, notas largas
  calma: [57, 60, 64, 67, 69, 72, 69, 64],
  // Do mayor heroico, ritmo marcado
  epico: [60, 64, 67, 72, 71, 67, 64, 60],
  // Dm disminuido, tensión ascendente
  tenso: [62, 65, 68, 71, 74, 71, 68, 65],
  // Em agresivo, octavas rápidas
  furioso: [52, 64, 55, 67, 57, 69, 60, 72],
};

/** Tipo de onda por mood para el oscilador melódico. */
const ONDAS: Record<MoodMusica, OscillatorType> = {
  calma: 'sine',
  epico: 'triangle',
  tenso: 'sawtooth',
  furioso: 'square',
};

/**
 * Estado de una pista activa: nodos de audio y handle del loop.
 */
interface PistaActiva {
  ganancia: GainNode;
  intervalId: ReturnType<typeof setInterval>;
  mood: MoodMusica;
}

/**
 * Inicia un ciclo melódico para el mood dado, conectado al nodo de ganancia
 * provisto. Retorna el intervalId para poder detenerlo.
 */
function iniciarCiclo(
  ctx: AudioContext,
  mood: MoodMusica,
  ganancia: GainNode,
): ReturnType<typeof setInterval> {
  const secuencia = SECUENCIAS[mood];
  const duracionCiclo = DURACION_CICLO[mood];
  const duracionNota = duracionCiclo / secuencia.length;
  const onda = ONDAS[mood];

  function tocarCiclo(): void {
    const ahora = ctx.currentTime;
    for (let i = 0; i < secuencia.length; i++) {
      const osc = ctx.createOscillator();
      const notaGain = ctx.createGain();
      osc.connect(notaGain);
      notaGain.connect(ganancia);

      osc.type = onda;
      const freq = midiAHz(secuencia[i]!);
      const inicio = ahora + i * duracionNota;
      const fin = inicio + duracionNota * 0.85;

      osc.frequency.setValueAtTime(freq, inicio);
      notaGain.gain.setValueAtTime(0.001, inicio);
      notaGain.gain.linearRampToValueAtTime(1.0, inicio + 0.02);
      notaGain.gain.setValueAtTime(1.0, fin - 0.03);
      notaGain.gain.linearRampToValueAtTime(0.001, fin);

      osc.start(inicio);
      osc.stop(fin + 0.01);
    }

    // Capa de bajo (sub-octava) para dar cuerpo
    if (mood !== 'calma') {
      const bajo = ctx.createOscillator();
      const bajoGain = ctx.createGain();
      bajo.connect(bajoGain);
      bajoGain.connect(ganancia);
      bajo.type = 'sine';
      const freqBajo = midiAHz(secuencia[0]! - 12);
      bajo.frequency.setValueAtTime(freqBajo, ahora);
      bajoGain.gain.setValueAtTime(0.6, ahora);
      bajoGain.gain.linearRampToValueAtTime(0.001, ahora + duracionCiclo * 0.9);
      bajo.start(ahora);
      bajo.stop(ahora + duracionCiclo);
    }

    // Capa de pad/drone para el mood tenso y furioso
    if (mood === 'tenso' || mood === 'furioso') {
      const drone = ctx.createOscillator();
      const droneGain = ctx.createGain();
      drone.connect(droneGain);
      droneGain.connect(ganancia);
      drone.type = 'sawtooth';
      drone.frequency.setValueAtTime(midiAHz(secuencia[0]! - 5), ahora);
      droneGain.gain.setValueAtTime(0.2, ahora);
      droneGain.gain.linearRampToValueAtTime(0.001, ahora + duracionCiclo);
      drone.start(ahora);
      drone.stop(ahora + duracionCiclo);
    }
  }

  // Tocar inmediatamente y luego repetir cada ciclo
  tocarCiclo();
  return setInterval(tocarCiclo, duracionCiclo * 1000);
}

// ---------------------------------------------------------------------------
// GestorAudioSintetizado — implementación de GestorAudio sin archivos
// ---------------------------------------------------------------------------

/**
 * Implementación de {@link GestorAudio} que genera música procedural con Web
 * Audio API en lugar de reproducir archivos de audio (Requirement 7.5).
 *
 * Soporta crossfade entre moods: al cambiar de mood, la pista saliente baja su
 * volumen gradualmente mientras la entrante sube. Si Web Audio no está
 * disponible (entorno sin soporte), degrada a no-op sin romper.
 *
 * Uso: instanciar una vez por Escena (o reutilizar entre escenas). Llamar
 * `reproducirMood(mood)` al aplicar las perillas de mutación.
 */
export class GestorAudioSintetizado implements GestorAudio {
  private pistaActiva: PistaActiva | null = null;

  /**
   * Reproduce la pista sintetizada del mood indicado con crossfade desde la
   * pista actual (Requirement 7.5).
   *
   * Si el mood ya está activo, no hace nada. Si Web Audio no está disponible,
   * degrada a no-op.
   */
  reproducirMood(mood: MoodMusica): void {
    if (this.pistaActiva?.mood === mood) return;

    const ctx = getCtx();
    if (!ctx) return;

    // Fade out la pista saliente
    if (this.pistaActiva) {
      const saliente = this.pistaActiva;
      const ganSaliente = saliente.ganancia;
      ganSaliente.gain.linearRampToValueAtTime(0, ctx.currentTime + CROSSFADE_MS / 1000);
      const idSaliente = saliente.intervalId;
      setTimeout(() => {
        clearInterval(idSaliente);
        ganSaliente.disconnect();
      }, CROSSFADE_MS + 100);
    }

    // Nueva pista entrante
    const ganancia = ctx.createGain();
    ganancia.gain.setValueAtTime(0, ctx.currentTime);
    ganancia.gain.linearRampToValueAtTime(VOLUMEN_MAESTRO, ctx.currentTime + CROSSFADE_MS / 1000);
    ganancia.connect(ctx.destination);

    const intervalId = iniciarCiclo(ctx, mood, ganancia);

    this.pistaActiva = { ganancia, intervalId, mood };
  }

  /**
   * Detiene la pista activa sin crossfade. Llamar al abandonar la escena.
   */
  detener(): void {
    if (!this.pistaActiva) return;
    clearInterval(this.pistaActiva.intervalId);
    this.pistaActiva.ganancia.disconnect();
    this.pistaActiva = null;
  }
}
