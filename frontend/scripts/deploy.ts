// npm run deploy: build, upload dist/ to the web bucket, upload config.json, invalidate CloudFront.
// Reads WebBucketName and DistributionId from ../infra/outputs.json (terraform -chdir=infra output -json > infra/outputs.json).
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import mime from 'mime-types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputsPath = join(root, '..', 'infra', 'outputs.json');
if (!existsSync(outputsPath)) throw new Error('infra/outputs.json not found. Run: terraform -chdir=infra output -json > infra/outputs.json');
const outputs = JSON.parse(readFileSync(outputsPath, 'utf8')) as Record<string, { value: string }>;
const bucket = outputs.WebBucketName?.value;
const distributionId = outputs.DistributionId?.value;
if (!bucket || !distributionId) throw new Error('WebBucketName / DistributionId missing from infra/outputs.json');

const configPath = join(root, 'public', 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8')) as { authMode?: string };
if (config.authMode !== 'cognito') throw new Error('Refusing to deploy: public/config.json must have authMode "cognito" (run backend/scripts/write-frontend-config.ts).');

execSync('npm run build', { cwd: root, stdio: 'inherit' });

const dist = join(root, 'dist');
const SKIP = new Set(['config.json', 'config.example.json']);
const files = (function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
})(dist)
  .map((f) => relative(dist, f).split('\\').join('/'))
  .filter((k) => !SKIP.has(k));

const s3 = new S3Client({});
const cacheFor = (key: string) => (key.startsWith('assets/') ? 'public,max-age=31536000,immutable' : 'no-cache');
// index.html last, so new assets exist before the page that references them.
for (const key of [...files.filter((k) => k !== 'index.html'), 'index.html']) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: readFileSync(join(dist, key)),
      ContentType: mime.lookup(key) || 'application/octet-stream',
      CacheControl: cacheFor(key),
    }),
  );
  console.log(`uploaded ${key}`);
}

// --delete: remove objects that are no longer in the build (config.json is kept).
const keep = new Set([...files, 'config.json']);
let token: string | undefined;
do {
  const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
  const stale = (page.Contents ?? []).map((o) => o.Key!).filter((k) => !keep.has(k));
  if (stale.length) {
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: stale.map((Key) => ({ Key })) } }));
    stale.forEach((k) => console.log(`deleted ${k}`));
  }
  token = page.NextContinuationToken;
} while (token);

await s3.send(
  new PutObjectCommand({ Bucket: bucket, Key: 'config.json', Body: readFileSync(configPath), ContentType: 'application/json', CacheControl: 'no-cache' }),
);
console.log('uploaded config.json');

const cf = new CloudFrontClient({});
await cf.send(
  new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: { CallerReference: `deploy-${Date.now()}`, Paths: { Quantity: 2, Items: ['/index.html', '/config.json'] } },
  }),
);
console.log(`Deployed to ${outputs.WebUrl?.value ?? bucket}`);
