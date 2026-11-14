import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const OWNER = 'owner@example.com';
export const ANA = 'ana.desk@example.com';
export const SAM = 'sam.tech@example.com';

/** Dev sign-in from the login page. */
export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(email.replace('.', '\\.')) }).click();
  await page.waitForURL((u) => u.pathname !== '/login');
}

/** Sign in and pick a role on the role picker (multi-role staff). */
export async function signInAs(page: Page, email: string, role: string) {
  await signIn(page, email);
  await expect(page.getByRole('heading', { name: /Which role is this device for/ })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${role}`) }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/role'));
}

export async function expectNoSeriousA11y(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${name}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

/** Draw a short stroke on the signature pad. */
export async function sign(page: Page) {
  const pad = page.getByTestId('signature-pad');
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 60);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 30 + i * 25, box.y + 60 + (i % 2 ? 30 : -20), { steps: 2 });
  await page.mouse.up();
}
