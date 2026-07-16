/** Verify the tightened jobs rule does NOT break legitimate list queries. */
const KEY = 'AIzaSyAp74jq40qkb8QgI-Du4lAxvfcMF_V1RTw';
const PROJECT = 'quickiefix-staging';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function signIn(email, pw = 'password') {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error(email + ': ' + JSON.stringify(j.error));
  return { uid: j.localId, token: j.idToken };
}
async function runQuery(token, structuredQuery) {
  const r = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  const body = await r.json();
  return { status: r.status, count: Array.isArray(body) ? body.filter((x) => x.document).length : -1, body };
}
const eq = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } });
const contains = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: 'ARRAY_CONTAINS', value: { stringValue: value } } });

function report(name, res, expectOk = true) {
  const ok = res.status === 200;
  console.log(`${ok === expectOk ? 'PASS' : 'FAIL'}  ${name} — HTTP ${res.status}, ${res.count} docs`
    + (ok ? '' : ` err=${JSON.stringify(res.body.error?.status || res.body).slice(0, 80)}`));
}

// Company admin reads its own jobs (where companyId==)
const co = await signIn('demo-company@quickiefix.store');
const coDoc = await runQuery(co.token, { from: [{ collectionId: 'companies' }], where: eq('adminUserId', co.uid), limit: 1 });
const companyId = coDoc.body.find((x) => x.document)?.document.name.split('/').pop();
console.log('company id:', companyId);
report('company reads jobs where companyId==', await runQuery(co.token, { from: [{ collectionId: 'jobs' }], where: eq('companyId', companyId) }));

// Agency admin reads its own jobs (where agencyId==)
const ag = await signIn('demo-property@quickiefix.store');
const agDoc = await runQuery(ag.token, { from: [{ collectionId: 'agencies' }], where: eq('adminUserId', ag.uid), limit: 1 });
const agencyId = agDoc.body.find((x) => x.document)?.document.name.split('/').pop();
console.log('agency id:', agencyId);
report('agency reads jobs where agencyId==', await runQuery(ag.token, { from: [{ collectionId: 'jobs' }], where: eq('agencyId', agencyId) }));

// Tradie reads offered jobs (dispatch.candidateIds array-contains uid) and assigned jobs
const tr = await signIn('User4@testaccount.com');
report('tradie reads offers where candidateIds array-contains', await runQuery(tr.token, { from: [{ collectionId: 'jobs' }], where: contains('dispatch.candidateIds', tr.uid) }));
report('tradie reads assigned where tradieId==', await runQuery(tr.token, { from: [{ collectionId: 'jobs' }], where: eq('tradieId', tr.uid) }));

// Customer reads own jobs
const cu = await signIn('User1@testaccount.com');
report('customer reads own where customerId==', await runQuery(cu.token, { from: [{ collectionId: 'jobs' }], where: eq('customerId', cu.uid) }));

// Negative control: an unconstrained jobs list must now be REJECTED for a non-admin
report('unconstrained jobs list is rejected (expect non-200)',
  await runQuery(cu.token, { from: [{ collectionId: 'jobs' }] }), false);
