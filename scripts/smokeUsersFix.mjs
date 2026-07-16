import { chromium } from 'playwright';
const APP = 'https://quickiefix-app-staging.web.app';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const cust = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();

async function login(p, email) {
  await p.goto(`${APP}/login`);
  await sleep(3000);
  await p.getByPlaceholder('you@example.com').fill(email);
  await p.getByPlaceholder('••••••••').fill('password');
  await p.getByText('Log in', { exact: true }).last().click();
  await p.waitForURL(/home|dashboard/, { timeout: 20000 });
  await sleep(1500);
}
await login(cust, 'User1@testaccount.com');

// Open the existing confirmed job's track page and confirm the tradie profile
// card renders (this is the useUser -> publicProfiles path).
await cust.goto(`${APP}/activity`);
await sleep(2500);
await cust.getByText('Guard test — powerpoint dead').first().click();
await cust.waitForURL(/track\//, { timeout: 15000 });
await sleep(2500);
const t = await cust.evaluate(() => document.body.innerText);
const hasTradie = /North Shore Sparkies/.test(t);
const hasRating = /\b4\.\d\b/.test(t) || /Rating|★/.test(t);
const hasJobsDone = /Jobs done|jobs? done/i.test(t);
console.log('track shows tradie business name:', hasTradie);
console.log('track shows rating:', hasRating);
console.log('track shows jobs-done stat:', hasJobsDone);
console.log('RESULT:', hasTradie && hasRating ? 'PASS — tradie profile renders from publicProfiles' : 'FAIL — profile card blank');
await browser.close();
