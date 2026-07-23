// Empaquetado del Servicio_Backend (Lambda) para su publicación.
//
// Qué hace (Requirements 10.1, 10.5 — cadena de build/empaquetado):
//   1. Bundlea `src/backend/handler.ts` a un único archivo con esbuild
//      (`build/lambda/index.js`, CommonJS, target Node) — bundle listo para CDK
//      (p. ej. `lambda.Function` con `code: lambda.Code.fromAsset('build/lambda')`).
//   2. Comprime ese directorio a `build/lambda.zip` — artefacto desplegable
//      directo (subida manual / `aws lambda update-function-code`).
//
// NO despliega ni sube nada a AWS. Solo produce artefactos locales.
//
// El handler `index.handler` corresponde al export `handler` de handler.ts.
// El AWS SDK v3 (`@aws-sdk/*`) queda marcado como `external`: ya está disponible
// en el runtime de Node de Lambda, así que no se incluye en el bundle.

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const entry = join(rootDir, 'src', 'backend', 'handler.ts');
const outDir = join(rootDir, 'build', 'lambda');
const outFile = join(outDir, 'index.js');
const zipFile = join(rootDir, 'build', 'lambda.zip');

async function main() {
  if (!existsSync(entry)) {
    console.error(
      `[build:lambda] No se encontró el entry del handler en: ${entry}\n` +
        '  El handler real se implementa en la tarea 12. Debe existir un export ' +
        '`handler` en src/backend/handler.ts para poder empaquetar.',
    );
    process.exit(1);
  }

  // Limpieza del artefacto previo para un empaquetado reproducible.
  rmSync(outDir, { recursive: true, force: true });
  rmSync(zipFile, { force: true });
  mkdirSync(outDir, { recursive: true });

  console.log('[build:lambda] Bundling handler con esbuild...');
  await build({
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    minify: true,
    sourcemap: false,
    // El AWS SDK v3 ya viene en el runtime de Lambda: no lo empaquetamos.
    external: ['@aws-sdk/*'],
    logLevel: 'info',
  });
  console.log(`[build:lambda] Bundle listo (CDK-ready): ${outFile}`);

  try {
    crearZip(outDir, zipFile);
    console.log(`[build:lambda] Artefacto zip listo: ${zipFile}`);
  } catch (err) {
    // El zip es un extra conveniente; el directorio bundle ya es válido para CDK
    // (lambda.Code.fromAsset). No hacemos fallar el empaquetado por el zip.
    console.warn(
      '[build:lambda] AVISO: no se pudo crear el zip automáticamente ' +
        `(${err instanceof Error ? err.message : String(err)}).\n` +
        `  El bundle sigue disponible para CDK en: ${outDir}`,
    );
  }
}

/**
 * Comprime el contenido de `srcDir` (sin la carpeta contenedora) en `zipPath`,
 * de modo que `index.js` quede en la raíz del zip (requisito de Lambda).
 * Usa herramientas nativas del sistema para evitar dependencias adicionales.
 */
function crearZip(srcDir, zipPath) {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${join(srcDir, '*')}' -DestinationPath '${zipPath}' -Force`,
      ],
      { stdio: 'inherit' },
    );
  } else {
    // `zip` comprime relativo al cwd, así que ejecutamos dentro de srcDir.
    execFileSync('zip', ['-r', zipPath, '.'], { cwd: srcDir, stdio: 'inherit' });
  }
}

main().catch((err) => {
  console.error('[build:lambda] Falló el empaquetado:', err);
  process.exit(1);
});
