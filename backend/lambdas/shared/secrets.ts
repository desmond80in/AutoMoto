import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const cache = new Map<string, string>();
let client: SecretsManagerClient | undefined;

/**
 * Reads a secret named by `${name}_ARN` from Secrets Manager (cached per container).
 * A plain `${name}` env var wins, for local runs and tests.
 */
export async function getSecret(name: string): Promise<string> {
  const direct = process.env[name];
  if (direct) return direct;
  const hit = cache.get(name);
  if (hit) return hit;
  const arn = process.env[`${name}_ARN`];
  if (!arn) throw new Error(`Missing ${name} or ${name}_ARN`);
  client ??= new SecretsManagerClient({});
  const out = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const value = out.SecretString?.trim();
  if (!value) throw new Error(`Secret ${name} is empty`);
  cache.set(name, value);
  return value;
}
