import { chromium } from 'playwright';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const APP = 'https://quickiefix-app-staging.web.app';
const KEY = 'AIzaSyAp74jq40qkb8QgI-Du4lAxvfcMF_V1RTw';
const PROJECT = 'quickiefix-staging';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const APPCFG = { apiKey: KEY, authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, appId: '1:980457473979:web:9e220ffbc5f80405c2669e' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const P = (n, ok, x = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);

async function signIn(email) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'password', returnSecureToken: true }) });
  const j = await r.json(); return { uid: j.localId, token: j.idToken };
}
async function getJob(token, id) { const r = await fetch(`${BASE}/jobs/${id}`, { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json() }; }
async function patchDoc(token, path, mask, fields) {
  const r = await fetch(`${BASE}/${path}?${mask.map(m => 'updateMask.fieldPaths=' + m).join('&')}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  return r.status;
}

async function runQuery(token, sq) {
  const r = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: sq }) });
  const b = await r.json(); return Array.isArray(b) ? b.filter(x => x.document) : [];
}

// 0. Cancel any live job the customer already has (clears the duplicate guard;
//    also confirms a customer can still cancel under the tightened rule).
const cu0 = await signIn('User11@testaccount.com');
const LIVE = ['searching', 'accepted', 'confirmed', 'travelling', 'on_site'];
const mine = await runQuery(cu0.token, { from: [{ collectionId: 'jobs' }], where: { fieldFilter: { field: { fieldPath: 'customerId' }, op: 'EQUAL', value: { stringValue: cu0.uid } } } });
for (const d of mine) {
  const id = d.document.name.split('/').pop();
  if (LIVE.includes(d.document.fields.status?.stringValue)) {
    await patchDoc(cu0.token, `jobs/${id}`, ['status', 'cancelledBy'], { status: { stringValue: 'cancelled' }, cancelledBy: { stringValue: 'customer' } });
  }
}
console.log('cleared customer live jobs');

// 1. Make User2 available near Takapuna so they land in the dispatch pool.
const t2 = await signIn('User2@testaccount.com');
await patchDoc(t2.token, `users/${t2.uid}`, ['status', 'baseLocation'], {
  status: { stringValue: 'available' },
  baseLocation: { mapValue: { fields: { latitude: { doubleValue: -36.7861 }, longitude: { doubleValue: 174.7756 } } } },
});
console.log('User2 set available near Takapuna');

// 2. Customer creates an electrician job at Takapuna (via the app).
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const cust = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await cust.goto(`${APP}/login`); await sleep(3000);
await cust.getByPlaceholder('you@example.com').fill('User11@testaccount.com');
await cust.getByPlaceholder('••••••••').fill('password');
await cust.getByText('Log in', { exact: true }).last().click();
await cust.waitForURL(/home|dashboard/, { timeout: 20000 }); await sleep(1500);
await cust.goto(`${APP}/new-job?trade=electrician`); await sleep(3000);
await cust.getByPlaceholder(/hot water cylinder/).fill('Batch-4 verify: powerpoint replacement');
await cust.getByText('Continue', { exact: true }).click(); await sleep(1000);
await cust.getByPlaceholder('12 Queen Street, Auckland').fill('12 Hurstmere Road, Takapuna');
await cust.getByText('Continue', { exact: true }).click(); await sleep(1800);
await cust.getByText('⚡ Find me a tradie').click();
await cust.waitForURL(/track/, { timeout: 25000 }); await sleep(1500);
const jobId = cust.url().split('/track/')[1].split('?')[0];
await browser.close();
console.log('job', jobId);

const cu = await signIn('User11@testaccount.com');
const created = await getJob(cu.token, jobId);
const cands = (created.body.fields?.dispatch?.mapValue?.fields?.candidateIds?.arrayValue?.values || []).map(v => v.stringValue);
P('User2 is in the dispatch pool', cands.includes(t2.uid), `${cands.length} candidates`);

// 3. User2 accepts via the acceptJob CALLABLE (server-side assignment).
const app = initializeApp(APPCFG);
const cred = await signInWithEmailAndPassword(getAuth(app), 'User2@testaccount.com', 'password');
await cred.user.getIdToken(true); await sleep(700);
try {
  await httpsCallable(getFunctions(app), 'acceptJob')({ jobId });
  P('acceptJob callable succeeds', true);
} catch (e) { P('acceptJob callable succeeds', false, String(e.message).slice(0, 70)); }
await sleep(1000);
const job = await getJob(cu.token, jobId);
const f = job.body.fields || {};
P('server set status=confirmed + tradieId', f.status?.stringValue === 'confirmed' && f.tradieId?.stringValue === t2.uid, `status=${f.status?.stringValue}`);
P('server wrote rateSnapshot (financial integrity)', !!f.rateSnapshot);

// 4. FORGE TESTS
const out = await signIn('User7@testaccount.com');
P('outsider CANNOT forge tradieId', (await patchDoc(out.token, `jobs/${jobId}`, ['tradieId'], { tradieId: { stringValue: out.uid } })) === 403);
const forge2 = await patchDoc(t2.token, `jobs/${jobId}`, ['rateSnapshot'], { rateSnapshot: { mapValue: { fields: { source: { stringValue: 'hacked' } } } } });
P('assigned tradie CANNOT rewrite rateSnapshot', forge2 === 403, `HTTP ${forge2}`);
const legit = await patchDoc(t2.token, `jobs/${jobId}`, ['status'], { status: { stringValue: 'travelling' } });
P('assigned tradie CAN still advance status (travel)', legit === 200, `HTTP ${legit}`);
process.exit(0);
