import { expect, test } from '@playwright/test';
import { expectNoSeriousA11y, OWNER, SAM, signIn, signInAs } from './helpers';

test('1. single-role user lands on the workshop without the role picker', async ({ page }) => {
  await signIn(page, SAM);
  await expect(page).toHaveURL(/\/workshop$/);
  await expect(page.getByRole('heading', { name: 'Start a job' })).toBeVisible();
  await expect(page.locator('.rolechip')).toHaveText('Workshop');
});

test('2. multi-role owner picks Administrator, quick-switches to Front desk; Kiosk needs sign-out', async ({ page }) => {
  await signIn(page, OWNER);
  await expect(page.getByRole('heading', { name: /Hi Owner\. Which role is this device for\?/ })).toBeVisible();
  await expect(page.getByText('or switch between the roles your administrator allows')).toBeVisible();
  await expectNoSeriousA11y(page, 'role picker');
  await page.getByRole('button', { name: /^Administrator/ }).click();
  await expect(page).toHaveURL(/\/admin\/staff$/);
  await page.getByRole('button', { name: 'Switch role' }).click();
  const dialog = page.getByRole('dialog', { name: 'Switch role' });
  await expect(dialog.getByRole('button', { name: /Administrator Current role/ })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /Kiosk Sign out and sign in again to use this role/ })).toBeDisabled();
  await dialog.getByRole('button', { name: /Front desk Switch now/ }).click();
  await expect(page).toHaveURL(/\/desk\/arrivals$/);
  await expect(page.locator('.rolechip')).toHaveText('Front desk');
});

test('login page is accessible', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible();
  await expectNoSeriousA11y(page, 'login');
});

test('sign out returns to the login page', async ({ page }) => {
  await signInAs(page, OWNER, 'Front desk');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible();
});
