// Copy ALL prod data (entirely test data today) + auth users to staging.
// Prod reads: admin SA key. Staging Firestore writes: REST + CLI-user OAuth.
// Staging auth: firebase-admin with a custom OAuth credential (supported).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const store = JSON.parse(
  readFileSync(join(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'),
);
async function freshToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: store.tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  return (await r.json()).access_token;
}
const token = await freshToken();
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const prodApp = initializeApp(
  { credential: cert(JSON.parse(readFileSync('../Secrets/quickiefix-2ea2a-firebase-adminsdk-fbsvc-5497b1f6f6.json', 'utf8'))) },
  'prod',
);
const stagingApp = initializeApp(
  {
    credential: { getAccessToken: async () => ({ access_token: await freshToken(), expires_in: 3000 }) },
    projectId: 'quickiefix-staging',
  },
  'staging',
);
const prodDb = getFirestore(prodApp);

// --- Firestore Value encoder (our data is plain JSON + admin Timestamps) ---
const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number')
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') {
    if (typeof v.toDate === 'function') return { timestampValue: v.toDate().toISOString() };
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])),
      },
    };
  }
  throw new Error(`unsupported value type: ${typeof v}`);
};

const BASE = 'https://firestore.googleapis.com/v1/projects/quickiefix-staging/databases/(default)';
async function commit(writes) {
  const res = await fetch(`${BASE}/documents:commit`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) throw new Error(`commit ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// --- 1. Copy every root collection ---
for (const col of await prodDb.listCollections()) {
  const snap = await col.get();
  const w = snap.docs.map((doc) => ({
    update: {
      name: `projects/quickiefix-staging/databases/(default)/documents/${col.id}/${doc.id}`,
      fields: Object.fromEntries(Object.entries(doc.data()).map(([k, v]) => [k, enc(v)])),
    },
  }));
  for (let i = 0; i < w.length; i += 300) await commit(w.slice(i, i + 300));
  console.log(`FIRESTORE ${col.id}: ${snap.size} docs copied`);
}

// --- 2. Auth users (shared test password) ---
const prodAuth = getAuth(prodApp);
const stgAuth = getAuth(stagingApp);
const page = await prodAuth.listUsers(1000);
let created = 0, skipped = 0;
for (const u of page.users) {
  try {
    await stgAuth.createUser({
      uid: u.uid,
      email: u.email,
      emailVerified: u.emailVerified,
      displayName: u.displayName || undefined,
      password: 'password',
    });
    created++;
  } catch (e) {
    if (String(e.code).includes('already-exists')) skipped++;
    else console.log('AUTH FAIL', u.email, e.code ?? e.message);
  }
}
console.log(`AUTH: ${created} created, ${skipped} existed (of ${page.users.length})`);

// --- 3. Verify staging counts via REST ---
for (const c of ['users', 'jobs', 'companies', 'agencies', 'properties', 'companyTags', 'agencyLinks']) {
  const res = await fetch(`${BASE}/documents:runAggregationQuery`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      structuredAggregationQuery: {
        structuredQuery: { from: [{ collectionId: c }] },
        aggregations: [{ count: {}, alias: 'n' }],
      },
    }),
  });
  const data = await res.json();
  const n = data[0]?.result?.aggregateFields?.n?.integerValue ?? '?';
  console.log(`VERIFY staging ${c}: ${n}`);
}
process.exit(0);
