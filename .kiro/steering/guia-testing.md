---
inclusion: always
---

# Guía de testing — Arcade IA Mutante

## Herramientas

- **Vitest** como test runner (compatible con Vite, ESM nativo).
- **fast-check** para property-based testing (PBT).
- Ejecutar tests: `npm run test` (single run) o `npm run test:watch` (modo watch).
- Typecheck sin emitir: `npm run typecheck`.

## Estructura de archivos de test

- Colocación junto al módulo: `modulo.test.ts` para unit/property tests.
- `modulo.integration.test.ts` para tests que cruzan módulos o mockean I/O.
- No crear carpeta `__tests__/` separada.

## Property-Based Testing (PBT)

### Cuándo usar PBT

- Lógica pura con propiedades universales (rangos, invariantes, determinismo).
- Funciones que operan sobre conjuntos cerrados con reglas claras.
- Validadores (todo input fuera del conjunto → rechazo; todo input dentro → aceptación).

### Cuándo NO usar PBT

- Render de Phaser, interacciones visuales, spawning de game objects.
- Integración con servicios externos (Bedrock, API Gateway).
- Para esos casos: tests de ejemplo, integration tests, o smoke tests.

### Convenciones de PBT

```typescript
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Motor_Scoring', () => {
  it('Feature: arcade-ia-mutante, Property 1: Score_Rasgo siempre en [0,1]', () => {
    fc.assert(
      fc.property(
        generadorDeTelemetria(), // generador custom
        (telemetria) => {
          const resultado = motor.actualizarPerfil(perfil, telemetria);
          // aserción de la propiedad
          for (const rasgo of RASGOS) {
            expect(resultado.rasgos[rasgo]).toBeGreaterThanOrEqual(0);
            expect(resultado.rasgos[rasgo]).toBeLessThanOrEqual(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Reglas de PBT

- Mínimo **100 iteraciones** (`numRuns: 100`) por propiedad.
- Cada test de propiedad lleva el comentario/nombre: `Feature: arcade-ia-mutante, Property {N}: {descripción}`.
- Los generadores custom van al inicio del archivo de test o en un archivo `generadores.ts` si se reutilizan.
- Usar `fc.pre()` para filtrar inputs inválidos (precondiciones), no `if/return`.

## Propiedades definidas del proyecto

| # | Propiedad | Módulo bajo test |
|---|-----------|-----------------|
| 1 | Score_Rasgo siempre en [0,1] | Motor_Scoring |
| 2 | Oportunidad 0 ⇒ peso 0, no afecta perfil | Motor_Scoring |
| 3 | Perfil acumulado permanece en [0,1] | Motor_Scoring |
| 4 | Determinismo del perfil | Motor_Scoring |
| 5 | Perillas aplicadas siempre pertenecen al conjunto cerrado | Shell (resolución) |
| 6 | Fallback siempre produce perillas válidas | Mutacion_Fallback |
| 7 | El juego nunca queda bloqueado esperando a Bedrock | Shell (resolución + timeout) |
| 8 | Validación rechaza todo fuera del conjunto cerrado | Validador de perillas |

## Tests de ejemplo / integración

- Para Escenas: tests manuales o smoke tests que verifican que `create()` no lanza, que `construirTelemetria()` devuelve estructura válida, etc.
- Para el backend (Lambda): mockear Bedrock y verificar que la Lambda devuelve JSON válido o error apropiado.
- Para el Shell loop: integration test que simula la secuencia completa (telemetría → scoring → resolución → perillas) con mocks del backend.

## Generadores útiles (fast-check)

```typescript
/** Genera un Rasgo aleatorio. */
const arbRasgo = fc.constantFrom('furia', 'curiosidad', 'logro', 'riesgo');

/** Genera una SenalOportunidad válida. */
const arbSenalOportunidad = fc.record({
  senal: fc.nat({ max: 1000 }),
  oportunidad: fc.nat({ max: 1000 }),
});

/** Genera TelemetriaRasgos válida. */
const arbTelemetria = fc.record({
  escena: fc.constantFrom('plataformas', 'ritmo', 'shooter', 'carreras'),
  porRasgo: fc.record({
    furia: arbSenalOportunidad,
    curiosidad: arbSenalOportunidad,
    logro: arbSenalOportunidad,
    riesgo: arbSenalOportunidad,
  }),
});

/** Genera PerillasMutacion válidas (dentro del conjunto cerrado). */
const arbPerillasValidas = fc.record({
  paleta: fc.constantFrom('infierno', 'sueno', 'neon', 'hostil'),
  intensidad_enemigos: fc.double({ min: 0, max: 1, noNaN: true }),
  agresividad: fc.double({ min: 0, max: 1, noNaN: true }),
  clima: fc.constantFrom('ninguno', 'lluvia', 'brasas', 'niebla'),
  mood_musica: fc.constantFrom('calma', 'epico', 'tenso', 'furioso'),
  mensaje: fc.string({ maxLength: 80 }),
});
```

## Buenas prácticas

- No testear implementaciones internas; testear contratos públicos.
- Preferir `toStrictEqual` sobre `toEqual` para detectar propiedades extra.
- Usar `vi.fn()` para mocks; `vi.useFakeTimers()` para tests de timeout.
- Los tests deben pasar sin red: mockear `fetch` en tests de integración con backend.
