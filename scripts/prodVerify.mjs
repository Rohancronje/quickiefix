/** Non-destructive PROD verification of the tightened jobs read rule.
 *  Prints only ids/status/counts — never job contents. */
const KEY = 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k';
const PROJECT = 'quickiefix-2ea2a';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function signIn(email, pw = 'password') {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error(email + ': ' + JSON.stringify(j.error?.message || j));
  return { uid: j.localId, token: j.idToken };
}
async function runQuery(token, structuredQuery) {
  const r = await fetch(`${BASE}:runQuery`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  const body = await r.json();
  return { status: r.status, ids: Array.isArray(body) ? body.filter((x) => x.document).map((x) => x.document.name.split('/').pop()) : [] };
}
async function getDoc(token, id) {
  const r = await fetch(`${BASE}/jobs/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.status;
}
const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: { stringValue: v } } });

const ag = await signIn('demo-property@quickiefix.store');
const agDoc = await runQuery(ag.token, { from: [{ collectionId: 'agencies' }], where: eq('adminUserId', ag.uid), limit: 1 });
const agencyId = agDoc.ids[0];
console.log('prod agency id:', agencyId);

const agJobs = await runQuery(ag.token, { from: [{ collectionId: 'jobs' }], where: eq('agencyId', agencyId) });
console.log(`PASS? agency constrained read — HTTP ${agJobs.status}, ${agJobs.ids.length} jobs (expect 200)`);

const unconstrained = await runQuery(ag.token, { from: [{ collectionId: 'jobs' }] });
console.log(`PASS? unconstrained list rejected — HTTP ${unconstrained.status} (expect 403)`);

// Outsider single-doc read: demo-company tries to read one of the agency's jobs
if (agJobs.ids.length) {
  const co = await signIn('demo-company@quickiefix.store');
  const st = await getDoc(co.token, agJobs.ids[0]);
  console.log(`PASS? outsider (demo-company) single-doc read — HTTP ${st} (expect 403)`);
} else {
  console.log('(no agency jobs in prod to run the outsider check — skipped)');
}
