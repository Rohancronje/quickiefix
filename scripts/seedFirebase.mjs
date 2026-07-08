/**
 * Seed demo tradies into the live Firebase project.
 *
 * Creates each tradie via Firebase Auth (email/password) and writes their
 * approved, available, located profile to Firestore — so they immediately
 * appear in the dispatch engine. Re-running updates existing accounts.
 *
 * Usage:  node scripts/seedFirebase.mjs
 *
 * Uses the client web SDK + your public config (no service-account key needed).
 * Each tradie writes its OWN user doc while signed in, satisfying the rules.
 */
import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
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

const PASSWORD = 'password'; // demo password for every seeded account

const TRADIES = [
  {
    email: 'electrician@quickiefix.store',
    firstName: 'Mia', lastName: 'Wallace',
    businessName: 'Bright Spark Electrical',
    primaryTrade: 'electrician', secondaryTrades: ['handyman'],
    years: 11, lat: -36.852, lng: 174.768,
    ratingAvg: 4.9, ratingCount: 128, completedJobs: 134, licence: 'EWRB-104882',
  },
  {
    email: 'plumber@quickiefix.store',
    firstName: 'Jack', lastName: 'Rivers',
    businessName: 'RiverFlow Plumbing & Gas',
    primaryTrade: 'plumber', secondaryTrades: ['gasfitter'],
    years: 8, lat: -36.845, lng: 174.758,
    ratingAvg: 4.7, ratingCount: 86, completedJobs: 92, licence: 'PGDB-55210',
  },
  {
    email: 'locksmith@quickiefix.store',
    firstName: 'Noa', lastName: 'Kingi',
    businessName: 'CityLock Rapid Response',
    primaryTrade: 'locksmith', secondaryTrades: [],
    years: 6, lat: -36.856, lng: 174.762,
    ratingAvg: 4.8, ratingCount: 54, completedJobs: 61, licence: null,
  },
  {
    email: 'handyman@quickiefix.store',
    firstName: 'Tom', lastName: 'Beck',
    businessName: 'FixIt Handyman Services',
    primaryTrade: 'handyman', secondaryTrades: ['painter', 'appliance_repair'],
    years: 4, lat: -36.841, lng: 174.77,
    ratingAvg: 4.5, ratingCount: 39, completedJobs: 44, licence: null,
  },
];

function buildTradieDoc(uid, t) {
  return {
    id: uid,
    role: 'tradie',
    email: t.email,
    firstName: t.firstName,
    lastName: t.lastName,
    createdAt: Date.now(),
    businessName: t.businessName,
    tradingName: t.businessName,
    yearsExperience: t.years,
    businessType: 'Sole trader',
    primaryTrade: t.primaryTrade,
    secondaryTrades: t.secondaryTrades,
    qualifications: t.licence
      ? [{ trade: t.primaryTrade, licenceNumber: t.licence, details: 'Verified licence' }]
      : [],
    approval: 'approved',
    status: 'available',
    serviceRadiusKm: 15,
    baseLocation: { latitude: t.lat, longitude: t.lng },
    ratingAvg: t.ratingAvg,
    ratingCount: t.ratingCount,
    completedJobs: t.completedJobs,
    jobsOffered: t.completedJobs + 8,
    jobsAccepted: t.completedJobs,
  };
}

const CUSTOMER = {
  email: 'customer@quickiefix.store',
  firstName: 'Sam',
  lastName: 'Taylor',
  homeAddress: {
    address: '12 Queen Street, Auckland CBD',
    latitude: -36.8485,
    longitude: 174.7633,
  },
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let created = 0;
let updated = 0;

// --- Demo customer ---
{
  let uid;
  try {
    const cred = await createUserWithEmailAndPassword(auth, CUSTOMER.email, PASSWORD);
    uid = cred.user.uid;
    created++;
    console.log(`✓ created  ${CUSTOMER.email} (customer)`);
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(auth, CUSTOMER.email, PASSWORD);
      uid = cred.user.uid;
      updated++;
      console.log(`↻ updating ${CUSTOMER.email} (customer)`);
    } else {
      console.error(`✗ ${CUSTOMER.email}: ${e.code || e.message}`);
    }
  }
  if (uid) {
    await setDoc(doc(db, 'users', uid), {
      id: uid,
      role: 'customer',
      email: CUSTOMER.email,
      firstName: CUSTOMER.firstName,
      lastName: CUSTOMER.lastName,
      createdAt: Date.now(),
      homeAddress: CUSTOMER.homeAddress,
    });
    await signOut(auth);
  }
}

for (const t of TRADIES) {
  let uid;
  try {
    const cred = await createUserWithEmailAndPassword(auth, t.email, PASSWORD);
    uid = cred.user.uid;
    created++;
    console.log(`✓ created  ${t.email}`);
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(auth, t.email, PASSWORD);
      uid = cred.user.uid;
      updated++;
      console.log(`↻ updating ${t.email}`);
    } else {
      console.error(`✗ ${t.email}: ${e.code || e.message}`);
      continue;
    }
  }
  await setDoc(doc(db, 'users', uid), buildTradieDoc(uid, t));
  await signOut(auth);
}

console.log(`\nDone. ${created} created, ${updated} updated. Password: "${PASSWORD}"`);
process.exit(0);
