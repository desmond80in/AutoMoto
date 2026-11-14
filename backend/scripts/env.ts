import { config } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const repoDir = join(backendDir, '..');
config({ path: join(backendDir, '.env'), quiet: true });

export function env(name: string, fallback?: string): string {
  const v = (process.env[name] ?? '').replace(/\s+#.*$/, '').trim() || fallback;
  if (!v) throw new Error(`Set ${name} in backend/.env`);
  return v;
}

/** Terraform outputs (`terraform -chdir=infra output -json > infra/outputs.json`) as name -> value. */
export function infraOutputs(): Record<string, unknown> {
  const p = join(repoDir, 'infra', 'outputs.json');
  if (!existsSync(p)) throw new Error('infra/outputs.json not found. Run: terraform -chdir=infra output -json > infra/outputs.json');
  const raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, { value: unknown }>;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.value]));
}

/** Prompt without echoing the typed characters (secrets, PINs). */
export function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.startsWith(question)) write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}
