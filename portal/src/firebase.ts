import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// Same Firebase project as the mobile app. Web config values are not secret.
// Builds target PRODUCTION by default; `VITE_FIREBASE_ENV=staging npm run build`
// produces a staging-targeted build (see docs/INFRA.md).
const PROD = {
  apiKey: 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k',
  authDomain: 'quickiefix-2ea2a.firebaseapp.com',
  projectId: 'quickiefix-2ea2a',
  storageBucket: 'quickiefix-2ea2a.firebasestorage.app',
  messagingSenderId: '468151741418',
  appId: '1:468151741418:web:137fcd2946fc680e5f2093',
};
const STAGING = {
  apiKey: 'AIzaSyAp74jq40qkb8QgI-Du4lAxvfcMF_V1RTw',
  authDomain: 'quickiefix-staging.firebaseapp.com',
  projectId: 'quickiefix-staging',
  storageBucket: 'quickiefix-staging.firebasestorage.app',
  messagingSenderId: '980457473979',
  appId: '1:980457473979:web:9e220ffbc5f80405c2669e',
};
export const firebaseEnv =
  import.meta.env.VITE_FIREBASE_ENV === 'staging' ? 'staging' : 'production';
export const firebaseConfig = firebaseEnv === 'staging' ? STAGING : PROD;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// IndexedDB persistence: warm loads serve from the local cache instantly while
// the network refresh happens behind the scenes — the single biggest speed win
// for a data dashboard like this.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const functions = getFunctions(app);
