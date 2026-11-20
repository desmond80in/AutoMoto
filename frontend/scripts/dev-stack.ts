// npm run dev:stack - local Supabase (reset with seed), dev token server, mock intake API and Vite.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const front = join(dirname(fileURLToPath(import.meta.url)), '..');
const back = join(front, '..', 'backend');
const run = (cmd: string, args: string[], cwd: string) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const bg = (name: string, cmd: string, args: string[], cwd: string) => {
  const p = spawn(cmd, args, { cwd, stdio: 'inherit' });
  p.on('exit', (code) => console.log(`${name} exited (${code})`));
  return p;
};

const cfg = join(front, 'public', 'config.json');
if (!existsSync(cfg)) {
  copyFileSync(join(front, 'public', 'config.example.json'), cfg);
  console.log('Created public/config.json from config.example.json (local dev mode)');
}

run('npx', ['supabase', 'start'], back);
if (!process.argv.includes('--no-reset')) run('npx', ['supabase', 'db', 'reset'], back);
const procs = [
  bg('dev-token-server', 'npx', ['tsx', 'scripts/dev-token-server.ts'], back),
  bg('mock-intake', 'npx', ['tsx', 'scripts/mock-intake-server.ts'], front),
  bg('vite', 'npx', ['vite'], front),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
