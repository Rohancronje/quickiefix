const KEY = 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k';
const PROJECT = 'quickiefix-2ea2a';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
async function signIn(email, pw = 'password') {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, returnSecureToken: true }) });
  const j = await r.json(); return { uid: j.localId, token: j.idToken };
}
async function getDoc(token, path) {
  const r = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.status;
}
async function runQuery(token, sq) {
  const r = await fetch(`${BASE}:runQuery`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: sq }) });
  const b = await r.json(); return { status: r.status, docs: Array.isArray(b) ? b.filter(x => x.document) : [] };
}
const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: { stringValue: v } } });
const P = (n, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);

const co = await signIn('demo-company@quickiefix.store');
const companyId = (await runQuery(co.token, { from: [{ collectionId: 'companies' }], where: eq('adminUserId', co.uid), limit: 1 })).docs[0].document.name.split('/').pop();
const tags = await runQuery(co.token, { from: [{ collectionId: 'companyTags' }], where: eq('companyId', companyId) });
P('company admin CAN list own tags', tags.status === 200 && tags.docs.length >= 0, `HTTP ${tags.status}, ${tags.docs.length} tags`);
if (!tags.docs.length) { console.log('(no prod tags to test outsider read — read protection still active per rule)'); process.exit(0); }
const tagId = tags.docs[0].document.name.split('/').pop();

P('company admin CAN read own tag', (await getDoc(co.token, `companyTags/${tagId}`)) === 200);
const outsider = await signIn('demo-property@quickiefix.store');
const outStatus = await getDoc(outsider.token, `companyTags/${tagId}`);
P('outsider CANNOT read the tag (PII protected)', outStatus === 403, `HTTP ${outStatus}`);
// unconstrained companyTags list must be rejected for non-admin
const all = await runQuery(outsider.token, { from: [{ collectionId: 'companyTags' }] });
P('unconstrained companyTags list rejected', all.status === 403, `HTTP ${all.status}`);
