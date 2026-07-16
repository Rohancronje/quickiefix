const KEY = 'AIzaSyAp74jq40qkb8QgI-Du4lAxvfcMF_V1RTw';
const PROJECT = 'quickiefix-staging';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
async function signIn(email) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password', returnSecureToken: true }) });
  const j = await r.json(); return { uid: j.localId, token: j.idToken };
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

const u1 = await signIn('User1@testaccount.com');
const u5 = await signIn('User5@testaccount.com');

// 1. Cross-account users read denied
const cross = await getDoc(u5.token, `users/${u1.uid}`);
P('User5 CANNOT read User1 users doc', cross.status === 403, `HTTP ${cross.status}`);

// 2. Self users read allowed + still has email
const own = await getDoc(u1.token, `users/${u1.uid}`);
const ownHasEmail = !!own.body.fields?.email?.stringValue;
P('User1 CAN read own users doc (with email)', own.status === 200 && ownHasEmail, `HTTP ${own.status}, email=${ownHasEmail}`);

// 3. publicProfiles readable cross-account, and has NO email/pushToken
const pub = await getDoc(u5.token, `publicProfiles/${u1.uid}`);
const f = pub.body.fields || {};
const leaks = !!(f.email || f.pushToken);
P('User5 CAN read User1 publicProfile', pub.status === 200, `HTTP ${pub.status}`);
P('publicProfile has NO email/pushToken', pub.status === 200 && !leaks, leaks ? 'LEAK present' : 'clean');

// 4. Dispatch query works: available tradies from publicProfiles
const avail = await runQuery(u1.token, {
  from: [{ collectionId: 'publicProfiles' }],
  where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'available' } } },
});
P('dispatch: available tradies query on publicProfiles', avail.status === 200 && avail.docs.length > 0, `HTTP ${avail.status}, ${avail.docs.length} tradies`);

// 5. old path closed: querying users where status==available must be rejected for non-admin
const oldQ = await runQuery(u1.token, {
  from: [{ collectionId: 'users' }],
  where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'available' } } },
});
P('old users availability query is rejected', oldQ.status === 403, `HTTP ${oldQ.status}`);
