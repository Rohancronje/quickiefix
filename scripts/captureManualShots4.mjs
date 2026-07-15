/**
 * Last two frames: the tradie's completed-job screen, and a real offer card
 * on the dashboard (job with coords so the tradie lands in wave 1).
 */
import { chromium } from 'playwright';
import { join } from 'node:path';

const APP = 'https://quickiefix-app-staging.web.app';
const OUT = join(process.cwd(), 'User Manuals', 'images-v2');
const results = [];
async function step(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    results.push(`OK   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}: ${String(e.message).slice(0, 120)}`);
    results.push(`FAIL ${name}`);
  }
}
const shot = (p, n) => p.screenshot({ path: join(OUT, `${n}.png`) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const custCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const tradCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const cust = await custCtx.newPage();
const trad = await tradCtx.newPage();

async function login(page, email) {
  await page.goto(`${APP}/login`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill('password');
  await page.getByText('Log in', { exact: true }).last().click();
  await page.waitForURL(/home|dashboard/, { timeout: 20000 });
  await sleep(1500);
}

await step('logins', async () => {
  await login(cust, 'User1@testaccount.com');
  await login(trad, 'User2@testaccount.com');
});

await step('tradie completed-job screen', async () => {
  await cust.goto(`${APP}/activity`);
  await sleep(2200);
  await cust.getByText(/Lounge power point/).first().click();
  await cust.waitForURL(/track\//, { timeout: 15000 });
  const id = cust.url().split('/track/')[1].split('?')[0];
  await trad.goto(`${APP}/job/${id}`);
  await sleep(2200);
  await shot(trad, 'tradie-completed');
});

let job3 = '';
await step('create coord job', async () => {
  await cust.goto(`${APP}/new-job?trade=electrician`);
  await sleep(1200);
  await cust.getByPlaceholder(/hot water cylinder/).fill('Smoke alarm chirping and needs replacing');
  await cust.getByText('Continue', { exact: true }).click();
  await sleep(800);
  await cust.getByPlaceholder('12 Queen Street, Auckland').pressSequentially('1 Hurstmere Road, Takapuna', { delay: 30 });
  await sleep(2500);
  const sug = cust.getByText(/Hurstmere Road, Takapuna/).first();
  if (await sug.isVisible().catch(() => false)) await sug.click();
  await sleep(500);
  await cust.getByText('Continue', { exact: true }).click();
  await sleep(1500);
  await cust.getByText('⚡ Find me a tradie').click();
  await cust.waitForURL(/track/, { timeout: 25000 });
  job3 = cust.url();
});

await step('offer card shot', async () => {
  let found = false;
  for (let i = 0; i < 25; i++) {
    await trad.goto(`${APP}/dashboard`);
    await sleep(6000);
    if (await trad.getByText('First to accept gets it').first().isVisible().catch(() => false)) {
      found = true;
      break;
    }
  }
  if (!found) throw new Error('offer never appeared');
  await shot(trad, 'tradie-dashboard-offer');
});

await step('cleanup cancel', async () => {
  await cust.goto(job3);
  await sleep(1800);
  await cust.getByText('Cancel job').first().click();
  await sleep(800);
  const btn = cust.getByText(/^(Cancel job|Yes.*)$/).last();
  if (await btn.isVisible().catch(() => false)) await btn.click();
  await sleep(1500);
});

console.log('\n===== SUMMARY =====');
for (const r of results) console.log(r);
await browser.close();
