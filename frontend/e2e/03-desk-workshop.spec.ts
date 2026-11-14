import { expect, test, type Page } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { ANA, expectNoSeriousA11y, OWNER, SAM, sign, signIn, signInAs } from './helpers';

async function kioskCheckIn(page: Page, phone: string, concern: string, name: string) {
  await page.getByLabel('Phone number or licence plate').fill(phone);
  await page.getByRole('button', { name: 'Find my records' }).click();
  await page.locator('.tile:not([disabled])').first().click();
  await page.getByLabel('Concern 1').fill(concern);
  await page.getByLabel('Printed name').fill(name);
  await sign(page);
  await page.getByLabel("I've read the authorization above and agree to it.").check();
  await page.getByRole('button', { name: 'Check in my vehicle' }).click();
  return (await page.getByTestId('order-no').textContent())!.replace('#', '');
}

test('6 + 7 + 8: live arrival, accept + QR tag, workshop opens it by number and photo, display follows', async ({ browser }) => {
  const kiosk = await (await browser.newContext()).newPage();
  const desk = await (await browser.newContext()).newPage();
  const display = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await signInAs(kiosk, ANA, 'Kiosk');
  await signInAs(desk, ANA, 'Front desk');
  await signInAs(display, OWNER, 'Display panel');
  await expect(display.getByRole('heading', { name: 'Vehicle status' })).toBeVisible();
  await expect(desk.getByRole('heading', { name: 'Waiting for keys' })).toBeVisible();
  await expectNoSeriousA11y(desk, 'desk arrivals');

  // 6. new arrival appears without reload
  const orderNo = await kioskCheckIn(kiosk, '647 555 0198', 'Tire pressure light on', 'Daniel Okafor');
  const card = desk.getByTestId('arrival').filter({ hasText: `#${orderNo}` });
  await expect(card).toBeVisible({ timeout: 5000 });
  const row = display.getByTestId('board-row').filter({ hasText: 'Daniel O.' }).filter({ hasText: 'Checked in' });
  await expect(display.getByText('Okafor')).toHaveCount(0);

  // accept -> tag dialog with QR WO:<id>
  await card.getByRole('button', { name: 'Keys received, accept job' }).click();
  const tag = desk.getByTestId('job-tag');
  await expect(tag).toBeVisible();
  await expect(desk.getByText(`Job #${orderNo} accepted.`)).toBeVisible();
  await expect(tag.locator('svg')).toBeVisible();
  const shot = await tag.locator('.kt-qr').screenshot();
  const png = PNG.sync.read(shot);
  const qr = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(qr?.data).toMatch(/^WO:[0-9a-f-]{36}$/);
  const jobId = qr!.data.slice(3);
  expect(desk.url()).toContain(`tag=${jobId}`);
  await expectNoSeriousA11y(desk, 'job tag');

  // print preview shows only the tag
  await desk.emulateMedia({ media: 'print' });
  const visibleOutside = await desk.evaluate(() =>
    [...document.querySelectorAll('h2, .sheet-f button, .tabs')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && !e.closest('.print-tag')).length,
  );
  expect(visibleOutside).toBe(0);
  const pdf = await desk.pdf({ format: 'Letter' });
  expect(pdf.byteLength).toBeGreaterThan(1000);
  await desk.emulateMedia({ media: 'screen' });
  const tagPng = await tag.screenshot();

  // 8. display moves the job to "In the queue"
  await expect(display.getByTestId('board-row').filter({ hasText: 'Daniel O.' }).filter({ hasText: 'In the queue' }).first()).toBeVisible({ timeout: 5000 });
  void row;

  // 7. workshop: typed number, then photo of the tag
  const ws = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  await signIn(ws, SAM);
  await expect(ws.getByRole('heading', { name: 'Start a job' })).toBeVisible();
  await expectNoSeriousA11y(ws, 'workshop');
  await ws.getByLabel('Job number').fill(orderNo.split('-')[1]!.padStart(3, orderNo.split('-')[0]!.slice(-1)));
  await ws.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(ws.getByRole('heading', { name: `#${orderNo}` })).toBeVisible();
  await ws.getByRole('button', { name: 'Close' }).click();
  await ws.getByTestId('qr-file').setInputFiles({ name: 'tag.png', mimeType: 'image/png', buffer: tagPng });
  await expect(ws.getByRole('heading', { name: `#${orderNo}` })).toBeVisible();
  await expect(ws.getByText('Order received by')).toBeVisible();
  await expect(ws.locator('#wo-pu')).toHaveCount(0); // workshop can't edit pick-up date
  await expectNoSeriousA11y(ws, 'job drawer (workshop)');
  await ws.getByRole('dialog').getByRole('button', { name: 'Take job' }).click();
  await expect(ws.getByText(`You took job #${orderNo}.`)).toBeVisible();
  await expect(display.getByTestId('board-row').filter({ hasText: 'Daniel O.' }).filter({ hasText: 'Being worked on' }).first()).toBeVisible({ timeout: 5000 });
  await ws.getByRole('dialog').getByRole('button', { name: 'Work complete' }).click();
  await expect(ws.getByText(`Job #${orderNo} is ready for pickup.`)).toBeVisible();
  const log = ws.locator('.log');
  await expect(log).toContainText('Work completed by Sam Okonkwo. Ready for pickup');
  await expect(log).toContainText('Job taken up by Sam Okonkwo');
  await expect(log).toContainText('Keys received by Ana Moreira');
  await expect(display.getByTestId('board-row').filter({ hasText: 'Daniel O.' }).filter({ hasText: 'Ready for pickup' }).first()).toBeVisible({ timeout: 5000 });
  await expectNoSeriousA11y(display, 'display');
});

