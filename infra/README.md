# Infraestructura AWS — Arcade IA Mutante

Infraestructura como código (AWS CDK v2, TypeScript) para desplegar el juego:
sitio estático en **S3 + CloudFront** y backend serverless **API Gateway + Lambda**
que intermedia contra **AWS Bedrock**.

> Esta carpeta solo **define** la infraestructura. No se ha desplegado nada.
> Los comandos de despliegue de abajo se ejecutan manualmente cuando el equipo
> esté listo (requieren credenciales de AWS).

## Recursos definidos

| Recurso | Descripción | Requirement |
|---|---|---|
| `SitioEstaticoBucket` (S3) | Bucket privado para los artefactos estáticos del cliente. Sin acceso público; solo CloudFront lo lee vía OAC. | 10.1 |
| `SitioDistribucion` (CloudFront) | CDN con HTTPS forzado (`REDIRECT_TO_HTTPS`), `defaultRootObject: index.html` y respuestas SPA (403/404 → `index.html`). | 10.2 |
| `MutacionApi` (API Gateway REST) | Ruta `POST /mutacion` respaldada por la Lambda, protegida por **API key + usage plan** y con **CORS** limitado al origen de CloudFront. | 10.3, 10.6 |
| `MutacionLambda` (Lambda Node.js 20) | Función del `Servicio_Backend`. Política IAM con `bedrock:InvokeModel` acotada al modelo configurado. El código real llega en la tarea 12. | 10.3, 10.4 |

### Autorización (Requirement 10.6)

El método `POST /mutacion` exige `apiKeyRequired: true`. Sin una API key válida en el
header `x-api-key`, API Gateway rechaza la solicitud (403) **antes** de invocar la
Lambda y, por tanto, antes de invocar Bedrock. Esto evita abuso y costo indebido.

## Estructura

```
infra/
├── bin/app.ts                        # Entry point de la app CDK
├── lib/arcade-ia-mutante-stack.ts    # Definición del stack (todos los recursos)
├── lambda/mutacion/index.mjs         # Placeholder del handler (real en tarea 12.1)
├── cdk.json                          # Config de la CLI de CDK
├── tsconfig.json                     # TS de la app de infra (aislado del cliente)
└── package.json                      # Dependencias de infra (aws-cdk-lib fijado)
```

## Requisitos previos

- Node.js 18+ y npm.
- Una cuenta de AWS con credenciales configuradas (`aws configure` o variables de entorno).
- El modelo de Bedrock elegido **habilitado** en la región de despliegue
  (por defecto `anthropic.claude-3-5-haiku-20241022-v1:0`; configurable con `-c bedrockModelId=...`).

## Cómo desplegar (más tarde — NO ejecutar ahora)

```bash
# 1. Instalar dependencias de infra
cd infra
npm install

# 2. Compilar / validar tipos (no requiere AWS)
npm run typecheck

# 3. Bootstrap de la cuenta/región (una sola vez por cuenta+región)
npx cdk bootstrap

# 4. Ver el CloudFormation que se generaría (requiere que el bootstrap exista)
npx cdk synth

# 5. Desplegar
npx cdk deploy

# (opcional) elegir región y modelo de Bedrock
CDK_DEFAULT_REGION=us-east-1 npx cdk deploy -c bedrockModelId=amazon.nova-lite-v1:0
```

Tras `cdk deploy`, las salidas (`CfnOutput`) muestran:

- `BucketName` — dónde subir los estáticos del cliente (`aws s3 sync ./dist s3://<bucket>`).
- `DistributionDomainName` — URL pública HTTPS donde se juega la demo.
- `DistributionId` — para invalidar caché tras cada deploy del cliente.
- `ApiEndpoint` — base del API; el endpoint es `POST {ApiEndpoint}mutacion`.
- `ApiKeyId` — recuperar el valor con
  `aws apigateway get-api-key --api-key <id> --include-value`.

## Notas de diseño

- **Sin dependencia circular**: el CORS del API referencia el dominio de CloudFront,
  y CloudFront no depende del API, así que el grafo de dependencias es acíclico.
- **Certificado HTTPS**: se usa el certificado por defecto de CloudFront
  (`*.cloudfront.net`). Un dominio propio + ACM queda para una iteración futura.
- **`RemovalPolicy.DESTROY` + `autoDeleteObjects`** en el bucket para facilitar el
  limpiado del stack en un contexto de hackatón. Revisar antes de un entorno productivo.
