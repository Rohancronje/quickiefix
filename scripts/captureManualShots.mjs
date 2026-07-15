/**
 * Full smoke test + screenshot capture for the user manuals.
 * Runs against STAGING (safe playground, all passwords "password").
 * Two phone contexts live one job end-to-end (customer + tradie), then a
 * desktop context walks the company portal and the agency portal.
 * Screenshots land in "User Manuals/images-v2/". Steps are fault-tolerant:
 * a failed step logs FAIL and the run continues.
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
    results.push(`FAIL ${name}: ${String(e.message).slice(0, 140)}`);
    console.log(`FAIL ${name}: ${String(e.message).slice(0, 140)}`);
  }
}
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page, email) {
  await page.goto(`${APP}/login`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill('password');
  await page.getByText('Log in', { exact: true }).last().click();
  await page.waitForURL(/home|dashboard/, { timeout: 20000 });
  await sleep(1500);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });

/* ---------------------------------------------------------------- PHONES -- */
const custCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const tradCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const cust = await custCtx.newPage();
const trad = await tradCtx.newPage();

/* Customer: entry screens */
await step('customer welcome', async () => {
  await cust.goto(`${APP}/welcome`);
  await sleep(1500);
  await shot(cust, 'customer-welcome');
});
await step('customer register page', async () => {
  await cust.goto(`${APP}/register`);
  await sleep(1200);
  await shot(cust, 'customer-register');
});
await step('tradie register page', async () => {
  await cust.goto(`${APP}/register-tradie`);
  await sleep(1200);
  await shot(cust, 'tradie-register');
});
await step('customer login page', async () => {
  await cust.goto(`${APP}/login`);
  await sleep(800);
  await shot(cust, 'customer-login');
});

/* Customer login + home */
await step('customer login', async () => login(cust, 'User1@testaccount.com'));
await step('customer home', async () => {
  await cust.goto(`${APP}/home`);
  await sleep(2500);
  await shot(cust, 'customer-home');
});

/* Managed-property variant of the request flow (abandoned, no submit) */
await step('newjob managed-property steps', async () => {
  await cust.goto(`${APP}/new-job?trade=plumber`);
  await sleep(1200);
  await cust.getByPlaceholder(/hot water cylinder/).fill('Leaking tap under the kitchen sink');
  await shot(cust, 'customer-newjob-details');
  await cust.getByText('Continue', { exact: true }).click();
  await sleep(800);
  await shot(cust, 'customer-newjob-location');
  await cust.getByText('30 Davey Crescent').first().click();
  await sleep(400);
  await cust.getByText('Continue', { exact: true }).click();
  await sleep(1500);
  await shot(cust, 'customer-newjob-whopays');
});

/* Real lifecycle job: electrician at a typed address */
let jobUrl = '';
await step('newjob electrician lifecycle create', async () => {
  await cust.goto(`${APP}/new-job?trade=electrician`);
  await sleep(1200);
  await cust.getByPlaceholder(/hot water cylinder/).fill('Lounge power point is dead and the breaker keeps tripping');
  await cust.getByText('Continue', { exact: true }).click();
  await sleep(800);
  await cust.getByPlaceholder('12 Queen Street, Auckland').pressSequentially('12 Hurstmere Road, Takapuna', { delay: 30 });
  await sleep(2500);
  const sug = cust.getByText(/Hurstmere Road, Takapuna, Auckland/).first();
  if (await sug.isVisible().catch(() => false)) await sug.click();
  await sleep(500);
  await cust.getByText('Continue', { exact: true }).click();
  await sleep(1800);
  await shot(cust, 'customer-newjob-review');
  await cust.getByText('⚡ Find me a tradie').click();
  await cust.waitForURL(/track/, { timeout: 20000 });
  jobUrl = cust.url();
  await sleep(2000);
  await shot(cust, 'customer-track-searching');
});

