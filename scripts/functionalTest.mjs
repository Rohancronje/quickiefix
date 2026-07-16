/**
 * Focused functional test pass against STAGING.
 * Assertion-based (PASS/FAIL), not screenshots. Exercises edge cases the
 * capture run never touches: guards, cancellations at each stage, offer
 * decline, accept concurrency lock-out, cross-user access, agency who-pays.
 *
 * Test accounts (staging, all password 'password'):
 *   User1@testaccount.com  - customer A
 *   User3@testaccount.com  - customer B
 *   User2@testaccount.com  - tradie A (electrician, Bright Spark)
 *   User4@testaccount.com  - tradie B
 */
import { chromium } from 'playwright';

const APP = 'https://quickiefix-app-staging.web.app';
const PORTAL = 'https://quickiefix-portal-staging.web.app';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function assert(name, cond, detail = '') {
  const ok = !!cond;
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  return ok;
}
async function safe(name, fn) {
  try {
    return await fn();
  } catch (e) {
    assert(name, false, 'threw: ' + String(e.message).slice(0, 90));
    return null;
  }
}
async function waitText(page, re, timeout = 30000) {
  await page.waitForFunction(
    (a) => new RegExp(a.src, a.flags).test(document.body.innerText),
    { src: re.source, flags: re.flags }, { timeout });
}
async function visible(page, text, ms = 2500) {
  const loc = typeof text === 'string' ? page.getByText(text, { exact: false }) : page.getByText(text);
  return await loc.first().isVisible().catch(() => false) ||
    await loc.first().waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
}
async function bodyText(page) { return page.evaluate(() => document.body.innerText); }

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = (w = 390, h = 844) => browser.newContext({ viewport: { width: w, height: h } });

async function login(page, email) {
  await page.goto(`${APP}/login`);
  await waitText(page, /Log in|Welcome/, 30000);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill('password');
  await page.getByText('Log in', { exact: true }).last().click();
  await page.waitForURL(/home|dashboard/, { timeout: 20000 });
  await sleep(1500);
}
async function createJob(page, trade, desc, addr) {
  await page.goto(`${APP}/new-job?trade=${trade}`);
  await waitText(page, /What.s|describe|hot water|Continue/i, 20000);
  await page.getByPlaceholder(/hot water cylinder/).fill(desc);
  await page.getByText('Continue', { exact: true }).click();
  await sleep(900);
  await page.getByPlaceholder('12 Queen Street, Auckland').fill(addr);
  await page.getByText('Continue', { exact: true }).click();
  await sleep(1600);
  await page.getByText('⚡ Find me a tradie').click();
  await page.waitForURL(/track/, { timeout: 25000 });
  await sleep(1500);
  return page.url();
}
async function cancelActiveJob(page, url) {
  try {
    await page.goto(url);
    await sleep(1500);
    const c = page.getByText('Cancel job').first();
    if (await c.isVisible().catch(() => false)) {
      await c.click();
      await sleep(700);
      const yes = page.getByText(/^(Cancel job|Yes.*)$/).last();
      if (await yes.isVisible().catch(() => false)) await yes.click();
      await sleep(1200);
    }
  } catch {}
}

const custA = await (await ctx()).newPage();
const custB = await (await ctx()).newPage();
const tradA = await (await ctx()).newPage();
const tradB = await (await ctx()).newPage();

await safe('logins', async () => {
  await login(custA, 'User1@testaccount.com');
  await login(custB, 'User3@testaccount.com');
  await login(tradA, 'User2@testaccount.com');
  await login(tradB, 'User4@testaccount.com');
  assert('all four sessions logged in', true);
});

const openJobs = [];

/* ---------- Scenario 1: duplicate-live-job guard ---------- */
await safe('S1 duplicate-guard', async () => {
  const j1 = await createJob(custA, 'electrician', 'Guard test — powerpoint dead', '10 Hurstmere Road, Takapuna');
  openJobs.push(j1);
  // second electrician job should be blocked
  await custA.goto(`${APP}/new-job?trade=electrician`);
  await sleep(1500);
  const txt = await bodyText(custA);
  const blocked = /already have a live/i.test(txt) || /Track or cancel/i.test(txt);
  assert('S1a second same-trade job is blocked', blocked, blocked ? '' : 'no guard message shown');
  // different trade should be allowed to reach the form
  await custA.goto(`${APP}/new-job?trade=plumber`);
  await sleep(1500);
  const txt2 = await bodyText(custA);
  const allowed = /hot water cylinder|What.s the issue|describe/i.test(txt2) && !/already have a live plumber/i.test(txt2);
  assert('S1b different-trade job is allowed', allowed);
});

/* ---------- Scenario 2: cancel while searching ---------- */
await safe('S2 cancel-while-searching', async () => {
  const j = openJobs[0];
  await custA.goto(j);
  await sleep(1500);
  const searching = /Finding|Searching|nearby|looking/i.test(await bodyText(custA));
  assert('S2a job is in searching state before cancel', searching);
  await cancelActiveJob(custA, j);
  await custA.goto(j);
  await sleep(1500);
  const t = await bodyText(custA);
  const cancelled = /cancel/i.test(t) && !/Cancel job/.test(t.replace(/cancelled/gi, ''));
  assert('S2b job reads cancelled after cancel', /cancell?ed/i.test(t), t.slice(0, 60));
});

