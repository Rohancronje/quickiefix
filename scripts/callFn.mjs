import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
const CFG = {
  staging: { apiKey: 'AIzaSyAp74jq40qkb8QgI-Du4lAxvfcMF_V1RTw', authDomain: 'quickiefix-staging.firebaseapp.com', projectId: 'quickiefix-staging', appId: '1:980457473979:web:9e220ffbc5f80405c2669e' },
  prod: { apiKey: 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k', authDomain: 'quickiefix-2ea2a.firebaseapp.com', projectId: 'quickiefix-2ea2a', appId: '1:468151741418:web:137fcd2946fc680e5f2093' },
};
const which = process.argv[2] || 'staging';
const fn = process.argv[3];
const pw = process.argv[4] || 'password';
const app = initializeApp(CFG[which]);
const cred = await signInWithEmailAndPassword(getAuth(app), 'admin@quickiefix.store', pw);
await cred.user.getIdToken(true);
await new Promise((r) => setTimeout(r, 800));
const res = await httpsCallable(getFunctions(app), fn)({});
console.log(`[${which}] ${fn}:`, JSON.stringify(res.data));
process.exit(0);
