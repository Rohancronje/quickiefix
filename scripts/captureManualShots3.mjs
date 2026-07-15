/**
 * Final fix-up: finish the on-site→complete lifecycle with click-verify-retry,
 * capture completed/rating shots, then a fresh offer round (guard is clear
 * once the job completes) for the offer-card/job-offer/question shots.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const APP = 'https://quickiefix-app-staging.web.app';
const OUT = join(process.cwd(), 'User Manuals', 'images-v2');
mkdirSync(OUT, { recursive: true });

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(`OK   ${name}`);
    console.log(`OK   ${name}`);
  } catch (e) {
    results.push(`FAIL ${name}: ${String(e.message).slice(0, 120)}`);
    console.log(`FAIL ${name}: ${String(e.message).slice(0, 120)}`);
  }
}
const shot = (p, n) => p.screenshot({ path: join(OUT, `${n}.png`) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click `target` until `expect` becomes visible (handles RN-web tap flake). */
async function clickUntil(page, target, expect, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const t = page.getByText(target).first();
    if (await t.isVisible().catch(() => false)) await t.click().catch(() => {});
    await sleep(2500);
    if (await page.getByText(expect).first().isVisible().catch(() => false)) return;
  }
  throw new Error(`"${expect}" never appeared after clicking "${target}"`);
}

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

let jobUrl = '';
await step('open active job', async () => {
  await trad.goto(`${APP}/dashboard`);
  await sleep(2500);
  await trad.getByText('Active job').first().click();
  await trad.waitForURL(/job\//, { timeout: 15000 });
  jobUrl = trad.url();
  await sleep(1200);
});
await step('arrive on site (verified)', async () => {
  await clickUntil(trad, /arrived — start job/, 'Complete job');
  await shot(trad, 'tradie-job-onsite');
});
await step('complete with parts', async () => {
  await clickUntil(trad, 'Complete job', 'Invoice details');
  await trad.getByText(/Add parts & materials/).click();
  await sleep(500);
  await trad.getByPlaceholder('Part or material').fill('HPM double power point');
  await trad.getByPlaceholder('$0.00').fill('18.50');
  await sleep(400);
  await shot(trad, 'tradie-complete-parts');
  await clickUntil(trad, 'Confirm & complete job', /Job completed|Rate|completed/i);
  await sleep(1500);
  await shot(trad, 'tradie-completed');
});
await step('customer completed + rating', async () => {
  await cust.goto(jobUrl.replace('/job/', '/track/'));
  await sleep(2500);
  await shot(cust, 'customer-completed');
  await cust.getByText('☆').nth(4).click();
  await sleep(300);
  const tag = cust.getByText('Would recommend');
  if (await tag.isVisible().catch(() => false)) await tag.click();
  await cust.getByText('Submit rating').click();
  await sleep(1800);
  await shot(cust, 'customer-rated');
});

/* Fresh offer round */
let job2 = '';
await step('customer creates offer-round job', async () => {
  await cust.goto(`${APP}/new-job?trade=electrician`);
  await sleep(1200);
  await cust.getByPlaceholder(/hot water cylinder/).fill('Bathroom heater sparking when switched on');
  await cust.getByText('Continue', { exact: true }).click();
  await sleep(800);
  await cust.getByPlaceholder('12 Queen Street, Auckland').fill('45 Anzac Street, Takapuna, Auckland');
  await cust.getByText('Continue', { exact: true }).click();
  await sleep(1500);
  await cust.getByText('⚡ Find me a tradie').click();
  await cust.waitForURL(/track/, { timeout: 25000 });
  job2 = cust.url();
});
await step('tradie offer card appears', async () => {
  let found = false;
  for (let i = 0; i < 12; i++) {
    await trad.goto(`${APP}/dashboard`);
    await sleep(6000);
    if (await trad.getByText('First to accept gets it').first().isVisible().catch(() => false)) {
      found = true;
      break;
    }
  }
  if (!found) throw new Error('offer card never appeared');
  await shot(trad, 'tradie-dashboard-offer');
});
await step('tradie opens offer + asks question', async () => {
  await trad.getByText('View photos & ask a question').first().click();
  await trad.waitForURL(/job\//, { timeout: 15000 });
  await sleep(1500);
  await shot(trad, 'tradie-job-offer');
  await trad.getByPlaceholder('Message…').fill('Is the heater hard-wired or plugged in?');
  await trad.getByText('Send', { exact: true }).click();
  await sleep(1200);
  await shot(trad, 'tradie-question-sent');
});
await step('cleanup: cancel offer-round job', async () => {
  await cust.goto(job2);
  await sleep(1800);
  await cust.getByText('Cancel job').first().click();
  await sleep(800);
  const dialogBtn = cust.getByText(/^(Cancel job|Yes.*)$/).last();
  if (await dialogBtn.isVisible().catch(() => false)) await dialogBtn.click();
  await sleep(1500);
});

console.log('\n===== SUMMARY =====');
for (const r of results) console.log(r);
await browser.close();
