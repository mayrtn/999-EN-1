/**
 * Contrato_Compartido — Barrel de re-exportación (Requirement 9).
 *
 * Punto único de importación del acuerdo de interfaces que todos los niveles,
 * el Shell, el Motor_Scoring y el backend respetan. Importar desde
 * `src/contrato` (p. ej. `import { IEscena, PerillasMutacion } from '@/contrato'`).
 *
 * @module contrato
 */

export type { EscenaId, Rasgo, PerfilJugador, DeclaracionRasgos } from './rasgos';

export type { SenalOportunidad, TelemetriaRasgos } from './telemetria';

export type {
  Paleta,
  Clima,
  MoodMusica,
  PerillasMutacion,
} from './perillas';
export { PALETAS, CLIMAS, MOODS, MAX_MENSAJE } from './perillas';

export type {
  InputUnificado,
  IShell,
  DatosInicioEscena,
  IEscena,
  IMotorScoring,
  SpawnerEnemigos,
  GestorAudio,
  OverlayTexto,
  ContextoMutacion,
  ISistemaMutacion,
  IClienteBackend,
} from './interfaces';
