/**
 * Live e2e for pre-accept Q&A messaging under the REAL Firestore rules:
 *   1. User1 creates a searching (choose) job with User2 + User3 as candidates
 *   2. User2 (candidate) posts a question            → allowed
 *   3. User4 (NOT a candidate) tries to post         → must be DENIED
 *   4. User1 (customer) reads the thread + replies   → allowed
 *   5. cleanup: cancel the job
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection,
  doc,
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
const msgRef = () => doc(collection(db, 'messages'));

// Resolve uids
const uid2 = await as('User2@testaccount.com');
await signOut(auth);
const uid3 = await as('User3@testaccount.com');
await signOut(auth);
const uid4 = await as('User4@testaccount.com');
await signOut(auth);

// 1. Customer creates a searching choose-job with candidates [User2, User3]
const uid1 = await as('User1@testaccount.com');
const jobId = `verifymsg_${uid1.slice(0, 4)}`;
const now = Date.now();
await setDoc(doc(db, 'jobs', jobId), {
  id: jobId,
  customerId: uid1,
  customerName: 'Verify Customer',
  trade: 'electrician',
  description: 'Verify messaging rules.',
  photos: [],
  location: { address: 'Takapuna, Auckland', latitude: -36.788, longitude: 174.774 },
  urgency: 'now',
  isEmergency: false,
  assignmentMode: 'choose',
  status: 'searching',
  timestamps: { createdAt: now, searchingAt: now },
  dispatch: { candidateIds: [uid2, uid3], startedAt: now },
  interestedTradies: [],
  declinedBy: [],
});
ok('User1 created a searching choose-job (candidates: User2, User3)');
await signOut(auth);

// 2. Candidate posts a question → allowed
await as('User2@testaccount.com');
await setDoc(msgRef(), {
  id: 'x',
  jobId,
  from: 'tradie',
  senderId: uid2,
  senderName: 'Bright Spark Electrical',
  text: 'Is the switchboard accessible from outside?',
  at: Date.now(),
});
ok('User2 (candidate) posted a question');
await signOut(auth);

// 3. Non-candidate tries to post → must be denied
await as('User4@testaccount.com');
let denied = false;
try {
  await setDoc(msgRef(), {
    id: 'x',
    jobId,
    from: 'tradie',
    senderId: uid4,
    senderName: 'Should Not Work',
    text: 'I should not be able to post here.',
    at: Date.now(),
  });
} catch (e) {
  denied = String(e.code || e.message).includes('permission');
}
if (!denied) throw new Error('FAIL: non-candidate was able to post to the thread!');
ok('User4 (not a candidate) was correctly DENIED');
await signOut(auth);

// 4. Customer reads the thread + replies → allowed
await as('User1@testaccount.com');
const snap = await getDocs(query(collection(db, 'messages'), where('jobId', '==', jobId)));
if (snap.docs.length !== 1) throw new Error(`FAIL: expected 1 message, saw ${snap.docs.length}`);
ok(`User1 read the thread (${snap.docs.length} message)`);
await setDoc(msgRef(), {
  id: 'x',
  jobId,
  from: 'customer',
  senderId: uid1,
  senderName: 'Verify Customer',
  text: 'Yes — the switchboard is in the garage, door will be open.',
  at: Date.now(),
});
ok('User1 replied');

// 5. cleanup
await updateDoc(doc(db, 'jobs', jobId), { status: 'cancelled', 'timestamps.cancelledAt': Date.now() });
ok('cleanup: job cancelled');

console.log('\nALL MESSAGING CHECKS PASSED ✅');
process.exit(0);
