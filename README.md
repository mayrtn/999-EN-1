# 999 EN 1 — Arcade IA Mutante

Arcade web donde una IA (Amazon Bedrock) muta la estética y dificultad de cada escena
en función del perfil de juego del jugador. Cliente en **Phaser 3 + TypeScript**, backend
en **Node/TypeScript sobre AWS Lambda**, servido como sitio estático (S3 + CloudFront).

## Estado del proyecto

Fase de especificación completada. El diseño, requisitos y plan de implementación viven en
`.kiro/specs/arcade-ia-mutante/`.

## Documentación (specs)

| Documento | Descripción |
|-----------|-------------|
| [`requirements.md`](.kiro/specs/arcade-ia-mutante/requirements.md) | Requisitos funcionales (historias + criterios de aceptación). |
| [`design.md`](.kiro/specs/arcade-ia-mutante/design.md) | Arquitectura, componentes, contrato compartido y propiedades de correctitud. |
| [`tasks.md`](.kiro/specs/arcade-ia-mutante/tasks.md) | Plan de implementación por tareas, con grafo de dependencias. |

## Arquitectura de alto nivel

```
Cliente (Phaser 3 + TS)  --HTTPS-->  API Gateway --> Lambda (Node/TS) --> Amazon Bedrock
   |  Shell + Escenas                                     |
   |  Motor_Scoring                                       +-- valida contra conjunto cerrado
   |  Sistema_Mutacion
   +-- servido como estatico desde S3 + CloudFront
```

## Estructura de carpetas (planificada)

```
999EN1/
├── .kiro/specs/arcade-ia-mutante/   # Especificaciones (requirements, design, tasks)
├── src/
│   ├── contrato/                    # Contrato_Compartido: tipos y conjuntos cerrados
│   ├── motor/                       # Motor_Scoring (logica pura)
│   ├── mutacion/                    # Sistema_Mutacion + fallback
│   ├── input/                       # InputUnificado
│   ├── escenas/                     # Nivel_Plataformas, Nivel_Ritmo, Nivel_Shooter
│   ├── shell/                       # Shell, SceneManager, BootScene
│   └── backend/                     # Handler de Lambda (Bedrock)
└── infra/                           # Infraestructura como codigo (S3, CloudFront, API GW, Lambda)
```

## Como empezar (proximamente)

La implementacion aun no comenzo. El plan de tareas en `tasks.md` es el punto de partida.
