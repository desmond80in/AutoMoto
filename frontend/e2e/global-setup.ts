import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Fresh seed data for every run. */
export default function globalSetup() {
  if (process.env.E2E_NO_RESET) return;
  const backend = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend');
  execSync('npx supabase db reset', { cwd: backend, stdio: 'inherit' });
}