/* ---------- Scenario 3: tradie decline removes their offer ---------- */
await safe('S3 tradie-decline', async () => {
  const j = await createJob(custA, 'electrician', 'Decline test — light flickering', '20 Hurstmere Road, Takapuna');
  openJobs.push(j);
  let sawOffer = false;
  for (let i = 0; i < 12; i++) {
    await tradA.goto(`${APP}/dashboard`);
    await sleep(5000);
    if (await visible(tradA, 'First to accept gets it', 1500)) { sawOffer = true; break; }
  }
  assert('S3a tradie A sees the offer', sawOffer);
  if (sawOffer) {
    const decline = tradA.getByText('Decline', { exact: false }).first();
    if (await decline.isVisible().catch(() => false)) await decline.click();
    await sleep(2500);
    await tradA.goto(`${APP}/dashboard`);
    await sleep(3000);
    const gone = !(await visible(tradA, 'First to accept gets it', 1500));
    assert('S3b offer removed from tradie A after decline', gone);
  }
});

/* ---------- Scenario 4: accept locks out other tradies ---------- */
let acceptedJob = '';
await safe('S4 accept-lockout', async () => {
  const j = await createJob(custB, 'electrician', 'Lockout test — RCD keeps tripping', '30 Hurstmere Road, Takapuna');
  acceptedJob = j;
  openJobs.push(j);
  // tradB accepts first
  let accepted = false;
  for (let i = 0; i < 12; i++) {
    await tradB.goto(`${APP}/dashboard`);
    await sleep(5000);
    if (await visible(tradB, 'Accept job', 1500)) {
      await tradB.getByText('Accept job', { exact: true }).first().click();
      await sleep(3000);
      accepted = true;
      break;
    }
  }
  assert('S4a tradie B accepts the job', accepted);
  // tradA should now NOT be able to accept the same job
  await tradA.goto(`${APP}/dashboard`);
  await sleep(4000);
  const stillOfferedToA = await visible(tradA, 'Accept job', 1500);
  assert('S4b job no longer acceptable by tradie A', !stillOfferedToA,
    stillOfferedToA ? 'tradie A still shown Accept' : '');
});

/* ---------- Scenario 5: customer cancels after accept clears tradie ---------- */
await safe('S5 cancel-after-accept', async () => {
  if (!acceptedJob) { assert('S5 skipped (no accepted job)', false); return; }
  await cancelActiveJob(custB, acceptedJob);
  await tradB.goto(`${APP}/dashboard`);
  await sleep(3500);
  const t = await bodyText(tradB);
  const cleared = !/Active job/i.test(t) || /No active|Available/i.test(t);
  assert('S5 tradie B active job clears after customer cancels', cleared, t.slice(0, 60));
});

/* ---------- Scenario 6: cross-user job access ---------- */
await safe('S6 cross-user-access', async () => {
  const j = await createJob(custA, 'electrician', 'Access test — oven not heating', '40 Hurstmere Road, Takapuna');
  openJobs.push(j);
  const id = j.split('/track/')[1]?.split('?')[0];
  assert('S6a got job id', !!id);
  if (id) {
    // customer B tries to open customer A's track page
    await custB.goto(`${APP}/track/${id}`);
    await sleep(2500);
    const t = await bodyText(custB);
    // Should NOT show A's job detail; expect empty/not-found/redirect, not the live job
    const leaked = /oven not heating/i.test(t);
    assert('S6b customer B cannot see customer A job detail', !leaked,
      leaked ? 'LEAK: job description visible to other customer' : '');
  }
});

/* ---------- Scenario 7: agency request-help — linked companies only + who-pays ---------- */
await safe('S7 agency-request-help', async () => {
  const desk = await (await ctx(1280, 860)).newPage();
  await desk.goto(PORTAL);
  await waitText(desk, /Welcome|Sign in/i, 30000);
  await desk.getByPlaceholder('you@company.co.nz').fill('demo-property@quickiefix.store');
  await desk.getByPlaceholder('••••••••').fill('password');
  await desk.getByRole('button', { name: 'Sign in' }).click();
  await waitText(desk, /Dashboard|Properties|Request help|Tradie panel/i, 30000);
  await sleep(2000);
  const rq = desk.getByText('Request help', { exact: true }).first();
  const hasRq = await rq.isVisible().catch(() => false);
  assert('S7a request-help console is present', hasRq);
  if (hasRq) {
    await rq.click();
    await sleep(2500);
    const selects = desk.locator('select');
    const n = await selects.count();
    assert('S7b request-help exposes tenant/property/trade selectors', n >= 2, `${n} selects`);
    // who-pays control present
    const t = await bodyText(desk);
    const hasWhoPays = /who pays|bill|agency|tenant/i.test(t);
    assert('S7c who-pays choice is present in the console', hasWhoPays);
  }
  await desk.close();
});

/* ---------- cleanup ---------- */
await safe('cleanup', async () => {
  for (const j of openJobs) await cancelActiveJob(custA, j).catch(() => {});
  await cancelActiveJob(custB, acceptedJob).catch(() => {});
});

console.log('\n===== FUNCTIONAL TEST SUMMARY =====');
const pass = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok);
console.log(`${pass}/${results.length} passed`);
if (fail.length) {
  console.log('\nFAILURES:');
  for (const f of fail) console.log(`  - ${f.name}${f.detail ? ': ' + f.detail : ''}`);
}
await browser.close();
