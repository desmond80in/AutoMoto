// Writes frontend/public/config.json (the contract with the frontend, SPEC-BACKEND 12) from Terraform outputs + .env.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { env, infraOutputs, repoDir } from './env';

const out = infraOutputs();
const web = String(out.WebUrl).replace(/\/$/, '');
const extra = env('WEB_EXTRA_ORIGINS', '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);
const origins = [...new Set([...extra, web])];

const config = {
  stage: env('STAGE', 'pov'),
  region: env('AWS_REGION', 'ca-central-1'),
  supabaseUrl: env('SUPABASE_URL'),
  supabasePublishableKey: env('SUPABASE_PUBLISHABLE_KEY'),
  cognito: {
    userPoolId: String(out.UserPoolId),
    userPoolClientId: String(out.UserPoolClientId),
    domain: String(out.CognitoDomain),
    redirectSignIn: origins.map((o) => `${o}/auth/callback`),
    redirectSignOut: origins.map((o) => `${o}/login`),
  },
  apiUrl: String(out.ApiUrl).replace(/\/$/, ''),
  authMode: 'cognito',
};

const dir = join(repoDir, 'frontend', 'public');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
console.log(`wrote frontend/public/config.json for ${web}`);
