/**
 * Fix-up pass for the manual screenshots: finishes the tradie job lifecycle
 * left mid-flight by run 1, recaptures mislabeled frames, runs a fresh offer
 * round, and redoes the agency portal in a FRESH context (no logout games).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const APP = 'https://quickiefix-app-staging.web.app';
const PORTAL = 'https://quickiefix-portal-staging.web.app';
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

/* ---- Finish the stuck job from run 1 ---- */
let jobUrl = '';
await step('open active job from dashboard', async () => {
  await trad.goto(`${APP}/dashboard`);
  await sleep(2500);
  await trad.getByText('Active job').first().click();
  await trad.waitForURL(/job\//, { timeout: 15000 });
  jobUrl = trad.url();
  await sleep(1500);
  await shot(trad, 'tradie-job-accepted');
});
await step('go now (travelling)', async () => {
  await trad.getByText('Go now').click();
  await sleep(900);
  const notNow = trad.getByText('Not now', { exact: true });
  if (await notNow.isVisible().catch(() => false)) await notNow.click();
  await sleep(1500);
  await shot(trad, 'tradie-job-travelling');
});
const custJobUrl = () => jobUrl.replace('/job/', '/track/');
await step('customer travelling view + message reply', async () => {
  await cust.goto(custJobUrl());
  await sleep(2200);
  await shot(cust, 'customer-track-travelling');
  await cust.getByPlaceholder('Message…').fill('The breaker board is labelled — I am home all afternoon.');
  await cust.getByText('Send', { exact: true }).click();
  await sleep(1200);
  await shot(cust, 'customer-messages');
});
await step('arrive on site', async () => {
  await trad.getByText(/arrived/).first().click();
  await sleep(1800);
  await shot(trad, 'tradie-job-onsite');
});
await step('complete with parts', async () => {
  await trad.getByText('Complete job', { exact: true }).first().click();
  await sleep(900);
  await trad.getByText(/Add parts & materials/).click();
  await sleep(500);
  await trad.getByPlaceholder('Part or material').fill('HPM double power point');
  await trad.getByPlaceholder('$0.00').fill('18.50');
  await sleep(400);
  await shot(trad, 'tradie-complete-parts');
  await trad.getByText('Confirm & complete job').click();
  await sleep(2500);
  await shot(trad, 'tradie-completed');
});
await step('customer completed + rating', async () => {
  await cust.goto(custJobUrl());
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
await step('tradie dashboard after job (clean)', async () => {
  await trad.goto(`${APP}/dashboard`);
  await sleep(2000);
  await shot(trad, 'tradie-dashboard');
});

/* ---- Fresh offer round: offer card + open + question, then clean up ---- */
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
  await cust.waitForURL(/track/, { timeout: 20000 });
  job2 = cust.url();
});
await step('tradie offer card appears', async () => {
  for (let i = 0; i < 10; i++) {
    await trad.goto(`${APP}/dashboard`);
    await sleep(6000);
    if (await trad.getByText('First to accept gets it').first().isVisible().catch(() => false)) break;
  }
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
  await sleep(700);
  const confirm = cust.getByText(/Cancel job|Yes/).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await sleep(1500);
});

/* ---- Agency portal, fresh context ---- */
const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const desk = await deskCtx.newPage();
await step('agency login + dashboard', async () => {
  await desk.goto(PORTAL);
  await sleep(1500);
  await desk.getByPlaceholder('you@company.co.nz').fill('demo-property@quickiefix.store');
  await desk.getByPlaceholder('••••••••').fill('password');
  await desk.getByRole('button', { name: 'Sign in' }).click();
  await sleep(3000);
  await shot(desk, 'agency-dashboard');
});
const tabs = [
  ['Jobs', 'agency-jobs'],
  ['Tradie panel', 'agency-panel'],
  ['Properties', 'agency-properties'],
  ['Owner reports', 'agency-reports'],
  ['Support', 'agency-support'],
  ['Settings', 'agency-settings'],
];
for (const [tab, name] of tabs) {
  await step(`agency ${name}`, async () => {
    await desk.getByText(tab, { exact: true }).first().click();
    await sleep(2000);
    await shot(desk, name);
  });
}
await step('agency request help filled', async () => {
  await desk.getByText('Request help', { exact: true }).first().click();
  await sleep(1800);
  await shot(desk, 'agency-request-help');
  await desk.locator('select').first().selectOption({ index: 1 });
  await sleep(1000);
  await desk.locator('select').nth(2).selectOption({ label: 'Plumber' });
  await sleep(2000);
  await shot(desk, 'agency-request-help-filled');
});
await step('agency approves pending company', async () => {
  await desk.getByText('Tradie panel', { exact: true }).first().click();
  await sleep(1800);
  const approve = desk.getByRole('button', { name: 'Approve' }).first();
  if (await approve.isVisible().catch(() => false)) {
    await approve.click();
    await sleep(700);
    await shot(desk, 'agency-panel-approve-dialog');
    await desk.getByRole('button', { name: 'Approve' }).last().click();
    await sleep(1500);
  }
  await shot(desk, 'agency-panel-after');
});

console.log('\n===== SUMMARY =====');
for (const r of results) console.log(r);
await browser.close();
