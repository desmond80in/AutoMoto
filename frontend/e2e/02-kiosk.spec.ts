import { expect, test } from '@playwright/test';
import { ANA, expectNoSeriousA11y, sign, signInAs } from './helpers';

test.beforeEach(async ({ page }) => {
  await signInAs(page, ANA, 'Kiosk');
  await expect(page).toHaveURL(/\/kiosk$/);
});

test('3. returning customer by phone, AI fills concerns, signs and checks in', async ({ page }) => {
  await expectNoSeriousA11y(page, 'kiosk search');
  await page.getByLabel('Phone number or licence plate').fill('416 555 0142');
  await page.getByRole('button', { name: 'Find my records' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Priya.' })).toBeVisible();
  await expect(page.getByText('Sharma')).toHaveCount(0);
  await expectNoSeriousA11y(page, 'kiosk pick vehicle');
  await page.getByRole('button', { name: /CR-V/ }).click();
  await expect(page.getByText('Priya · Phone ending 0142')).toBeVisible();
  await page.getByLabel("Tell us what's wrong, in your own words").fill('When I brake on the highway there is a grinding noise. About 53 thousand km.');
  await page.getByRole('button', { name: 'Fill in the form for me' }).click();
  await expect(page.getByText("Here's what we understood")).toBeVisible();
  await expect(page.getByLabel('Concern 1')).toHaveValue('Grinding noise from the front when braking');
  await expect(page.getByLabel('Odometer reading (km)')).toHaveValue('53000');
  await expect(page.getByText('Safety concern')).toBeVisible();
  await expectNoSeriousA11y(page, 'kiosk visit');
  await page.getByLabel('Printed name').fill('Priya Sharma');
  await sign(page);
  await expect(page.getByText('Signature captured.')).toBeVisible();
  await page.getByLabel("I've read the authorization above and agree to it.").check();
  await page.getByRole('button', { name: 'Check in my vehicle' }).click();
  await expect(page.getByTestId('order-no')).toHaveText(/^#\d{6}-\d{2}$/);
  await expect(page.getByRole('heading', { name: "You're checked in, Priya." })).toBeVisible();
  await expect(page.getByText('(•••) •••-0142')).toBeVisible();
  await expectNoSeriousA11y(page, 'kiosk done');
});

test('4. new customer with Year/Make/Model and a "Not listed" make', async ({ page }) => {
  await page.getByRole('button', { name: 'Register as a new customer' }).click();
  await expect(page.getByRole('heading', { name: 'New customer' })).toBeVisible();
  await page.getByLabel('Full name').fill('Lena Novak');
  await page.getByLabel('Phone number').fill('613 555 0101');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Enter the licence plate (2 to 8 letters and numbers).')).toBeVisible();
  await page.getByLabel('Licence plate').fill('lnvk 101');
  await page.getByLabel('Year').selectOption('2008');
  await page.getByLabel('Make', { exact: true }).selectOption('Not listed');
  await page.getByLabel('Make (not listed)').fill('Saab');
  await page.getByLabel('Model', { exact: true }).fill('9-3');
  await expectNoSeriousA11y(page, 'kiosk register');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Lena · Phone ending 0101')).toBeVisible();
  await expect(page.getByText('2008 Saab 9-3')).toBeVisible();
  await page.getByLabel('Concern 1').fill('Oil change');
  await page.getByLabel('Printed name').fill('Lena Novak');
  await sign(page);
  await page.getByLabel("I've read the authorization above and agree to it.").check();
  await page.getByRole('button', { name: 'Check in my vehicle' }).click();
  await expect(page.getByRole('heading', { name: "You're checked in, Lena." })).toBeVisible();
});

test('4b. Year/Make/Model: catalog make filters models; choosing a make clears model', async ({ page }) => {
  await page.getByRole('button', { name: 'Register as a new customer' }).click();
  await expect(page.getByLabel('Model', { exact: true })).toBeDisabled();
  await page.getByLabel('Make', { exact: true }).selectOption('Honda');
  await expect(page.getByLabel('Model', { exact: true })).toBeFocused();
  await page.getByLabel('Model', { exact: true }).selectOption('CR-V');
  await page.getByLabel('Make', { exact: true }).selectOption('Toyota');
  await expect(page.getByLabel('Model', { exact: true })).toHaveValue('');
});

test('5. plate of a sold car: "I\'m not listed" -> "I bought this vehicle" -> front desk sees "Owner to verify"', async ({ page, browser }) => {
  await page.getByLabel('Phone number or licence plate').fill('BXRT552');
  await page.getByRole('button', { name: 'Find my records' }).click();
  await expect(page.getByRole('heading', { name: 'Who\'s checking it in today?' }).or(page.getByText("Who's checking it in today?"))).toBeVisible();
  await expect(page.getByRole('button', { name: /Marco R\./ })).toBeVisible();
  await expect(page.getByText('Rossi')).toHaveCount(0);
  await expectNoSeriousA11y(page, 'kiosk who are you');
  await page.getByRole('button', { name: "I'm not listed" }).click();
  await page.getByLabel('Phone number').fill('905 555 0333');
  await page.getByLabel('Full name').fill('Tara Buyer');
  await page.getByLabel('I bought this vehicle').check();
  await expectNoSeriousA11y(page, 'kiosk link owner');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Concern 1').fill('Brakes squeal');
  await page.getByLabel('Printed name').fill('Tara Buyer');
  await sign(page);
  await page.getByLabel("I've read the authorization above and agree to it.").check();
  await page.getByRole('button', { name: 'Check in my vehicle' }).click();
  await expect(page.getByRole('heading', { name: "You're checked in, Tara." })).toBeVisible();

  const desk = await (await browser.newContext()).newPage();
  await signInAs(desk, ANA, 'Front desk');
  const card = desk.getByTestId('arrival').filter({ hasText: 'Tara Buyer' });
  await expect(card.getByText('Owner to verify')).toBeVisible();
});

test('9. kiosk lock: wrong PIN, then correct PIN, then sign out', async ({ page }) => {
  await page.getByRole('button', { name: 'Staff' }).click();
  const dlg = page.getByRole('dialog', { name: 'Staff only' });
  await dlg.getByLabel('PIN').fill('9999');
  await dlg.getByRole('button', { name: 'Unlock' }).click();
  await expect(dlg.getByText('Wrong PIN.')).toBeVisible();
  await expectNoSeriousA11y(page, 'kiosk pin');
  await dlg.getByLabel('PIN').fill('2222');
  await dlg.getByRole('button', { name: 'Unlock' }).click();
  const sw = page.getByRole('dialog', { name: 'Switch role' });
  await expect(sw.getByRole('button', { name: /Front desk Sign out and sign in again/ })).toBeDisabled();
  await sw.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Staff sign-in' })).toBeVisible();
});

test('Escape closes the PIN dialog', async ({ page }) => {
  await page.getByRole('button', { name: 'Staff' }).click();
  await expect(page.getByRole('dialog', { name: 'Staff only' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Staff only' })).toHaveCount(0);
});
