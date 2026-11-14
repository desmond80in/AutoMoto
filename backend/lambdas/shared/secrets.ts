import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const cache = new Map<string, string>();
let client: SSMClient | undefined;

/** Value Terraform gives a parameter before scripts/put-secrets.ts fills it. */
const PLACEHOLDER = 'unset';

/**
 * Reads a SecureString parameter named by `${name}_PARAM` from SSM Parameter Store (cached per container).
 * A plain `${name}` env var wins, for local runs and tests.
 */
export async function getSecret(name: string): Promise<string> {
  const direct = process.env[name];
  if (direct) return direct;
  const hit = cache.get(name);
  if (hit) return hit;
  const param = process.env[`${name}_PARAM`];
  if (!param) throw new Error(`Missing ${name} or ${name}_PARAM`);
  client ??= new SSMClient({});
  const out = await client.send(new GetParameterCommand({ Name: param, WithDecryption: true }));
  const value = out.Parameter?.Value?.trim();
  if (!value || value === PLACEHOLDER) throw new Error(`Secret ${name} is not set`);
  cache.set(name, value);
  return value;
}
