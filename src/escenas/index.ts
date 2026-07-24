/**
 * Escenas — Barrel de re-exportación.
 *
 * Punto único de importación de las Escenas jugables que implementan
 * {@link IEscena} (Requirement 9). El Shell/SceneManager (tarea 11) las registra
 * de forma declarativa.
 *
 * @module escenas
 */

export { NivelPlataformas } from './NivelPlataformas';
export { NivelRitmo } from './NivelRitmo';
export { NivelShooter } from './NivelShooter';
export type { NivelShooterOpciones } from './NivelShooter';
export { EscenaCarreras } from './EscenaCarreras';
export { EscenaSeleccion } from './EscenaSeleccion';
