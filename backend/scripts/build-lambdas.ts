// Bundles each Lambda into dist/<name>/index.mjs (Node 20, ARM64). Terraform zips these folders.
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lambdas = ['cognito-pre-signup', 'cognito-pre-token', 'intake-api', 'sms-api'];

rmSync(join(root, 'dist'), { recursive: true, force: true });
for (const name of lambdas) {
  await build({
    entryPoints: [join(root, 'lambdas', name, 'index.ts')],
    outfile: join(root, 'dist', name, 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    minify: true,
    sourcemap: false,
    // AWS SDK v3 is provided by the Node.js 20 Lambda runtime; sms-api bundles its SMS client so the version is pinned.
    external: name === 'sms-api' ? [] : ['@aws-sdk/*'],
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
    logLevel: 'warning',
  });
  console.log(`built dist/${name}/index.mjs`);
}
