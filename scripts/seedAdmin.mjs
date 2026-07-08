/**
 * Creates the platform back-office admin auth account.
 * Usage: node scripts/seedAdmin.mjs
 *
 * The email must match PLATFORM_ADMINS in portal/src/config.ts AND the
 * isPlatformAdmin() allowlist in firestore.rules. Change the password after
 * first login.
 */
import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k',
  authDomain: 'quickiefix-2ea2a.firebaseapp.com',
  projectId: 'quickiefix-2ea2a',
  storageBucket: 'quickiefix-2ea2a.firebasestorage.app',
  messagingSenderId: '468151741418',
  appId: '1:468151741418:web:137fcd2946fc680e5f2093',
};

const EMAIL = 'admin@quickiefix.store';
const PASSWORD = 'QuickieAdmin1';

const auth = getAuth(initializeApp(firebaseConfig));
try {
  await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
  console.log(`✓ created platform admin ${EMAIL} / ${PASSWORD}`);
} catch (e) {
  if (e.code === 'auth/email-already-in-use') console.log(`↻ admin ${EMAIL} already exists`);
  else console.error(e.code || e.message);
}
process.exit(0);
