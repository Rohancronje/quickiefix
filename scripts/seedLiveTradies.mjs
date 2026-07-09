/**
 * Seed a live-Firebase supply pool: 1 demo customer + 20 tradies (5 each of
 * electrician / plumber / locksmith / handyman), approved + available + located
 * around Auckland's North Shore, with rate cards. All use password `password`
 * so the app's demo-login buttons work. Usage: node scripts/seedLiveTradies.mjs
 */
import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, getFirestore, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k',
  authDomain: 'quickiefix-2ea2a.firebaseapp.com',
  projectId: 'quickiefix-2ea2a',
  storageBucket: 'quickiefix-2ea2a.firebasestorage.app',
  messagingSenderId: '468151741418',
  appId: '1:468151741418:web:137fcd2946fc680e5f2093',
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const PASSWORD = 'password';

const FIRST = ['Mia', 'Jack', 'Noa', 'Tom', 'Ana', 'Leo', 'Kai', 'Eli', 'Zoe', 'Sam',
  'Ivy', 'Max', 'Ben', 'Ella', 'Finn', 'Ruby', 'Cody', 'Nina', 'Josh', 'Tara'];
const LAST = ['Wallace', 'Rivers', 'Kingi', 'Beck', 'Reed', 'Nolan', 'Ford', 'Hart', 'Chen', 'Patel',
  'Singh', 'Brown', 'Ngata', 'Cole', 'Frost', 'Vance', 'Diaz', 'Webb', 'Shaw', 'Lowe'];

const TRADES = [
  { key: 'electrician', biz: ['Bright Spark Electrical', 'Voltify Electric', 'North Shore Sparkies', 'LiveWire Electrical', 'Circuit Pro Electrical'], hourly: 9500, lic: 'EWRB' },
  { key: 'plumber', biz: ['RiverFlow Plumbing & Gas', 'LeakStop Plumbing', 'AquaFix Plumbers', 'PipeMasters NZ', 'FlowRight Plumbing'], hourly: 11000, lic: 'PGDB' },
  { key: 'locksmith', biz: ['CityLock Rapid Response', 'KeyMaster Locksmiths', 'SecureIt Locks', 'LockSmart NZ', 'RapidKey Locksmiths'], hourly: 8500 },
  { key: 'handyman', biz: ['FixIt Handyman Services', 'HandyPro Services', 'AllFix Handyman', 'TaskMate', 'OddJob Experts'], hourly: 7500 },
];

// North Shore cluster; deterministic spread.
const baseLat = -36.795, baseLng = 174.758;
function loc(i) {
  return { latitude: baseLat + ((i % 5) - 2) * 0.012, longitude: baseLng + (Math.floor(i / 5) - 1.5) * 0.014 };
}

async function ensureAccount(email) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    return { uid: cred.user.uid, created: true };
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(auth, email, PASSWORD);
      return { uid: cred.user.uid, created: false };
    }
    throw e;
  }
}

async function seed() {
  let n = 0;

  // Demo customer = User1@testaccount.com
  try {
    const email = 'User1@testaccount.com';
    const { uid, created } = await ensureAccount(email);
    await setDoc(doc(db, 'users', uid), {
      id: uid, role: 'customer', email,
      firstName: 'Sam', lastName: 'Taylor', createdAt: Date.now(),
      homeAddress: { address: '12 Hurstmere Rd, Takapuna', latitude: -36.788, longitude: 174.774 },
    });
    console.log(`${created ? '✓ created' : '↻ updated'} ${email} (customer)`);
  } catch (e) { console.log('customer:', e.code || e.message); }

  for (const t of TRADES) {
    for (let k = 0; k < 5; k++) {
      const email = `User${n + 2}@testaccount.com`; // User2..User21
      const first = FIRST[n % FIRST.length];
      const last = LAST[n % LAST.length];
      const rating = Math.round((4.4 + (n % 6) * 0.08) * 10) / 10;
      const completed = 25 + (n % 9) * 14;
      try {
        const { uid, created } = await ensureAccount(email);
        await setDoc(doc(db, 'users', uid), {
          id: uid, role: 'tradie', email,
          firstName: first, lastName: last, createdAt: Date.now(),
          businessName: t.biz[k], tradingName: t.biz[k],
          yearsExperience: 3 + (n % 12), businessType: 'Sole trader',
          primaryTrade: t.key, secondaryTrades: [],
          qualifications: t.lic ? [{ trade: t.key, licenceNumber: `${t.lic}-${10000 + n}`, details: 'Verified licence' }] : [],
          approval: 'approved', status: 'available', serviceRadiusKm: 20,
          baseLocation: loc(n),
          ratingAvg: rating, ratingCount: 20 + (n % 11) * 12, completedJobs: completed,
          jobsOffered: completed + 8, jobsAccepted: completed,
          freeJobCredits: 5, paymentHold: false,
          rateCard: { hourlyRateCents: t.hourly, calloutFeeCents: 8000, afterHoursCalloutFeeCents: 14000 },
        });
        console.log(`${created ? '✓ created' : '↻ updated'} ${email} (${t.key}, ${first} ${last})`);
      } catch (e) { console.log(`${email}:`, e.code || e.message); }
      n++;
    }
  }
  console.log('\nDone.');
  process.exit(0);
}
seed().catch((e) => { console.error(e); process.exit(1); });
