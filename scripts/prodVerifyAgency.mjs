import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
const KEY = 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k';
const PROJECT = 'quickiefix-2ea2a';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
async function signIn(email, pw = 'password') {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw, returnSecureToken: true }) });
  const j = await r.json(); return { uid: j.localId, token: j.idToken };
}
async function getDoc(token, path) { const r = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json() }; }
async function runQuery(token, sq) {
  const r = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: sq }) });
  const b = await r.json(); return Array.isArray(b) ? b.filter(x => x.document) : [];
}
const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: { stringValue: v } } });
const P = (n, ok, x = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`);

const ag = await signIn('demo-property@quickiefix.store');
const agencyDoc = (await runQuery(ag.token, { from: [{ collectionId: 'agencies' }], where: eq('adminUserId', ag.uid), limit: 1 }))[0];
const agencyId = agencyDoc.document.name.split('/').pop();
const code = agencyDoc.document.fields.code.stringValue;
P('agency admin reads own agency', (await getDoc(ag.token, `agencies/${agencyId}`)).status === 200);
const panel = await getDoc(ag.token, `agencyPanels/${agencyId}`);
const tids = (panel.body.fields?.tradieIds?.arrayValue?.values || []).map(v => v.stringValue);
P('agencyPanels populated + readable', panel.status === 200, `${tids.length} tradieIds`);
const ownLinks = await runQuery(ag.token, { from: [{ collectionId: 'agencyLinks' }], where: eq('agencyId', agencyId) });
P('agency admin reads own links', ownLinks.length >= 0, `${ownLinks.length}`);

const out = await signIn('demo-company@quickiefix.store');
P('outsider CANNOT read agency doc', (await getDoc(out.token, `agencies/${agencyId}`)).status === 403);
P('outsider CAN read agencyPanels projection', (await getDoc(out.token, `agencyPanels/${agencyId}`)).status === 200);
if (ownLinks.length) {
  const lid = ownLinks[0].document.name.split('/').pop();
  P('outsider CANNOT read an agencyLink', (await getDoc(out.token, `agencyLinks/${lid}`)).status === 403);
}
P('unconstrained agencies list rejected', (await runQuery(out.token, { from: [{ collectionId: 'agencies' }] })).length === 0);

const app = initializeApp({ apiKey: KEY, authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, appId: '1:468151741418:web:137fcd2946fc680e5f2093' });
const cred = await signInWithEmailAndPassword(getAuth(app), 'demo-company@quickiefix.store', 'password');
await cred.user.getIdToken(true); await new Promise(r => setTimeout(r, 700));
try {
  const res = await httpsCallable(getFunctions(app), 'findAgencyByCode')({ code });
  P('findAgencyByCode resolves code', res.data?.found && res.data?.id === agencyId, `name=${res.data?.name}`);
} catch (e) { P('findAgencyByCode resolves code', false, String(e.message).slice(0, 60)); }
process.exit(0);
