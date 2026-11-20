// npm run setup - check prerequisites, install backend + frontend dependencies, create local config.
// Plain Node (no dependencies) so it runs straight after `git clone`. Pass --e2e to also install Playwright browsers.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
};
const run = (cmd, args, cwd) => {
  console.log(`\n> ${cmd} ${args.join(' ')}  (${cwd.replace(root, '.') || '.'})`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} failed`);
};

console.log('Checking prerequisites');
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) fail(`Node 20 or newer is required (found ${process.versions.node})`);
ok(`Node ${process.versions.node}`);

const docker = spawnSync('docker', ['info'], { stdio: 'ignore', shell: isWin });
if (docker.error) fail('Docker is not installed. Install Docker Desktop (or Docker Engine) - the local Supabase stack runs in it.');
if (docker.status !== 0) fail('Docker is installed but not running. Start Docker and run `npm run setup` again.');
ok('Docker is running');

run('npm', ['ci'], join(root, 'backend'));
run('npm', ['ci'], join(root, 'frontend'));
if (process.argv.includes('--e2e')) run('npx', ['playwright', 'install', '--with-deps', 'chromium'], join(root, 'frontend'));

const cfg = join(root, 'frontend', 'public', 'config.json');
if (existsSync(cfg)) ok('frontend/public/config.json already exists (left unchanged)');
else {
  copyFileSync(join(root, 'frontend', 'public', 'config.example.json'), cfg);
  ok('Created frontend/public/config.json (local dev mode)');
}

console.log(`
Setup complete. Next:

  npm run dev      start local Supabase, dev sign-in, mock AI intake and the app
                   then open http://localhost:5173

Sign in with any listed demo account. PINs: owner 4321, Ana (front desk) 2222, Sam (workshop) 1111.
`);
