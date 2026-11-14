import { expect, test } from '@playwright/test';
import { expectNoSeriousA11y, OWNER, signInAs } from './helpers';

test('10. admin adds staff with roles and quick switch; kiosk warning; last admin is protected', async ({ page }) => {
  await signInAs(page, OWNER, 'Administrator');
  await expect(page.getByRole('heading', { name: 'Staff & roles' })).toBeVisible();
  await expectNoSeriousA11y(page, 'admin staff');
  await page.getByRole('button', { name: '+ Add staff member' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Name').fill('Jo Tech');
  await d.getByLabel('Gmail address').fill('jo.tech@example.com');
  await d.getByLabel('PIN (4 to 6 digits)').fill('3333');
  for (const r of ['Front desk', 'Workshop', 'Kiosk']) await d.getByRole('group', { name: 'Roles' }).getByRole('button', { name: r }).click();
  const qs = d.getByRole('group', { name: 'Switch without signing out' });
  await expect(qs.getByRole('button', { name: 'Administrator' })).toBeDisabled();
  await qs.getByRole('button', { name: 'Front desk' }).click();
  await qs.getByRole('button', { name: 'Kiosk' }).click();
  await expect(d.getByText('Kiosk is included. Anyone at that screen could switch to staff roles after unlocking with a PIN.')).toBeVisible();
  await expectNoSeriousA11y(page, 'staff drawer');
  await qs.getByRole('button', { name: 'Kiosk' }).click();
  await qs.getByRole('button', { name: 'Workshop' }).click();
  await d.getByRole('button', { name: 'Add staff member' }).click();
  await expect(page.getByText('Staff member added.')).toBeVisible();
  const row = page.getByRole('row', { name: /Jo Tech/ });
  await expect(row).toContainText('jo.tech@example.com');
  await expect(row).toContainText('Kiosk');

  // remove admin from the only admin
  await page.getByRole('row', { name: /Owner/ }).first().click();
  await page.getByRole('dialog').getByRole('group', { name: 'Roles' }).getByRole('button', { name: 'Administrator' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Keep at least one active administrator.')).toBeVisible();
});

test('admin shop settings, job cancel with confirm', async ({ page }) => {
  await signInAs(page, OWNER, 'Administrator');
  await page.getByRole('link', { name: 'Shop settings' }).click();
  await expect(page.getByLabel('HST rate (%)')).toHaveValue('13');
  await expectNoSeriousA11y(page, 'shop settings');
  await page.getByLabel('HST rate (%)').fill('25');
  await page.getByRole('button', { name: 'Save shop settings' }).click();
  await expect(page.getByText('HST must be between 0 and 20%.')).toBeVisible();
  await page.getByLabel('Default labour rate ($/hr)').fill('150');
  await page.getByLabel('HST rate (%)').fill('13');
  await page.getByRole('button', { name: 'Save shop settings' }).click();
  await expect(page.getByText('Shop settings saved.')).toBeVisible();

  await page.goto('/admin/jobs?job=00000000-0000-0000-0000-0000000e0009');
  const d = page.getByRole('dialog').first();
  await d.getByRole('button', { name: 'Cancel job' }).click();
  const c = page.getByRole('dialog', { name: /^Cancel job #/ });
  await c.getByLabel('Other reason').check();
  await expect(c.getByRole('button', { name: 'Cancel job' })).toBeDisabled();
  await c.getByLabel('Describe the reason').fill('Customer had to leave for the airport');
  await c.getByRole('button', { name: 'Cancel job' }).click();
  await expect(page.getByText(/Job #.* cancelled\./)).toBeVisible();
  await expect(d.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(d.getByText('Reason: Customer had to leave for the airport.')).toBeVisible();
});
