/// <reference types="vite/client" />

/**
 * Tipado del entorno de build de Vite para el cliente (Requirement 10.6).
 *
 * El endpoint y la API key del Servicio_Backend NO se hardcodean: se inyectan
 * por configuración de despliegue vía variables de entorno `VITE_*` de Vite y se
 * leen de `import.meta.env`. En Fase 1 (sin backend desplegado) ambas quedan
 * indefinidas y el juego resuelve todo con la `Mutacion_Fallback` local,
 * permaneciendo plenamente jugable offline.
 *
 * @see shell/configBackend
 */
interface ImportMetaEnv {
  /** URL absoluta del endpoint de mutación del Servicio_Backend (opcional). */
  readonly VITE_MUTACION_ENDPOINT?: string;
  /** API key enviada en el header `x-api-key` para autorizar (opcional). */
  readonly VITE_MUTACION_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
