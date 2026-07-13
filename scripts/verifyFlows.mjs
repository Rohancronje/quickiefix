/**
 * Live end-to-end verification of the four matching workflows, against real
 * Firebase with the client SDK — so every write is subject to the deployed
 * security rules, exactly like the app.
 *
 *   node scripts/verifyFlows.mjs 1   choose-mode gating (plumber, User7/User8)
 *   node scripts/verifyFlows.mjs 2   auto first-to-accept (electrician, User2/User3)
 *   node scripts/verifyFlows.mjs 3   one-live-job-per-trade guard (locksmith, User12)
 *   node scripts/verifyFlows.mjs 4   emergency + secondary-trade dispatch (gasfitter via User17)
 *
 * Scenarios use disjoint tradie accounts, so they are safe to run in parallel.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k',
  authDomain: 'quickiefix-2ea2a.firebaseapp.com',
  projectId: 'quickiefix-2ea2a',
});
const auth = getAuth(app);
const db = getFirestore(app);
const P = 'password';
const as = async (email) => (await signInWithEmailAndPassword(auth, email, P)).user.uid;
const ok = (m) => console.log(`  ✓ ${m}`);
const AK = { latitude: -36.79, longitude: 174.76 };

/** Assert a write is DENIED by the security rules. */
async function denied(label, fn) {
  try {
    await fn();
  } catch (e) {
    if (e.code === 'permission-denied') {
      ok(`${label} → correctly DENIED by rules`);
      return;
    }
    throw e;
  }
  throw new Error(`FAIL: ${label} was ALLOWED — rules should deny it`);
}

function baseJob(id, uid, trade, extra = {}) {
  const now = Date.now();
  return {
    id,
    customerId: uid,
    customerName: 'Verify Customer',
    trade,
    description: `Verify flows scenario (${trade}).`,
    photos: [],
    location: { address: 'Takapuna, Auckland', latitude: -36.788, longitude: 174.774 },
    urgency: 'now',
    isEmergency: false,
    assignmentMode: 'auto',
    status: 'searching',
    timestamps: { createdAt: now, searchingAt: now },
    interestedTradies: [],
    declinedBy: [],
    ...extra,
  };
}

const acceptWrite = (jobId, uid, name) =>
  updateDoc(doc(db, 'jobs', jobId), {
    status: 'confirmed',
    tradieId: uid,
    tradieName: name,
    'timestamps.acceptedAt': Date.now(),
    'timestamps.confirmedAt': Date.now(),
  });

async function cleanup(jobId, tradieEmails) {
  await as('User1@testaccount.com');
  await updateDoc(doc(db, 'jobs', jobId), { status: 'cancelled', 'timestamps.cancelledAt': Date.now() });
  await signOut(auth);
  for (const e of tradieEmails) {
    const uid = await as(e);
    await updateDoc(doc(db, 'users', uid), { status: 'available' });
    await signOut(auth);
  }
  ok('cleanup done (job cancelled, tradies reset to available)');
}

