import { expect, test } from '@playwright/test';
import { ANA, OWNER, SAM, signIn, signInAs } from './helpers';

// 13. Screenshots for review: kiosk 820x1180, desk 1280x800, workshop 390x844, display 1920x1080.
const shots = [
  { name: 'kiosk', w: 820, h: 1180, who: ANA, role: 'Kiosk', url: '/kiosk', ready: 'Welcome. Let\'s check in your vehicle.' },
  { name: 'desk', w: 1280, h: 800, who: ANA, role: 'Front desk', url: '/desk/jobs', ready: 'Recently picked up' },
  { name: 'workshop', w: 390, h: 844, who: SAM, role: null, url: '/workshop', ready: 'Start a job' },
  { name: 'display', w: 1920, h: 1080, who: OWNER, role: 'Display panel', url: '/display', ready: 'Vehicle status' },
];

for (const scheme of ['light', 'dark'] as const) {
  for (const s of shots) {
    if (s.name === 'display' && scheme === 'light') continue; // the display is always dark
    test(`screenshot ${s.name} (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, colorScheme: scheme, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      if (s.role) await signInAs(page, s.who, s.role);
      else await signIn(page, s.who);
      await page.goto(s.url);
      await expect(page.getByRole('heading', { name: s.ready }).first()).toBeVisible();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `e2e/screenshots/${s.name}-${scheme}.png`, fullPage: s.name !== 'display' });
      await ctx.close();
    });
  }
}

test('screenshot job drawer (desk, light)', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await signInAs(page, ANA, 'Front desk');
  await page.goto('/desk/jobs?job=00000000-0000-0000-0000-0000000e0007');
  await expect(page.getByRole('heading', { name: "In the customer's words" })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/job-drawer-light.png' });
});
