const KEY = 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k';
const PROJECT = 'quickiefix-2ea2a';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
async function signIn(email, pw = 'password') {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw, returnSecureToken: true }) });
  const j = await r.json(); if (!j.idToken) throw new Error(email + ': ' + JSON.stringify(j.error?.message)); return { uid: j.localId, token: j.idToken };
}
async function getDoc(token, path) {
  const r = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json() };
}
async function runQuery(token, sq) {
  const r = await fetch(`${BASE}:runQuery`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: sq }) });
  const b = await r.json(); return { status: r.status, docs: Array.isArray(b) ? b.filter(x => x.document) : [] };
}
const P = (n, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`);
const availQ = (col) => ({ from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'available' } } } });

const co = await signIn('demo-company@quickiefix.store');
const ag = await signIn('demo-property@quickiefix.store');

const cross = await getDoc(co.token, `users/${ag.uid}`);
P('demo-company CANNOT read demo-property users doc', cross.status === 403, `HTTP ${cross.status}`);

const own = await getDoc(co.token, `users/${co.uid}`);
P('demo-company CAN read own users doc', own.status === 200 && !!own.body.fields?.email, `HTTP ${own.status}`);

const pub = await getDoc(co.token, `publicProfiles/${ag.uid}`);
const leaks = !!(pub.body.fields?.email || pub.body.fields?.pushToken);
P('publicProfile readable cross-account', pub.status === 200, `HTTP ${pub.status}`);
P('publicProfile has NO email/pushToken', pub.status === 200 && !leaks, leaks ? 'LEAK' : 'clean');

const avail = await runQuery(co.token, availQ('publicProfiles'));
P('dispatch: available tradies on publicProfiles', avail.status === 200 && avail.docs.length > 0, `HTTP ${avail.status}, ${avail.docs.length} tradies`);

const oldQ = await runQuery(co.token, availQ('users'));
P('old users availability query rejected', oldQ.status === 403, `HTTP ${oldQ.status}`);
