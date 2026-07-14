/**
 * Firebase project configuration.
 *
 * These web config values are NOT secrets — Firebase is designed to expose them
 * in client apps. Real security comes from the rules in `firestore.rules` /
 * `storage.rules`. It is safe to commit this file.
 *
 * ENVIRONMENTS: builds target PRODUCTION by default. Set
 * `EXPO_PUBLIC_FIREBASE_ENV=staging` at build/export time to produce a build
 * that talks to the staging project instead (see docs/INFRA.md).
 *
 * As soon as `apiKey` holds a real value (not a TODO), the app switches from the
 * local mock backend to live Firebase automatically.
 */
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
  process.env.EXPO_PUBLIC_FIREBASE_ENV === 'staging' ? 'staging' : 'production';

export const firebaseConfig = firebaseEnv === 'staging' ? STAGING : PROD;
