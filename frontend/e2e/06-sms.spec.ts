import { expect, test } from '@playwright/test';
import { ANA, expectNoSeriousA11y, SAM, signIn, signInAs } from './helpers';

// Customer texts and the approval flag. Locally the mock API runs the real sms-api handler in simulated mode.
const COROLLA = '00000000-0000-0000-0000-0000000e0007'; // in progress, Priya Sharma (texts on)
const F150 = '00000000-0000-0000-0000-0000000e0008'; // checked in, Daniel Okafor (texts on)

test('workshop flags approval, front desk texts the customer and clears the flag', async ({ browser }) => {
  const ws = await (await browser.newContext()).newPage();
  await signIn(ws, SAM);
  await ws.goto(`/workshop?job=${COROLLA}`);
  const wd = ws.getByRole('dialog').first();
  await expect(wd.getByRole('heading', { name: 'Customer messages' })).toBeVisible();
  await expect(wd.getByRole('button', { name: /^Text customer/ })).toHaveCount(0);
  await wd.getByRole('button', { name: 'Needs customer approval' }).click();
  const flag = ws.getByRole('dialog', { name: 'Customer approval needed' });
  await flag.getByLabel('What needs approval (optional)').fill('Rear rotors are worn too, about $320 more');
  await flag.getByRole('button', { name: 'Flag for approval' }).click();
  await expect(ws.getByText('Flagged: customer approval needed.')).toBeVisible();
  await expect(wd.getByText("Waiting for the customer's approval.")).toBeVisible();

  const desk = await (await browser.newContext()).newPage();
  await signInAs(desk, ANA, 'Front desk');
  await desk.goto(`/desk/jobs?job=${COROLLA}`);
  const d = desk.getByRole('dialog').first();
  await expect(d.getByText('Texts on')).toBeVisible();
  await expect(d.getByText(/Customer approval needed: Rear rotors are worn too, about \$320 more\. Set by Sam Okonkwo/)).toBeVisible();
  await d.getByRole('button', { name: 'Text customer' }).click();
  const sms = desk.getByRole('dialog', { name: 'Text Priya at (416) 555-0142' });
  await expect(sms.getByRole('button', { name: 'Approval needed' })).toHaveAttribute('aria-pressed', 'true');
  await expect(sms.getByRole('textbox', { name: 'Message' })).toHaveValue(/needs your OK before we continue: Rear rotors are worn too, about \$320 more\./);
  await expectNoSeriousA11y(desk, 'text dialog');
  await sms.getByRole('button', { name: 'Send text' }).click();
  await expect(desk.getByText("Text recorded. It wasn't sent because SMS isn't set up yet.")).toBeVisible();
  await expect(d.locator('.sms-row')).toHaveCount(1);
  await expect(d.locator('.sms-row')).toContainText('Not sent (demo)');
  await expect(d.locator('.sms-row')).toContainText('Ana Moreira');
  await expect(d.getByText('Text to the customer (approval needed) by Ana Moreira')).toBeVisible();

  await d.getByRole('button', { name: 'Approval received' }).click();
  await expect(d.getByText("Waiting for the customer's approval.")).toHaveCount(0);
  await expect(d.getByText('Customer approval received. Cleared by Ana Moreira')).toBeVisible();
});

test('no texts without consent; the desk turns texts off and on in the customer record', async ({ page }) => {
  await signInAs(page, ANA, 'Front desk');
  await page.goto(`/desk/jobs?job=${F150}`);
  const d = page.getByRole('dialog').first();
  await expect(d.getByText('Texts on')).toBeVisible();
  await d.getByRole('button', { name: 'Daniel Okafor' }).click();
  const c = page.getByRole('dialog').first();
  await c.getByRole('button', { name: 'Turn texts off' }).click();
  await expect(page.getByText('Texts turned off.')).toBeVisible();
  await expect(c.getByText(/Turned off on/)).toBeVisible();
  await page.goBack();

  await expect(d.getByText('Texts off')).toBeVisible();
  await expect(d.getByText("Daniel hasn't agreed to text messages.")).toBeVisible();
  await expect(d.getByRole('button', { name: /^Text customer/ })).toHaveCount(0);
  await d.getByRole('button', { name: 'Open the customer record' }).click();
  await c.getByRole('button', { name: 'Turn texts on' }).click();
  await expect(page.getByText('Texts turned on.')).toBeVisible();
  await expect(c.getByText(/Turned on by staff/)).toBeVisible();
  await page.goBack();
  await expect(d.getByRole('button', { name: 'Text customer' })).toBeVisible();
});
