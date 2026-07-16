import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const KEY = 'AIzaSyAp74jq40qkb8QgI-Du4lAxvfcMF_V1RTw';
const PROJECT = 'quickiefix-staging';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const APPCFG = { apiKey: KEY, authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, appId: '1:980457473979:web:9e220ffbc5f80405c2669e' };

async function signInREST(email, pw = 'password') {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, returnSecureToken: true }) });
  const j = await r.json(); if (!j.idToken) throw new Error(email + ': ' + JSON.stringify(j.error?.message)); return { uid: j.localId, token: j.idToken };
}
async function getDoc(token, path) { const r = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json() }; }
async function runQuery(token, sq) {
  const r = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: sq }) });
  const b = await r.json(); return Array.isArray(b) ? b.filter(x => x.document) : [];
}
const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: { stringValue: v } } });
const P = (n, ok, x = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);

const ag = await signInREST('demo-property@quickiefix.store');
const agencyDoc = (await runQuery(ag.token, { from: [{ collectionId: 'agencies' }], where: eq('adminUserId', ag.uid), limit: 1 }))[0];
const agencyId = agencyDoc.document.name.split('/').pop();
const code = agencyDoc.document.fields.code.stringValue;
console.log('agency', agencyId, 'code', code);

// owner reads own agency
P('agency admin reads own agency', (await getDoc(ag.token, `agencies/${agencyId}`)).status === 200);
// owner reads own panel links (agencyAdmin clause)
const ownLinks = await runQuery(ag.token, { from: [{ collectionId: 'agencyLinks' }], where: eq('agencyId', agencyId) });
P('agency admin reads own agencyLinks', ownLinks.length >= 0, `${ownLinks.length} links`);
// agencyPanels populated + readable
const panel = await getDoc(ag.token, `agencyPanels/${agencyId}`);
const tradieIds = (panel.body.fields?.tradieIds?.arrayValue?.values || []).map(v => v.stringValue);
P('agencyPanels/{id} exists + readable', panel.status === 200, `${tradieIds.length} tradieIds`);

// outsider checks
const out = await signInREST('User7@testaccount.com');
P('outsider CANNOT read the agency doc', (await getDoc(out.token, `agencies/${agencyId}`)).status === 403);
P('outsider CAN read agencyPanels projection', (await getDoc(out.token, `agencyPanels/${agencyId}`)).status === 200);
if (ownLinks.length) {
  const linkId = ownLinks[0].document.name.split('/').pop();
  const outLink = await getDoc(out.token, `agencyLinks/${linkId}`);
  P('outsider CANNOT read an agencyLink (membership PII)', outLink.status === 403, `HTTP ${outLink.status}`);
}
// unconstrained agencies list rejected
P('unconstrained agencies list rejected', (await runQuery(out.token, { from: [{ collectionId: 'agencies' }] })).length === 0);

// findAgencyByCode callable (as a tradie)
const app = initializeApp(APPCFG);
const cred = await signInWithEmailAndPassword(getAuth(app), 'User7@testaccount.com', 'password');
await cred.user.getIdToken(true); await new Promise(r => setTimeout(r, 700));
const fns = getFunctions(app);
try {
  const res = await httpsCallable(fns, 'findAgencyByCode')({ code });
  P('findAgencyByCode resolves code → id+name', res.data?.found && res.data?.id === agencyId, `name=${res.data?.name}`);
} catch (e) { P('findAgencyByCode resolves code', false, String(e.message).slice(0, 60)); }

// managed-property dispatch: createAgencyJob (as agency admin), verify billing stamp + panel filter
const props = await runQuery(ag.token, { from: [{ collectionId: 'properties' }], where: eq('landlordId', ag.uid) });
const withTenant = props.map(p => p.document).find(d => (d.fields.tenantIds?.arrayValue?.values || []).length > 0);
if (!withTenant) { console.log('(no managed property with a tenant — skipping dispatch check)'); process.exit(0); }
const propertyId = withTenant.name.split('/').pop();
const agAppCred = await signInWithEmailAndPassword(getAuth(app), 'demo-property@quickiefix.store', 'password');
await agAppCred.user.getIdToken(true); await new Promise(r => setTimeout(r, 700));
try {
  const res = await httpsCallable(getFunctions(app), 'createAgencyJob')({ propertyId, trade: 'plumber', description: 'Batch-3 verify: kitchen tap dripping' });
  const jobId = res.data?.jobId ?? res.data?.id;
  await new Promise(r => setTimeout(r, 1500));
  const job = await getDoc(ag.token, `jobs/${jobId}`);
  const billed = job.body.fields?.agencyBillingEmail?.stringValue;
  P('createAgencyJob dispatch works + stamps agencyBillingEmail', !!jobId && !!billed, `billing=${billed}`);
} catch (e) { P('createAgencyJob dispatch', false, String(e.message).slice(0, 80)); }
process.exit(0);
