import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const CFG = {
  staging: {
    apiKey: 'AIzaSyAp74jq40qkb8QgI-Du4lAxvfcMF_V1RTw',
    authDomain: 'quickiefix-staging.firebaseapp.com',
    projectId: 'quickiefix-staging',
    appId: '1:980457473979:web:9e220ffbc5f80405c2669e',
  },
  prod: {
    apiKey: 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k',
    authDomain: 'quickiefix-2ea2a.firebaseapp.com',
    projectId: 'quickiefix-2ea2a',
    appId: '1:468151741418:web:137fcd2946fc680e5f2093',
  },
};
const which = process.argv[2] || 'staging';
const pw = process.argv[3] || 'password';
const app = initializeApp(CFG[which]);
const auth = getAuth(app);
const cred = await signInWithEmailAndPassword(auth, 'admin@quickiefix.store', pw);
// Ensure a fresh ID token is minted and attached before invoking the callable.
await cred.user.getIdToken(true);
await new Promise((r) => setTimeout(r, 800));
const fns = getFunctions(app); // default region us-central1
const res = await httpsCallable(fns, 'backfillPublicProfiles')({});
console.log(`[${which}] backfill result:`, JSON.stringify(res.data));
process.exit(0);
