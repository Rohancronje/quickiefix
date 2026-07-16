/**
 * Security boundary: can user B read user A's job by direct URL?
 * A = User1 (owns "Guard test" job). B = User5 (unrelated account).
 */
import { chromium } from 'playwright';
const APP = 'https://quickiefix-app-staging.web.app';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function login(page, email) {
  await page.goto(`${APP}/login`);
  await sleep(3000);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill('password');
  await page.getByText('Log in', { exact: true }).last().click();
  await page.waitForURL(/home|dashboard/, { timeout: 20000 });
  await sleep(1500);
}

// A: grab a job id owned by User1
const a = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await login(a, 'User1@testaccount.com');
await a.goto(`${APP}/activity`);
await sleep(2500);
await a.getByText('Guard test — powerpoint dead').first().click();
await a.waitForURL(/track\//, { timeout: 15000 });
await sleep(1500);
const url = a.url();
const id = url.split('/track/')[1].split('?')[0];
const aText = await a.evaluate(() => document.body.innerText);
const aSeesOwn = /Guard test — powerpoint dead/.test(aText) && /North Shore Sparkies/.test(aText);
console.log('OWNER can see own job:', aSeesOwn, '| id:', id);

// B: unrelated user tries the same URL
const b = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await login(b, 'User5@testaccount.com');
await b.goto(`${APP}/track/${id}`);
await sleep(4000);
const bText = await b.evaluate(() => document.body.innerText);
const bUrl = b.url();
const leaked = /Guard test — powerpoint dead/.test(bText);
const rates = /North Shore Sparkies/.test(bText);
console.log('\n=== USER B (User5) viewing User1 job ===');
console.log('B final URL:', bUrl);
console.log('B sees job description (LEAK if true):', leaked);
console.log('B sees tradie/rates (LEAK if true):', rates);
console.log('B page text (first 300):', JSON.stringify(bText.slice(0, 300)));
console.log('\nRESULT:', (leaked || rates) ? 'FAIL — cross-user data leak' : 'PASS — no cross-user access');

await browser.close();
