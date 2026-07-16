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
  return { status: r.status, body: await r.json() };
}
async function runQuery(token, sq) {
  const r = await fetch(`${BASE}:runQuery`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: sq }) });
  const b = await r.json(); return Array.isArray(b) ? b.filter(x => x.document) : [];
}
const P = (n, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);

const co = await signIn('demo-company@quickiefix.store');
// grab a real tradie uid from the available-tradies publicProfiles query
const docs = await runQuery(co.token, { from: [{ collectionId: 'publicProfiles' }],
  where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'available' } } } });
const tradieUid = docs[0].document.name.split('/').pop();
console.log('sample tradie uid:', tradieUid);

const pub = await getDoc(co.token, `publicProfiles/${tradieUid}`);
const f = pub.body.fields || {};
const leaks = !!(f.email || f.pushToken);
P('tradie publicProfile readable', pub.status === 200 && !!f.businessName, `HTTP ${pub.status}, business=${f.businessName?.stringValue}`);
P('tradie publicProfile has NO email/pushToken', pub.status === 200 && !leaks, leaks ? 'LEAK' : 'clean');

const usr = await getDoc(co.token, `users/${tradieUid}`);
P('tradie private users doc is cross-account denied', usr.status === 403, `HTTP ${usr.status}`);
