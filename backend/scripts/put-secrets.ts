// Fills the Secrets Manager secrets created (empty) by Terraform. Values are typed, never echoed or stored.
// Usage: npx tsx scripts/put-secrets.ts [supabase-secret-key|google-client-secret|anthropic-api-key ...]
import { PutSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { askHidden, env } from './env';

const ALL = ['supabase-secret-key', 'google-client-secret', 'anthropic-api-key'];
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const prefix = `${env('APP_NAME', 'workshop')}/${env('STAGE', 'pov')}`;
const client = new SecretsManagerClient({ region: env('AWS_REGION', 'ca-central-1') });

for (const name of names) {
  if (!ALL.includes(name)) throw new Error(`Unknown secret ${name}`);
  const value = await askHidden(`${prefix}/${name} (leave blank to skip): `);
  if (!value) continue;
  await client.send(new PutSecretValueCommand({ SecretId: `${prefix}/${name}`, SecretString: value }));
  console.log(`stored ${prefix}/${name}`);
}