/* Tradie side: the offer arrives */
await step('tradie login', async () => login(trad, 'User2@testaccount.com'));
await step('tradie dashboard with offer', async () => {
  await trad.goto(`${APP}/dashboard`);
  await sleep(3000);
  await shot(trad, 'tradie-dashboard-offer');
});
await step('tradie opens the job', async () => {
  await trad.getByText('View photos & ask a question').first().click();
  await sleep(1500);
  await shot(trad, 'tradie-job-offer');
});
await step('tradie asks a question', async () => {
  await trad.getByPlaceholder('Message…').fill('Is the breaker board labelled? Anyone home now?');
  await trad.getByText('Send', { exact: true }).click();
  await sleep(1200);
  await shot(trad, 'tradie-question-sent');
});
await step('customer sees question + replies', async () => {
  await cust.goto(jobUrl);
  await sleep(2000);
  await cust.getByPlaceholder('Message…').fill('Yes labelled, and I am home all afternoon.');
  await cust.getByText('Send', { exact: true }).click();
  await sleep(1000);
  await shot(cust, 'customer-messages');
});
await step('tradie accepts the job', async () => {
  await trad.getByText('Accept job', { exact: true }).first().click();
  await sleep(2500);
  await shot(trad, 'tradie-job-accepted');
});
await step('customer sees confirmed + rates', async () => {
  await cust.goto(jobUrl);
  await sleep(2500);
  await shot(cust, 'customer-track-confirmed');
});
await step('tradie goes travelling', async () => {
  await trad.getByText('Go now').click();
  await sleep(800);
  const notNow = trad.getByText('Not now', { exact: true });
  if (await notNow.isVisible().catch(() => false)) await notNow.click();
  await sleep(1500);
  await shot(trad, 'tradie-job-travelling');
});
await step('customer sees travelling', async () => {
  await cust.goto(jobUrl);
  await sleep(2000);
  await shot(cust, 'customer-track-travelling');
});
await step('tradie arrives on site', async () => {
  await trad.getByText(/I've arrived/).click();
  await sleep(1500);
  await shot(trad, 'tradie-job-onsite');
});
await step('tradie completes with parts', async () => {
  await trad.getByText('Complete job', { exact: true }).first().click();
  await sleep(800);
  await trad.getByText(/Add parts & materials/).click();
  await sleep(400);
  await trad.getByPlaceholder('Part or material').fill('HPM double power point');
  await trad.getByPlaceholder('$0.00').fill('18.50');
  await sleep(300);
  await shot(trad, 'tradie-complete-parts');
  await trad.getByText('Confirm & complete job').click();
  await sleep(2500);
  await shot(trad, 'tradie-completed');
});
await step('customer sees completed + parts + rating', async () => {
  await cust.goto(jobUrl);
  await sleep(2500);
  await shot(cust, 'customer-completed');
});
await step('customer rates 5 stars', async () => {
  const stars = cust.getByText('★');
  const count = await stars.count();
  if (count >= 5) await stars.nth(4).click();
  else await cust.getByText('☆').last().click();
  await sleep(300);
  const tag = cust.getByText('Would recommend');
  if (await tag.isVisible().catch(() => false)) await tag.click();
  const submit = cust.getByText(/Submit|Send rating|Rate/i).last();
  if (await submit.isVisible().catch(() => false)) await submit.click();
  await sleep(1500);
  await shot(cust, 'customer-rated');
});

/* Customer: remaining tabs */
await step('customer activity', async () => {
  await cust.goto(`${APP}/activity`);
  await sleep(2000);
  await shot(cust, 'customer-activity');
});
await step('customer account', async () => {
  await cust.goto(`${APP}/account`);
  await sleep(2000);
  await shot(cust, 'customer-account');
});

/* Tradie: remaining tabs */
await step('tradie timesheets', async () => {
  await trad.goto(`${APP}/timesheets`);
  await sleep(2000);
  await shot(trad, 'tradie-timesheets');
});
await step('tradie profile', async () => {
  await trad.goto(`${APP}/profile`);
  await sleep(2000);
  await shot(trad, 'tradie-profile');
});
await step('tradie dashboard after job', async () => {
  await trad.goto(`${APP}/dashboard`);
  await sleep(2000);
  await shot(trad, 'tradie-dashboard');
});

/* --------------------------------------------------------------- PORTALS -- */
const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const desk = await deskCtx.newPage();

async function portalLogin(email) {
  await desk.goto(PORTAL);
  await sleep(1200);
  const out = desk.getByRole('button', { name: 'Log out' });
  if (await out.isVisible().catch(() => false)) {
    await out.click();
    await sleep(1200);
  }
  await desk.getByPlaceholder('you@company.co.nz').fill(email);
  await desk.getByPlaceholder('••••••••').fill('password');
  await desk.getByRole('button', { name: 'Sign in' }).click();
  await sleep(2500);
}

/* Company portal */
await step('portal login page', async () => {
  await desk.goto(PORTAL);
  await sleep(1200);
  await shot(desk, 'portal-login');
});
await step('company login + dashboard', async () => {
  await portalLogin('demo-company@quickiefix.store');
  await shot(desk, 'company-dashboard');
});
const companyPages = [
  ['/jobs', 'company-jobs'],
  ['/team', 'company-team'],
  ['/timesheets', 'company-timesheets'],
  ['/reputation', 'company-reputation'],
  ['/billing', 'company-billing'],
  ['/agents', 'company-agency-panels'],
  ['/support', 'company-support'],
  ['/settings', 'company-settings'],
];
for (const [path, name] of companyPages) {
  await step(`company ${name}`, async () => {
    await desk.goto(`${PORTAL}${path}`);
    await sleep(2000);
    await shot(desk, name);
  });
}
await step('company joins agency panel', async () => {
  await desk.goto(`${PORTAL}/agents`);
  await sleep(1500);
  await desk.getByPlaceholder(/Agent code/).fill('QF-AG-G37B');
  await desk.getByRole('button', { name: 'Join panel' }).click();
  await sleep(2000);
  await shot(desk, 'company-panel-joined');
});

/* Agency portal */
await step('agency login + dashboard', async () => {
  await portalLogin('demo-property@quickiefix.store');
  await shot(desk, 'agency-dashboard');
});
const agencyTabs = [
  ['Request help', 'agency-request-help'],
  ['Jobs', 'agency-jobs'],
  ['Tradie panel', 'agency-panel'],
  ['Properties', 'agency-properties'],
  ['Owner reports', 'agency-reports'],
  ['Support', 'agency-support'],
  ['Settings', 'agency-settings'],
];
for (const [tab, name] of agencyTabs) {
  await step(`agency ${name}`, async () => {
    await desk.getByText(tab, { exact: true }).first().click();
    await sleep(2000);
    await shot(desk, name);
  });
}
await step('agency request-help filled', async () => {
  await desk.getByText('Request help', { exact: true }).first().click();
  await sleep(1500);
  await desk.locator('select').first().selectOption({ index: 1 });
  await sleep(800);
  await desk.locator('select').nth(2).selectOption({ label: 'Plumber' });
  await sleep(1500);
  await shot(desk, 'agency-request-help-filled');
});
await step('agency approves company on panel', async () => {
  await desk.getByText('Tradie panel', { exact: true }).first().click();
  await sleep(1500);
  const approve = desk.getByRole('button', { name: 'Approve' }).first();
  if (await approve.isVisible().catch(() => false)) {
    await approve.click();
    await sleep(600);
    await shot(desk, 'agency-panel-approve-dialog');
    await desk.getByRole('button', { name: 'Approve' }).last().click();
    await sleep(1200);
  }
  await shot(desk, 'agency-panel-after');
});

console.log('\n===== SUMMARY =====');
for (const r of results) console.log(r);
await browser.close();
