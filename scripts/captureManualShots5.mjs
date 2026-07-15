/**
 * Recapture the 14 dud frames (splash/spinner caught by fixed sleeps).
 * Every shot now waits for real content: body text length + a settle pause.
 */
import { chromium } from 'playwright';
import { join } from 'node:path';

const APP = 'https://quickiefix-app-staging.web.app';
const PORTAL = 'https://quickiefix-portal-staging.web.app';
const OUT = join(process.cwd(), 'User Manuals', 'images-v2');
const results = [];
async function step(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    results.push(`OK   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}: ${String(e.message).slice(0, 110)}`);
    results.push(`FAIL ${name}`);
  }
}
const shot = (p, n) => p.screenshot({ path: join(OUT, `${n}.png`) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitLoaded(page, minText = 250) {
  await page.waitForFunction((n) => document.body.innerText.length > n, minText, { timeout: 30000 });
  await sleep(1200);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const custCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const tradCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const cust = await custCtx.newPage();
const trad = await tradCtx.newPage();

async function login(page, email) {
  await page.goto(`${APP}/login`);
  await waitLoaded(page, 60);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill('password');
  await page.getByText('Log in', { exact: true }).last().click();
  await page.waitForURL(/home|dashboard/, { timeout: 20000 });
  await waitLoaded(page);
}

await step('logins', async () => {
  await login(cust, 'User1@testaccount.com');
  await login(trad, 'User2@testaccount.com');
});

/* Simple app recaptures */
for (const [page, path, name] of [
  [cust, '/activity', 'customer-activity'],
  [trad, '/dashboard', 'tradie-dashboard'],
  [trad, '/timesheets', 'tradie-timesheets'],
  [trad, '/profile', 'tradie-profile'],
]) {
  await step(name, async () => {
    await page.goto(`${APP}${path}`);
    await waitLoaded(page);
    await shot(page, name);
  });
}

/* Tradie's completed-job screen via customer's activity link */
await step('tradie-completed', async () => {
  await cust.goto(`${APP}/activity`);
  await waitLoaded(cust);
  await cust.getByText(/Lounge power point/).first().click();
  await cust.waitForURL(/track\//, { timeout: 15000 });
  const id = cust.url().split('/track/')[1].split('?')[0];
  await trad.goto(`${APP}/job/${id}`);
  await waitLoaded(trad);
  await shot(trad, 'tradie-completed');
});

/* Mini lifecycle for the customer travelling frame */
let jobUrl = '';
await step('mini lifecycle create', async () => {
  await cust.goto(`${APP}/new-job?trade=electrician`);
  await waitLoaded(cust, 100);
  await cust.getByPlaceholder(/hot water cylinder/).fill('Heat pump remote not responding');
  await cust.getByText('Continue', { exact: true }).click();
  await sleep(900);
  await cust.getByPlaceholder('12 Queen Street, Auckland').fill('8 Como Street, Takapuna, Auckland');
  await cust.getByText('Continue', { exact: true }).click();
  await sleep(1800);
  await cust.getByText('⚡ Find me a tradie').click();
  await cust.waitForURL(/track/, { timeout: 25000 });
  jobUrl = cust.url();
});
await step('tradie accepts from dashboard', async () => {
  for (let i = 0; i < 15; i++) {
    await trad.goto(`${APP}/dashboard`);
    await waitLoaded(trad);
    if (await trad.getByText('Accept job', { exact: true }).first().isVisible().catch(() => false)) break;
    await sleep(5000);
  }
  await trad.getByText('Accept job', { exact: true }).first().click();
  await sleep(3000);
});
await step('tradie go now', async () => {
  await trad.goto(`${APP}/dashboard`);
  await waitLoaded(trad);
  await trad.getByText('Active job').first().click();
  await trad.waitForURL(/job\//, { timeout: 15000 });
  await waitLoaded(trad);
  for (let i = 0; i < 4; i++) {
    const go = trad.getByText('Go now');
    if (await go.isVisible().catch(() => false)) await go.click().catch(() => {});
    await sleep(1500);
    const notNow = trad.getByText('Not now', { exact: true });
    if (await notNow.isVisible().catch(() => false)) await notNow.click();
    await sleep(1200);
    if (await trad.getByText(/arrived/).first().isVisible().catch(() => false)) break;
  }
});
await step('customer-track-travelling', async () => {
  await cust.goto(jobUrl);
  await waitLoaded(cust);
  await shot(cust, 'customer-track-travelling');
});
await step('finish mini lifecycle', async () => {
  for (let i = 0; i < 5; i++) {
    const arr = trad.getByText(/arrived — start job/).first();
    if (await arr.isVisible().catch(() => false)) await arr.click().catch(() => {});
    await sleep(2500);
    if (await trad.getByText('Complete job', { exact: true }).first().isVisible().catch(() => false)) break;
  }
  await trad.getByText('Complete job', { exact: true }).first().click();
  await sleep(1200);
  await trad.getByText('Confirm & complete job').click();
  await sleep(2500);
});

/* Company portal recaptures */
const desk = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
await step('company login', async () => {
  await desk.goto(PORTAL);
  await waitLoaded(desk, 60);
  await desk.getByPlaceholder('you@company.co.nz').fill('demo-company@quickiefix.store');
  await desk.getByPlaceholder('••••••••').fill('password');
  await desk.getByRole('button', { name: 'Sign in' }).click();
  await waitLoaded(desk, 300);
});
for (const [path, name] of [
  ['/jobs', 'company-jobs'],
  ['/team', 'company-team'],
  ['/timesheets', 'company-timesheets'],
  ['/reputation', 'company-reputation'],
  ['/billing', 'company-billing'],
  ['/agents', 'company-agency-panels'],
  ['/support', 'company-support'],
  ['/settings', 'company-settings'],
]) {
  await step(name, async () => {
    await desk.goto(`${PORTAL}${path}`);
    await waitLoaded(desk, 300);
    await shot(desk, name);
  });
}

console.log('\n===== SUMMARY =====');
for (const r of results) console.log(r);
await browser.close();
