import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, getFirestore, query, where } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k',
  authDomain: 'quickiefix-2ea2a.firebaseapp.com',
  projectId: 'quickiefix-2ea2a',
});
const auth = getAuth(app);
const db = getFirestore(app);

const cred = await signInWithEmailAndPassword(auth, 'User1@testaccount.com', 'password');
console.log(`User1 uid: ${cred.user.uid}`);
const snap = await getDocs(collection(db, 'jobs'));
const jobs = snap.docs.map((d) => d.data()).sort((a, b) => b.timestamps.createdAt - a.timestamps.createdAt);
console.log(`TOTAL jobs in Firestore: ${jobs.length}`);
for (const j of jobs.slice(0, 6)) {
  console.log(
    `- ${j.trade} | status=${j.status} | customer=${j.customerName || '?'}(${(j.customerId || '').slice(0, 6)}) | tradieId=${(j.tradieId || '(none)')} | candidates=${j.dispatch?.candidateIds?.length ?? 0} | created=${new Date(j.timestamps.createdAt).toISOString()}`,
  );
}
process.exit(0);
