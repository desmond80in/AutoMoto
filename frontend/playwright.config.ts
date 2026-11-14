import { defineConfig, devices } from '@playwright/test';

// Runs against the local stack: Supabase (backend), dev token server, mock intake API and Vite.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    { command: 'npx tsx ../backend/scripts/dev-token-server.ts', url: 'http://localhost:8787/token?email=owner@example.com', reuseExistingServer: true, cwd: '.' },
    { command: 'npx tsx scripts/mock-intake-server.ts', url: 'http://localhost:8788/health', reuseExistingServer: true },
    { command: 'npx vite', url: 'http://localhost:5173', reuseExistingServer: true },
  ],
});
