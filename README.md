# 999 EN 1 — Arcade IA Mutante

Juego arcade web 8-bit donde una **IA (Amazon Bedrock — Claude Haiku 4.5)** muta la estética y dificultad de cada escena en tiempo real según cómo juega cada persona.

🎮 **Jugalo online:** https://d2xslelurqyc18.cloudfront.net

## Qué hace la IA

Después de cada escena, el juego analiza tu estilo de juego (furia, curiosidad, logro, riesgo) y le pregunta a Claude: "¿cómo muto el juego para este jugador?". Claude responde con:
- **Paleta de colores** (infierno, sueño, neón, hostil)
- **Intensidad de enemigos** y **agresividad**
- **Clima** (lluvia, brasas, niebla)
- **Mood de música** (calma, épico, tenso, furioso)
- **Mensaje personalizado** al jugador

Si la IA no responde a tiempo, un fallback local garantiza que el juego nunca se quede trabado.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Cliente | Phaser 3.80 + TypeScript, Vite |
| Backend | AWS Lambda (Node.js 20) + Amazon Bedrock |
| IA | Claude Haiku 4.5 (Anthropic) vía inference profile cross-region |
| Infra | AWS CDK — S3 + CloudFront + API Gateway + Lambda |
| Testing | Vitest + fast-check (property-based testing) |

## Escenas del juego

- **Plataformas** — Escena principal: correr, saltar, recolectar monedas, explorar portales ocultos
- **Ritmo** — Mini-juego musical: presionar teclas al ritmo de las notas
- **Shooter** — Naves espaciales: esquivar y disparar aliens
- **Carreras** — Esquivar obstáculos y rivales en una carretera

## Arquitectura

```
Cliente (Phaser 3 + TS)  ──HTTPS──▶  API Gateway ──▶ Lambda ──▶ Amazon Bedrock (Claude)
   │                                       │
   │  Shell (orquestador)                  └── valida JSON contra conjunto cerrado
   │  Motor_Scoring (perfil jugador)
   │  Sistema_Mutacion (aplica perillas)
   │
   └── servido como sitio estático desde S3 + CloudFront
```

## Cómo correr en local

```bash
npm install
npm run dev          # Abre http://localhost:5173
```

Para que la IA funcione en local, creá un `.env` con:
```
VITE_MUTACION_ENDPOINT=https://tu-api-gateway.amazonaws.com/prod/mutacion
VITE_MUTACION_API_KEY=tu-api-key
```

Sin `.env`, el juego funciona igual usando el fallback local (sin IA).

## Build y deploy

```bash
# Build del cliente
npm run build

# Build de la Lambda
npm run build:lambda

# Deploy de infraestructura (requiere AWS CLI + credenciales)
cd infra
npm install
npx cdk deploy -c bedrockModelId=anthropic.claude-haiku-4-5-20251001-v1:0

# Subir cliente a S3
aws s3 sync dist/ s3://NOMBRE-DEL-BUCKET --delete
aws cloudfront create-invalidation --distribution-id ID --paths "/*"
```

## Estructura de carpetas

```
999EN1/
├── src/
│   ├── contrato/       # Tipos e interfaces compartidos (conjunto cerrado)
│   ├── motor/          # Motor_Scoring (lógica pura, determinística)
│   ├── mutacion/       # Sistema_Mutacion + validador + fallback
│   ├── input/          # InputUnificado (abstracción de teclado)
│   ├── escenas/        # Nivel_Plataformas, Nivel_Ritmo, Nivel_Shooter, Escena_Carreras
│   ├── shell/          # SceneManager, BootScene, LoadingScene, resolución de perillas
│   ├── backend/        # Handler Lambda (Bedrock)
│   └── audio/          # Efectos de sonido
├── infra/              # AWS CDK (S3, CloudFront, API Gateway, Lambda, IAM)
└── .kiro/
    ├── specs/          # Especificaciones (requirements, design, tasks)
    └── steering/       # Guías de código, arquitectura, testing
```

## Tests

```bash
npm run test           # Vitest (single run)
npm run test:watch     # Vitest (watch mode)
npm run typecheck      # TypeScript sin emitir
```

## Limpiar recursos AWS

```bash
cd infra
npx cdk destroy
```

## Equipo

Proyecto para el Hackaton de Código Facilito.