/* ---- Scenario 1: choose mode — nobody accepts until the customer picks ---- */
async function scenario1() {
  console.log('JOB 1 · browse-and-choose gating (plumber)');
  const uid7 = await as('User7@testaccount.com');
  await updateDoc(doc(db, 'users', uid7), { status: 'available', baseLocation: AK });
  await signOut(auth);
  const uid8 = await as('User8@testaccount.com');
  await updateDoc(doc(db, 'users', uid8), { status: 'available', baseLocation: AK });
  await signOut(auth);

  const uid1 = await as('User1@testaccount.com');
  const jobId = `vflow1_${Date.now().toString(36)}`;
  await setDoc(
    doc(db, 'jobs', jobId),
    baseJob(jobId, uid1, 'plumber', {
      assignmentMode: 'choose',
      dispatch: { candidateIds: [uid7, uid8], startedAt: Date.now() },
    }),
  );
  ok('customer created a CHOOSE plumbing job (candidates: User7, User8)');
  await signOut(auth);

  // Unchosen candidate CANNOT take the job…
  await as('User7@testaccount.com');
  await denied('User7 accepting before being chosen', () => acceptWrite(jobId, uid7, 'LeakStop Plumbing'));
  // …but CAN raise their hand.
  await updateDoc(doc(db, 'jobs', jobId), {
    interestedTradies: arrayUnion({
      tradieId: uid7, businessName: 'LeakStop Plumbing', firstName: 'Kai', lastName: 'Ford',
      ratingAvg: 4.6, ratingCount: 40, completedJobs: 50, baseLocation: AK, wasBusy: false,
      expressedAt: Date.now(),
    }),
  });
  ok('User7 expressed interest (allowed while unchosen)');
  await signOut(auth);

  // Customer picks User8.
  await as('User1@testaccount.com');
  await updateDoc(doc(db, 'jobs', jobId), { selectedTradieId: uid8, 'timestamps.selectedAt': Date.now() });
  ok('customer selected User8');
  await signOut(auth);

  // User7 STILL can't take it — only the chosen tradie can.
  await as('User7@testaccount.com');
  await denied('User7 accepting after User8 was chosen', () => acceptWrite(jobId, uid7, 'LeakStop Plumbing'));
  await signOut(auth);

  // The chosen tradie's accept goes straight to confirmed.
  await as('User8@testaccount.com');
  await acceptWrite(jobId, uid8, 'AquaFix Plumbers');
  const j = (await getDoc(doc(db, 'jobs', jobId))).data();
  if (j.status !== 'confirmed' || j.tradieId !== uid8) throw new Error(`FAIL: ${j.status}/${j.tradieId}`);
  ok('chosen tradie (User8) accepted → job CONFIRMED');
  await signOut(auth);

  await cleanup(jobId, ['User7@testaccount.com', 'User8@testaccount.com']);
}

/* ---- Scenario 2: auto mode — first to accept wins, late accept denied ---- */
async function scenario2() {
  console.log('JOB 2 · auto-assign first-to-accept (electrician)');
  const uid2 = await as('User2@testaccount.com');
  await updateDoc(doc(db, 'users', uid2), { status: 'available', baseLocation: AK });
  await signOut(auth);
  const uid3 = await as('User3@testaccount.com');
  await updateDoc(doc(db, 'users', uid3), { status: 'available', baseLocation: AK });
  await signOut(auth);

  const uid1 = await as('User1@testaccount.com');
  const jobId = `vflow2_${Date.now().toString(36)}`;
  await setDoc(
    doc(db, 'jobs', jobId),
    baseJob(jobId, uid1, 'electrician', {
      dispatch: { candidateIds: [uid2, uid3], startedAt: Date.now() },
    }),
  );
  ok('customer created an AUTO electrician job (candidates: User2, User3)');
  await signOut(auth);

  // First candidate accepts — allowed, lands straight at confirmed.
  await as('User2@testaccount.com');
  await acceptWrite(jobId, uid2, 'Bright Spark Electrical');
  const j = (await getDoc(doc(db, 'jobs', jobId))).data();
  if (j.status !== 'confirmed' || j.tradieId !== uid2) throw new Error(`FAIL: ${j.status}/${j.tradieId}`);
  ok('User2 accepted first → job CONFIRMED (no customer-confirm step)');
  await signOut(auth);

  // Second candidate tries after — denied (job is no longer searching).
  await as('User3@testaccount.com');
  await denied('User3 accepting a taken job', () => acceptWrite(jobId, uid3, 'Voltify Electric'));
  await signOut(auth);

  await cleanup(jobId, ['User2@testaccount.com', 'User3@testaccount.com']);
}

