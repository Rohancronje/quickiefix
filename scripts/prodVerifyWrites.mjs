const KEY = 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k';
const PROJECT = 'quickiefix-2ea2a';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
async function signIn(email, pw = 'password') {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw, returnSecureToken: true }) });
  const j = await r.json(); return { uid: j.localId, token: j.idToken };
}
async function runQuery(token, sq) {
  const r = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: sq }) });
  const b = await r.json(); return Array.isArray(b) ? b.filter(x => x.document) : [];
}
async function patchDoc(token, path, mask, fields) {
  const r = await fetch(`${BASE}/${path}?${mask.map(m => 'updateMask.fieldPaths=' + m).join('&')}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  return r.status;
}
const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: { stringValue: v } } });
const P = (n, ok, x = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);

const ag = await signIn('demo-property@quickiefix.store');
// Agency-raised jobs with no tenant have customerId == the agency admin — use one to test as a party.
const own = await runQuery(ag.token, { from: [{ collectionId: 'jobs' }], where: eq('customerId', ag.uid) });
if (own.length) {
  const id = own[0].document.name.split('/').pop();
  // Forbidden-field write is REJECTED (no mutation happens on a 403).
  const forge = await patchDoc(ag.token, `jobs/${id}`, ['rateSnapshot'], { rateSnapshot: { mapValue: { fields: { source: { stringValue: 'hacked' } } } } });
  P('party CANNOT write forbidden field rateSnapshot', forge === 403, `HTTP ${forge}`);
  const forgeTradie = await patchDoc(ag.token, `jobs/${id}`, ['tradieId'], { tradieId: { stringValue: ag.uid } });
  P('party CANNOT forge tradieId', forgeTradie === 403, `HTTP ${forgeTradie}`);
} else {
  console.log('(no agency-owned job to test as a party — relying on staging e2e + rule deploy)');
}
// An unrelated account cannot touch a job it is not party to.
const co = await signIn('demo-company@quickiefix.store');
if (own.length) {
  const id = own[0].document.name.split('/').pop();
  P('non-party CANNOT update the job', (await patchDoc(co.token, `jobs/${id}`, ['status'], { status: { stringValue: 'cancelled' } })) === 403);
}
