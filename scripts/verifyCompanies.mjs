const KEY = 'AIzaSyAp74jq40qkb8QgI-Du4lAxvfcMF_V1RTw';
const PROJECT = 'quickiefix-staging';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
async function signIn(email, pw = 'password') {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, returnSecureToken: true }) });
  const j = await r.json(); if (!j.idToken) throw new Error(email + ' signin: ' + JSON.stringify(j.error?.message)); return { uid: j.localId, token: j.idToken };
}
async function getDoc(token, path) {
  const r = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.status;
}
async function runQuery(token, sq) {
  const r = await fetch(`${BASE}:runQuery`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: sq }) });
  const b = await r.json(); return Array.isArray(b) ? b.filter(x => x.document) : [];
}
async function patchUser(adminToken, uid, companyId) {
  const r = await fetch(`${BASE}/users/${uid}?updateMask.fieldPaths=companyId`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { companyId: { stringValue: companyId } } }) });
  return r.status;
}
const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: { stringValue: v } } });
const P = (n, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);

const co = await signIn('demo-company@quickiefix.store');
const companyId = (await runQuery(co.token, { from: [{ collectionId: 'companies' }], where: eq('adminUserId', co.uid), limit: 1 }))[0].document.name.split('/').pop();
console.log('company id:', companyId);

// owner read
P('company admin CAN read own company', (await getDoc(co.token, `companies/${companyId}`)) === 200);

// non-member read denied
const cust = await signIn('User1@testaccount.com');
P('non-member (customer) CANNOT read company', (await getDoc(cust.token, `companies/${companyId}`)) === 403, `HTTP ${await getDoc(cust.token, `companies/${companyId}`)}`);

// make User8 a member, then member read
const admin = await signIn('admin@quickiefix.store', 'password');
const u8 = await signIn('User8@testaccount.com');
const patched = await patchUser(admin.token, u8.uid, companyId);
P('admin set User8.companyId (member setup)', patched === 200, `HTTP ${patched}`);
await new Promise((r) => setTimeout(r, 1000));
const memberRead = await getDoc(u8.token, `companies/${companyId}`);
P('member tradie CAN read their company (job-accept path)', memberRead === 200, `HTTP ${memberRead}`);

// unconstrained companies list rejected for non-admin
const all = await runQuery(cust.token, { from: [{ collectionId: 'companies' }] });
P('unconstrained companies list rejected for non-admin', all.length === 0);
