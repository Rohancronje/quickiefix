/**
 * End-to-end check of the browse-and-choose flow against LIVE Firebase, using
 * the client SDK as the real app would — so it exercises the security rules.
 *
 *   1. User2 (tradie) signs in → capture uid, set available
 *   2. User1 (customer) creates a `choose` job with User2 as a candidate
 *   3. User2 (busy) expresses interest        (rule: candidate while searching)
 *   4. User1 selects User2                     (rule: job owner)
 *   5. User2 accepts the selection             (rule: selectedTradieId == uid)
 *   6. verify job = confirmed + tradieId=User2
 *   7. cleanup: cancel the job, reset User2 to available
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  arrayUnion,
  doc,
  getDoc,
  getFirestore,
  increment,
  setDoc,
  updateDoc,
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

// 1. capture User2 uid + set available (needs a baseLocation to be pickable)
const uid2 = await as('User2@testaccount.com');
await updateDoc(doc(db, 'users', uid2), {
  status: 'available',
  baseLocation: { latitude: -36.79, longitude: 174.76 },
});
ok(`User2 signed in (${uid2.slice(0, 6)}) and set available`);
await signOut(auth);

// 2. User1 creates a choose job with User2 as candidate
const uid1 = await as('User1@testaccount.com');
const jobId = `verify_${uid1.slice(0, 4)}_${uid2.slice(0, 4)}`;
const now = Date.now();
await setDoc(doc(db, 'jobs', jobId), {
  id: jobId,
  customerId: uid1,
  customerName: 'Verify Customer',
  trade: 'electrician',
  description: 'Verify browse-and-choose flow.',
  photos: [],
  location: { address: 'Takapuna, Auckland', latitude: -36.788, longitude: 174.774 },
  urgency: 'now',
  isEmergency: false,
  assignmentMode: 'choose',
  status: 'searching',
  timestamps: { createdAt: now, searchingAt: now },
  dispatch: { candidateIds: [uid2], startedAt: now },
  interestedTradies: [],
  declinedBy: [],
});
ok('User1 created a choose-mode job');
await signOut(auth);

// 3. User2 expresses interest (candidate-while-searching rule)
await as('User2@testaccount.com');
await updateDoc(doc(db, 'jobs', jobId), {
  interestedTradies: arrayUnion({
    tradieId: uid2,
    businessName: 'Verify Electrical',
    firstName: 'Mia',
    lastName: 'Wallace',
    ratingAvg: 4.7,
    ratingCount: 30,
    completedJobs: 40,
    baseLocation: { latitude: -36.79, longitude: 174.76 },
    wasBusy: true,
    expressedAt: Date.now(),
  }),
});
ok('User2 expressed interest');
await signOut(auth);

// 4. User1 selects User2
await as('User1@testaccount.com');
await updateDoc(doc(db, 'jobs', jobId), {
  selectedTradieId: uid2,
  'timestamps.selectedAt': Date.now(),
});
ok('User1 selected User2');
await signOut(auth);

// 5. User2 accepts the selection (selectedTradieId == uid rule) + updates own doc
await as('User2@testaccount.com');
const acceptedAt = Date.now();
await updateDoc(doc(db, 'jobs', jobId), {
  status: 'confirmed',
  tradieId: uid2,
  tradieName: 'Verify Electrical',
  'timestamps.acceptedAt': acceptedAt,
  'timestamps.confirmedAt': acceptedAt,
});
await updateDoc(doc(db, 'users', uid2), { status: 'job_accepted', jobsAccepted: increment(1) });
ok('User2 accepted the selection');

// 6. verify
const snap = await getDoc(doc(db, 'jobs', jobId));
const j = snap.data();
if (j.status !== 'confirmed' || j.tradieId !== uid2) {
  throw new Error(`FAIL: expected confirmed+User2, got status=${j.status} tradieId=${j.tradieId}`);
}
ok(`job is confirmed and assigned to User2 (status=${j.status})`);
await signOut(auth);

// 7. cleanup — cancel job (owner) + reset User2 available
await as('User1@testaccount.com');
await updateDoc(doc(db, 'jobs', jobId), { status: 'cancelled', 'timestamps.cancelledAt': Date.now() });
await signOut(auth);
await as('User2@testaccount.com');
await updateDoc(doc(db, 'users', uid2), { status: 'available' });
ok('cleanup done (job cancelled, User2 back to available)');

console.log('\nALL CHECKS PASSED ✅');
process.exit(0);
