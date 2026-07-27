import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface ArcadeIaMutanteStackProps extends cdk.StackProps {
  /**
   * Id del modelo de fundacion de Bedrock que la Lambda puede invocar.
   * Se usa para acotar la politica IAM (bedrock:InvokeModel) al recurso exacto.
   */
  readonly bedrockModelId: string;
}

/**
 * Infraestructura de Arcade IA Mutante.
 *
 * Recursos (Requirements 10.1, 10.2, 10.3, 10.4, 10.6):
 *  - S3 privado para el sitio estatico, servido solo via CloudFront (OAC).   [10.1]
 *  - Distribucion CloudFront con HTTPS forzado y comportamiento SPA.          [10.2]
 *  - API Gateway REST con ruta POST /mutacion respaldada por Lambda,          [10.3]
 *    protegida por API key + usage plan y con CORS para el origen CloudFront.
 *  - Lambda (Node.js) con politica IAM que concede bedrock:InvokeModel.       [10.4]
 *  - La autorizacion (API key) se exige antes de invocar Bedrock.            [10.6]
 */
export class ArcadeIaMutanteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ArcadeIaMutanteStackProps) {
    super(scope, id, props);

    // ------------------------------------------------------------------
    // 1) Bucket S3 para el sitio estatico (privado, servido via CloudFront)
    //    Requirement 10.1
    // ------------------------------------------------------------------
    const sitioBucket = new s3.Bucket(this, 'SitioEstaticoBucket', {
      // Privado: sin acceso publico directo. El acceso llega solo por CloudFront (OAC).
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      // Para una demo de hackaton conviene poder destruir el stack por completo.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ------------------------------------------------------------------
    // 2) Distribucion CloudFront con HTTPS y estilo SPA (index.html)
    //    Requirement 10.2
    // ------------------------------------------------------------------
    const distribucion = new cloudfront.Distribution(this, 'SitioDistribucion', {
      comment: 'Arcade IA Mutante - sitio estatico',
      // Objeto raiz por defecto: la SPA entra por index.html.
      defaultRootObject: 'index.html',
      defaultBehavior: {
        // Origen S3 con Origin Access Control (OAC): CloudFront es el unico que
        // puede leer el bucket; el bucket permanece privado.
        origin: origins.S3BucketOrigin.withOriginAccessControl(sitioBucket),
        // Forzar HTTPS en el visor.
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      // Certificado por defecto de CloudFront (dominio *.cloudfront.net -> HTTPS).
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      // Enrutado tipo SPA: rutas desconocidas devuelven index.html (200).
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    const origenCloudFront = `https://${distribucion.distributionDomainName}`;

    // ------------------------------------------------------------------
    // 3) Lambda (Node.js) del Servicio_Backend con permiso de Bedrock
    //    Requirement 10.4
    // ------------------------------------------------------------------
    // El codigo se toma del bundle producido por `npm run build:lambda`, que
    // empaqueta `src/backend/handler.ts` con esbuild a `build/lambda/index.js`
    // (export `handler` -> handler 'index.handler'). Ejecutar el build antes de
    // `cdk synth`/`cdk deploy`. El AWS SDK v3 queda marcado como external en el
    // bundle porque ya lo provee el runtime NODEJS_20_X.
    const mutacionFn = new lambda.Function(this, 'MutacionLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '..', '..', 'build', 'lambda'),
      ),
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        BEDROCK_MODEL_ID: props.bedrockModelId,
        // Origen permitido para CORS a nivel de respuesta de la Lambda (defensa en profundidad).
        ALLOWED_ORIGIN: origenCloudFront,
      },
    });

    // Politica IAM: permiso para invocar el modelo de Bedrock elegido. Requirement 10.4
    // Se incluye tanto el ARN del foundation-model como el del inference-profile
    // cross-region (prefijo "us.") porque AWS ahora requiere inference profiles
    // para invocar modelos de Anthropic con on-demand throughput.
    mutacionFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:${this.partition}:bedrock:${this.region}::foundation-model/${props.bedrockModelId}`,
          `arn:${this.partition}:bedrock:${this.region}:${this.account}:inference-profile/us.${props.bedrockModelId}`,
          // Wildcard para cross-region inference profiles de Anthropic.
          `arn:${this.partition}:bedrock:*::foundation-model/${props.bedrockModelId}`,
        ],
      }),
    );

    // ------------------------------------------------------------------
    // 4) API Gateway REST: POST /mutacion respaldado por la Lambda,
    //    protegido por API key + usage plan, con CORS para CloudFront.
    //    Requirements 10.3, 10.6
    // ------------------------------------------------------------------
    const api = new apigateway.RestApi(this, 'MutacionApi', {
      restApiName: 'arcade-ia-mutante-api',
      description: 'API del Servicio_Backend que intermedia contra AWS Bedrock.',
      deployOptions: {
        stageName: 'prod',
        throttlingBurstLimit: 20,
        throttlingRateLimit: 10,
      },
      // CORS solo para el origen de CloudFront (Requirement 10.6 / diseno "Autorizacion del endpoint").
      defaultCorsPreflightOptions: {
        allowOrigins: [origenCloudFront],
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'x-api-key'],
        allowCredentials: false,
      },
    });

    const mutacionRecurso = api.root.addResource('mutacion');
    mutacionRecurso.addMethod('POST', new apigateway.LambdaIntegration(mutacionFn), {
      // Exigir API key en cada solicitud. Sin key valida, API Gateway rechaza (403)
      // antes de llegar a la Lambda y, por tanto, antes de invocar Bedrock. Requirement 10.6
      apiKeyRequired: true,
    });

    // API key + usage plan que la habilita.
    const apiKey = api.addApiKey('MutacionApiKey', {
      description: 'API key del cliente Arcade IA Mutante para POST /mutacion.',
    });

    const usagePlan = api.addUsagePlan('MutacionUsagePlan', {
      name: 'arcade-ia-mutante-usage-plan',
      description: 'Limita el uso del endpoint /mutacion para evitar abuso y costo indebido.',
      throttle: {
        burstLimit: 20,
        rateLimit: 10,
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.DAY,
      },
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({
      stage: api.deploymentStage,
    });

    // ------------------------------------------------------------------
    // Salidas utiles para el despliegue del cliente y pruebas.
    // ------------------------------------------------------------------
    new cdk.CfnOutput(this, 'BucketName', {
      value: sitioBucket.bucketName,
      description: 'Bucket S3 donde subir los artefactos estaticos del cliente.',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribucion.distributionDomainName,
      description: 'URL publica de CloudFront (HTTPS) donde se juega la demo.',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribucion.distributionId,
      description: 'Id de la distribucion CloudFront (para invalidaciones de cache).',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'Base URL del API Gateway. El endpoint es POST {ApiEndpoint}mutacion.',
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description:
        'Id de la API key. Recuperar el valor con: aws apigateway get-api-key --api-key <id> --include-value',
    });
  }
}
