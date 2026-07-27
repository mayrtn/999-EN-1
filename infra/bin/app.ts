#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ArcadeIaMutanteStack } from '../lib/arcade-ia-mutante-stack';

const app = new cdk.App();

/**
 * La cuenta/region se toman del entorno de CDK (variables inyectadas por la CLI
 * al ejecutar `cdk deploy`). No se requieren credenciales para `cdk synth` en la
 * mayoria de los casos, salvo lookups explicitos (que este stack no usa).
 *
 * Nota: Bedrock y su disponibilidad de modelos dependen de la region; se
 * recomienda desplegar en una region donde el modelo elegido este habilitado
 * (p. ej. us-east-1). El id del modelo es configurable via contexto.
 */
const env: cdk.Environment | undefined =
  process.env.CDK_DEFAULT_ACCOUNT && process.env.CDK_DEFAULT_REGION
    ? {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
      }
    : undefined;

// Modelo de Bedrock configurable por contexto: `cdk deploy -c bedrockModelId=...`
// Se usa el inference profile cross-region (prefijo "us.") porque AWS requiere
// inference profiles para invocar modelos de Anthropic con on-demand throughput.
const bedrockModelId =
  (app.node.tryGetContext('bedrockModelId') as string | undefined) ??
  'anthropic.claude-3-haiku-20240307-v1:0';

new ArcadeIaMutanteStack(app, 'ArcadeIaMutanteStack', {
  env,
  bedrockModelId,
  description:
    'Arcade IA Mutante: sitio estatico (S3 + CloudFront) y backend serverless (API Gateway + Lambda + Bedrock).',
});

app.synth();