test('11. version conflict: second save shows the conflict bar', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await signInAs(a, ANA, 'Front desk');
  await signInAs(b, OWNER, 'Front desk');
  const id = '00000000-0000-0000-0000-0000000e0006';
  await a.goto(`/desk/jobs?job=${id}`);
  await b.goto(`/desk/jobs?job=${id}`);
  await expect(a.getByLabel('Technician notes')).toBeVisible();
  await expect(b.getByLabel('Technician notes')).toBeVisible();
  await expectNoSeriousA11y(a, 'job drawer (desk)');
  await a.getByLabel('Technician notes').fill('Called the dealer, part arrives at 10.');
  await b.getByLabel('Technician notes').fill('Customer asked for a call first.');
  await a.getByRole('button', { name: 'Save changes' }).click();
  await expect(a.getByText(/Work order #.* saved\./)).toBeVisible();
  await b.getByRole('button', { name: 'Save changes' }).click();
  await expect(b.getByText('Someone else changed this job. Reload to see the latest version.').first()).toBeVisible();
  await b.getByRole('button', { name: 'Reload' }).click();
  await b.getByRole('button', { name: 'Discard and reload' }).click();
  await expect(b.getByLabel('Technician notes')).toHaveValue('Called the dealer, part arrives at 10.');
});

test('desk tabs, find and drawers', async ({ page }) => {
  await signInAs(page, ANA, 'Front desk');
  await page.getByRole('link', { name: /^Jobs/ }).click();
  await expect(page.getByRole('region', { name: 'In progress' })).toBeVisible();
  await page.getByRole('link', { name: 'Find' }).click();
  await page.getByLabel('Search by name, phone, plate, VIN or order number').fill('DKPL 870');
  await page.getByRole('button', { name: /RAV4/ }).first().click();
  await expect(page.getByRole('heading', { name: '2021 Toyota RAV4' })).toBeVisible();
  await expect(page.getByText('Daniel Okafor').first()).toBeVisible();
  await expectNoSeriousA11y(page, 'vehicle drawer');
  await page.getByRole('dialog').getByRole('button', { name: 'Mei Lin Chen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mei Lin Chen' })).toBeVisible();
  await page.getByRole('button', { name: '‹ Back' }).click();
  await expect(page.getByRole('heading', { name: '2021 Toyota RAV4' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Customers' }).click();
  await expect(page.getByRole('link', { name: 'Customers' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('cell', { name: 'Priya Sharma' })).toBeVisible();
  await expect(page.getByText(/^Showing 1–\d+ of \d+ customers$/)).toBeVisible();
  const cq = page.getByLabel('Search customers by name, phone or plate');
  await cq.fill('(647) 555-01');
  await expect(page.getByRole('cell', { name: 'Daniel Okafor' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Priya Sharma' })).toHaveCount(0);
  await cq.fill('cjwn');
  await expect(page.getByText('Showing 1–1 of 1 customers')).toBeVisible();
  // Visit history names the vehicle of each visit; a vehicle in the shop offers its open job, not a second one
  await page.getByRole('cell', { name: 'Daniel Okafor' }).click();
  const cust = page.getByRole('dialog');
  await expect(cust.locator('.visit').filter({ hasText: '2021 Toyota RAV4' }).first()).toBeVisible();
  await expect(cust.locator('.visit').filter({ hasText: '2014 Ford F-150' }).first()).toBeVisible();
  await page.goto('/desk/customers?vehicle=00000000-0000-0000-0000-00000000d004');
  await expect(page.getByRole('button', { name: /^Open job #/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Start work order' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();
  await cq.fill('cjwn');
  await cq.fill('nobody-here');
  await expect(page.getByText('No customers match “nobody-here”.')).toBeVisible();
  await expectNoSeriousA11y(page, 'customers search');

  await page.getByRole('link', { name: 'Vehicles' }).click();
  await expect(page.getByRole('row', { name: /CAAB 214/ }).getByRole('cell', { name: / km$/ })).toBeVisible();
  await page.getByLabel('Search vehicles by licence plate or VIN').fill('dkpl 87');
  await expect(page.getByText('Showing 1–1 of 1 vehicles')).toBeVisible();
  await expect(page.getByRole('row', { name: /DKPL 870/ })).toBeVisible();
});

test('customer leaves without repairs: front desk cancels a job at any stage', async ({ page }) => {
  await signInAs(page, ANA, 'Front desk');
  await page.goto('/desk/jobs?job=00000000-0000-0000-0000-0000000e0010');
  const d = page.getByRole('dialog').first();
  await d.getByRole('button', { name: 'Cancel job' }).click();
  const c = page.getByRole('dialog', { name: /^Cancel job #/ });
  await expect(c.getByLabel('Customer left without repairs')).toBeChecked();
  await expectNoSeriousA11y(page, 'cancel dialog');
  await c.getByRole('button', { name: 'Cancel job' }).click();
  await expect(page.getByText(/Job #.* cancelled\./)).toBeVisible();
  await expect(d.getByText('Reason: Customer left without repairs.')).toBeVisible();
  await expect(d.getByText(/Cancelled by Ana Moreira\. Reason: Customer left without repairs/)).toBeVisible();
  await expect(d.getByRole('button', { name: 'Cancel job' })).toHaveCount(0);
});
