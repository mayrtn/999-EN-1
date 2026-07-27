---
inclusion: always
---

# Arquitectura — Arcade IA Mutante

## Visión general

Juego arcade 8-bit web donde una IA (Amazon Bedrock) muta la estética y dificultad de cada escena según el perfil de juego del jugador. El principio rector es que **la IA nunca es un punto único de falla**: el juego siempre avanza con o sin Bedrock.

## Stack

- **Cliente**: Phaser 3 + TypeScript, servido como sitio estático (S3 + CloudFront).
- **Backend**: API Gateway + Lambda (Node/TS) → Amazon Bedrock (Claude 3.5 Haiku o Nova Lite).
- **Infra**: AWS CDK (TypeScript) en `infra/`.

## Módulos del cliente (`src/`)

| Módulo | Responsabilidad |
|--------|----------------|
| `contrato/` | Tipos e interfaces compartidos (Contrato_Compartido). Artefacto central para paralelismo entre devs. |
| `shell/` | Orquestación: BootScene, SceneManager, pantalla de carga, resolución de perillas (Bedrock + fallback). Mantiene el Perfil_Jugador en memoria. |
| `motor/` | Motor_Scoring: lógica pura y determinística. Normaliza telemetría → actualiza perfil. |
| `mutacion/` | Sistema_Mutacion: aplica perillas (paleta, clima, enemigos, música, mensaje) reutilizando sprites existentes. |
| `input/` | InputUnificado: abstracción de teclado. Las Escenas nunca leen Phaser.Input directamente. |
| `escenas/` | Escenas jugables (Nivel_Plataformas, Nivel_Ritmo, Nivel_Shooter, Escena_Carreras). Todas implementan IEscena. |
| `backend/` | Handler Lambda: recibe perfil, invoca Bedrock, valida y devuelve PerillasMutacion. |

## Flujo principal (loop de transición)

1. Escena actual termina → emite `TelemetriaRasgos` al Shell.
2. Shell pasa la telemetría al Motor_Scoring → Perfil_Jugador actualizado.
3. Shell inicia pantalla de carga y en paralelo:
   - Llama al backend (Bedrock) con timeout.
   - Calcula Mutacion_Fallback (heurística local, siempre válida).
4. Si la respuesta de Bedrock es válida y a tiempo → usa esas perillas. Si no → usa fallback.
5. Shell inicia la siguiente Escena con las perillas resueltas.
6. Sistema_Mutacion aplica las perillas (tint, partículas, spawner, audio, overlay texto).

## Reglas de dependencia

- Las Escenas dependen de `contrato/` e `input/`. NO dependen de `shell/`, `motor/`, `backend/`, ni de otras Escenas.
- `motor/` y `mutacion/` dependen solo de `contrato/`.
- `shell/` depende de `contrato/`, `motor/`, `mutacion/`, `input/`.
- `backend/` depende solo de `contrato/` (comparte los tipos de PerillasMutacion para validación).
- Nunca importar de `node_modules` en código de cliente salvo `phaser`.
- Nunca importar `phaser` en `motor/`, `contrato/`, ni `backend/`.

## Extensibilidad

- Agregar una escena nueva = agregar entrada en `REGISTRO_ESCENAS` con `habilitada: true` y una clase que implemente `IEscena`. No requiere cambios en Shell ni Motor_Scoring.
- Feature flags por escena en el registro declarativo.

## Seguridad / backend

- API Gateway exige API key (`x-api-key`).
- Lambda valida autorización ANTES de invocar Bedrock.
- La respuesta de Bedrock se trata como `unknown` y se valida contra el conjunto cerrado en cliente Y en Lambda.
- CORS configurado solo para el origen de CloudFront.
