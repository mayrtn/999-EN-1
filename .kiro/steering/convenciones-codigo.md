---
inclusion: always
---

# Convenciones de código — Arcade IA Mutante

## Lenguaje y toolchain

- TypeScript estricto (`--noEmit` con `tsc`, transpilación vía Vite).
- ES Modules (`"type": "module"` en package.json).
- Phaser 3.80 para el cliente; Node/TS para la Lambda.
- Vite como bundler y dev server; Vitest como test runner; fast-check para PBT.

## Naming

- **Archivos**: camelCase para módulos (`motorScoring.ts`, `resolucionPerillas.ts`). PascalCase para clases/escenas (`BootScene.ts`, `LoadingScene.ts`).
- **Carpetas**: minúsculas sin guión ni guión bajo (`contrato`, `motor`, `shell`, `escenas`, `mutacion`, `input`, `backend`).
- **Tests**: colocación junto al módulo: `modulo.test.ts` o `modulo.integration.test.ts`.
- **Interfaces**: prefijo `I` solo cuando hay ambigüedad con la implementación (`IEscena`, `IShell`, `IMotorScoring`). Los types simples sin prefijo (`PerillasMutacion`, `TelemetriaRasgos`).
- **Constantes de dominio**: UPPER_SNAKE_CASE (`PALETAS`, `CLIMAS`, `MOODS`, `MAX_MENSAJE`, `REGISTRO_ESCENAS`).
- **Variables y funciones**: camelCase en español para lógica de dominio (`actualizarPerfil`, `resolverPerillas`, `crearPerfilInicial`). Se permite inglés solo para conceptos universales sin traducción natural (`clamp`, `lerp`).
- **Exports de módulo**: usar barrel index.ts con `export type {}` para tipos y `export {}` para valores.

## Estilo

- JSDoc breve en todas las funciones/interfaces públicas. Incluir referencia al Requirement cuando sea relevante (e.g. `(Requirement 4.3)`).
- No usar `any`. Usar `unknown` cuando el tipo no es confiable (respuestas de Bedrock).
- Preferir funciones puras e inmutabilidad. No mutar argumentos; devolver objetos nuevos.
- `as const` para conjuntos cerrados.
- Evitar `class` salvo para Escenas de Phaser o cuando la interfaz del contrato lo requiere. Preferir funciones y closures.
- No usar `eslint-disable` sin justificación en comentario.

## Imports

- Path alias `@/` apuntando a `src/` (configurado en tsconfig).
- Importar tipos del contrato desde `@/contrato` (barrel), no desde archivos internos del contrato.
- Orden: 1) dependencias externas (`phaser`, `fast-check`), 2) alias internos (`@/contrato`, `@/motor`), 3) imports relativos (`./`).

## Patrones Phaser

- Cada Escena del juego implementa `IEscena` del Contrato_Compartido.
- Las Escenas NO leen el teclado de Phaser directamente: siempre usan `InputUnificado`.
- Las Escenas NO conocen a otras Escenas ni al backend. Solo hablan con el Shell vía `IShell`.
- Assets se precargan en `BootScene` o en `preload()` de cada Escena. No cargar assets en `create()`.
- Usar `setTint()` para la paleta de color, no crear sprites nuevos (Requirement 7.7).
