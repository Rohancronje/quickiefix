/** Verify job read access post-fix. Non-parties must get 403; parties 200. */
const KEY = 'AIzaSyAp74jq40qkb8QgI-Du4lAxvfcMF_V1RTw';
const PROJECT = 'quickiefix-staging';
const JOB = 'r8hoRzO3jwEExPnofY1M';
const CUSTOMER = 's7MW0Q8EoWXSTVWDiRDOiA0JIwI2';
const TRADIE = 'NSHtfLSBXyfCHKexDgaFjYRaY2o1';
const CANDIDATES = ['fLCmk5qbQuROTh16jd46Qxn2ONV2','TcxoFlZtF8hxUHeysgXmc4megO42','F772YlJswgPJyqrQ1rxdEQIQcSm2','NSHtfLSBXyfCHKexDgaFjYRaY2o1','i7w8loLYg7es23RF8CjospJ5UoI3','cOOfy9IDNjhSDZ4E3c22XzvvgUx2','3uC44BvCkVhl7vVSEMlPpeCyutk2'];

async function signIn(email) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password', returnSecureToken: true }),
  });
  const j = await r.json();
  return j.idToken ? { uid: j.localId, token: j.idToken } : null;
}
async function readJob(token) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/jobs/${JOB}`,
    { headers: { Authorization: `Bearer ${token}` } });
  return r.status;
}

let outsiders = 0, leaks = 0, parties = 0;
for (let n = 3; n <= 21; n++) {
  const acct = await signIn(`User${n}@testaccount.com`);
  if (!acct) continue;
  const isParty = acct.uid === CUSTOMER || acct.uid === TRADIE || CANDIDATES.includes(acct.uid);
  const status = await readJob(acct.token);
  const tag = isParty ? 'party' : 'OUTSIDER';
  const verdict = isParty
    ? (status === 200 ? 'ok (party can read)' : 'BROKEN (party denied!)')
    : (status === 403 ? 'DENIED ✓' : `LEAK ✗ (${status})`);
  console.log(`User${n} ${acct.uid.slice(0, 8)} [${tag}] HTTP ${status} — ${verdict}`);
  if (isParty) parties++;
  else { outsiders++; if (status === 200) leaks++; }
}
console.log(`\nTested ${outsiders} outsiders, ${parties} parties. Outsider leaks: ${leaks}`);
console.log(leaks === 0 ? 'RESULT: PASS — no cross-user access for non-parties' : 'RESULT: FAIL — still leaking');