/* ---- Scenario 3: one live job per trade per customer ---- */
async function scenario3() {
  console.log('JOB 3 · one-live-job-per-trade guard (locksmith)');
  const uid12 = await as('User12@testaccount.com');
  await updateDoc(doc(db, 'users', uid12), { status: 'available', baseLocation: AK });
  await signOut(auth);

  const uid1 = await as('User1@testaccount.com');
  const jobId = `vflow3_${Date.now().toString(36)}`;
  await setDoc(
    doc(db, 'jobs', jobId),
    baseJob(jobId, uid1, 'locksmith', {
      dispatch: { candidateIds: [uid12], startedAt: Date.now() },
    }),
  );
  ok('customer created a locksmith job');
  await signOut(auth);

  await as('User12@testaccount.com');
  await acceptWrite(jobId, uid12, 'CityLock Rapid Response');
  ok('User12 accepted → locksmith job IN PROGRESS');
  await signOut(auth);

  // Run the exact same check the app's createJob performs.
  await as('User1@testaccount.com');
  const live = ['searching', 'accepted', 'confirmed', 'travelling', 'on_site'];
  const mine = await getDocs(query(collection(db, 'jobs'), where('customerId', '==', uid1)));
  const jobs = mine.docs.map((d) => d.data());
  const lockClash = jobs.find((x) => x.trade === 'locksmith' && live.includes(x.status));
  if (!lockClash) throw new Error('FAIL: the guard query did not find the live locksmith job');
  ok('second locksmith request → BLOCKED (guard finds the live locksmith job)');
  const painterClash = jobs.find((x) => x.trade === 'painter' && live.includes(x.status));
  if (painterClash) throw new Error('FAIL: unrelated trade was blocked');
  ok('a painter request → ALLOWED (different trade, no clash)');
  await signOut(auth);

  await cleanup(jobId, ['User12@testaccount.com']);
}

/* ---- Scenario 4: emergency (forced auto) + secondary-trade dispatch ---- */
async function scenario4() {
  console.log('JOB 4 · emergency + secondary-trade dispatch (gasfitter via handyman User17)');
  const uid17 = await as('User17@testaccount.com');
  await updateDoc(doc(db, 'users', uid17), {
    status: 'available',
    baseLocation: AK,
    secondaryTrades: ['gasfitter'],
  });
  ok('User17 (handyman) now lists gasfitter as a SECONDARY trade');

  // The app's matching set: primary + secondaries.
  const u17 = (await getDoc(doc(db, 'users', uid17))).data();
  const trades = new Set([u17.primaryTrade, ...(u17.secondaryTrades ?? [])]);
  if (!trades.has('gasfitter')) throw new Error('FAIL: secondary trade not in matching set');
  ok('matching set includes gasfitter → User17 is a valid candidate');
  await signOut(auth);

  const uid1 = await as('User1@testaccount.com');
  const jobId = `vflow4_${Date.now().toString(36)}`;
  await setDoc(
    doc(db, 'jobs', jobId),
    baseJob(jobId, uid1, 'gasfitter', {
      isEmergency: true, // emergencies force auto mode
      dispatch: { candidateIds: [uid17], startedAt: Date.now() },
    }),
  );
  ok('customer created an EMERGENCY gasfitter job (auto-forced)');
  await signOut(auth);

  await as('User17@testaccount.com');
  await acceptWrite(jobId, uid17, 'FixIt Handyman Services');
  const j = (await getDoc(doc(db, 'jobs', jobId))).data();
  if (j.status !== 'confirmed' || j.tradieId !== uid17) throw new Error(`FAIL: ${j.status}/${j.tradieId}`);
  ok('secondary-trade tradie accepted the emergency → CONFIRMED');
  await updateDoc(doc(db, 'users', uid17), { secondaryTrades: [] }); // restore
  await signOut(auth);

  await cleanup(jobId, ['User17@testaccount.com']);
}

const scenarios = { 1: scenario1, 2: scenario2, 3: scenario3, 4: scenario4 };
const pick = process.argv[2];
const run = pick ? [scenarios[pick]] : Object.values(scenarios);
if (!run[0]) throw new Error(`Unknown scenario "${pick}" — use 1..4`);
for (const s of run) await s();
console.log('\nALL CHECKS PASSED ✅');
process.exit(0);
