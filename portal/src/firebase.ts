import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Same Firebase project as the mobile app. Web config values are not secret.
export const firebaseConfig = {
  apiKey: 'AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k',
  authDomain: 'quickiefix-2ea2a.firebaseapp.com',
  projectId: 'quickiefix-2ea2a',
  storageBucket: 'quickiefix-2ea2a.firebasestorage.app',
  messagingSenderId: '468151741418',
  appId: '1:468151741418:web:137fcd2946fc680e5f2093',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
