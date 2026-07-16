import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const KEY = 'AIzaSyAp74jq40qkb8QgI-Du4lAxvfcMF_V1RTw';
const PROJECT = 'quickiefix-staging';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const NOW = Date.now();
const TTL = 14 * 24 * 60 * 60 * 1000;

async function signIn(email, pw = 'password') {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, returnSecureToken: true }) });
  const j = await r.json(); return j.idToken ? { uid: j.localId, token: j.idToken } : null;
}
async function getDoc(token, path) {
  const r = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json() };
}
async function runQuery(token, sq) {
  const r = await fetch(`${BASE}:runQuery`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: sq }) });
  const b = await r.json(); return Array.isArray(b) ? b.filter(x => x.document) : [];
}
const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: { stringValue: v } } });
const P = (n, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);

const co = await signIn('demo-company@quickiefix.store');
const companyId = (await runQuery(co.token, { from: [{ collectionId: 'companies' }], where: eq('adminUserId', co.uid), limit: 1 }))[0].document.name.split('/').pop();
const code = 'ZZVERIFY' + String(NOW).slice(-3);
const tagId = 'verifytag_' + String(NOW).slice(-4);

// create an issued tag as the company admin (allowed by create rule)
const create = await fetch(`${BASE}/companyTags?documentId=${tagId}`, {
  method: 'POST', headers: { Authorization: `Bearer ${co.token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: {
    id: { stringValue: tagId }, companyId: { stringValue: companyId }, companyName: { stringValue: 'North Shore Trades' },
    code: { stringValue: code }, issuedToName: { stringValue: 'Verify Seat' }, issuedToEmail: { stringValue: 'verifyseat@test.co' },
    issuedToPhone: { stringValue: '021000000' }, status: { stringValue: 'issued' },
    createdAt: { integerValue: NOW }, expiresAt: { integerValue: NOW + TTL } } }) });
P('company admin can create an issued tag', create.status === 200, `HTTP ${create.status}`);

// read checks
P('company admin CAN read own tag', (await getDoc(co.token, `companyTags/${tagId}`)).status === 200);
const outsider = await signIn('User7@testaccount.com');
const outRead = await getDoc(outsider.token, `companyTags/${tagId}`);
P('outsider CANNOT read the tag (no PII leak)', outRead.status === 403, `HTTP ${outRead.status}`);

// find a fresh tradie (role tradie, no activeTagId) to claim it
let fresh = null;
for (let n = 8; n <= 20 && !fresh; n++) {
  const acct = await signIn(`User${n}@testaccount.com`);
  if (!acct) continue;
  const own = await getDoc(acct.token, `users/${acct.uid}`);
  const f = own.body.fields || {};
  if (f.role?.stringValue === 'tradie' && !f.activeTagId) fresh = { n, email: `User${n}@testaccount.com`, uid: acct.uid };
}
if (!fresh) { P('found a fresh tradie to claim', false, 'none available — skipping claim'); process.exit(0); }
console.log('claiming as User' + fresh.n);

// claim via the callable (SDK)
const app = initializeApp({ apiKey: KEY, authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, appId: '1:980457473979:web:9e220ffbc5f80405c2669e' });
const cred = await signInWithEmailAndPassword(getAuth(app), fresh.email, 'password');
await cred.user.getIdToken(true);
await new Promise((r) => setTimeout(r, 800));
try {
  const res = await httpsCallable(getFunctions(app), 'claimSeatTag')({ code, engagement: 'employee' });
  P('claimSeatTag succeeds via callable', !!res.data?.name, `company=${res.data?.name}`);
} catch (e) {
  P('claimSeatTag succeeds via callable', false, String(e.message).slice(0, 80));
}
// verify tag now claimed
const after = await getDoc(co.token, `companyTags/${tagId}`);
const st = after.body.fields?.status?.stringValue;
const claimer = after.body.fields?.claimedByUserId?.stringValue;
P('tag is now claimed by the tradie', st === 'claimed' && claimer === fresh.uid, `status=${st}`);
console.log('(staging residue: tag ' + tagId + ' + User' + fresh.n + ' activeTagId — staging only)');
process.exit(0);
