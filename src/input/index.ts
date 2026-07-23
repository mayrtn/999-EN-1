/**
 * Input_Unificado — Barrel de re-exportación (Requirements 9.5, 9.6).
 *
 * Punto único de importación de la abstracción de teclado y su binding
 * concreto. Las Escenas consumen {@link InputUnificado} (del Contrato_Compartido)
 * y el Shell inyecta una instancia de {@link InputTeclado} construida con el
 * {@link MAPA_TECLAS} compartido, garantizando el mismo mapa de teclas en los
 * tres niveles.
 *
 * @module input
 */

export { InputTeclado } from './input-teclado';
export type { TeclaLike, TecladoLike } from './input-teclado';
export { MAPA_TECLAS, CODIGOS_TECLA } from './mapa-teclas';
export type { MapaTeclas } from './mapa-teclas';
