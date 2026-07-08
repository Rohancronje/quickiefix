/**
 * Firebase initialisation.
 *
 * Auth, Firestore and Storage are only initialised when a real config is
 * present (`isFirebaseConfigured`). Otherwise these stay null and the app runs
 * on the mock backend — so an unconfigured checkout still works with zero setup.
 *
 * See `firestore.rules` for the security model and `README.md` /
 * `src/services/firebaseConfig.ts` for the go-live steps.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, initializeAuth, Persistence } from 'firebase/auth';
// getReactNativePersistence keeps the signed-in session across restarts. It
// only exists in Firebase's React Native build (absent from the web type defs),
// so we access it dynamically and fall back to web defaults if it's missing.
import * as firebaseAuth from 'firebase/auth';
const getReactNativePersistence = (
  firebaseAuth as unknown as {
    getReactNativePersistence?: (storage: unknown) => Persistence;
  }
).getReactNativePersistence;
import { Firestore, getFirestore, initializeFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import { firebaseConfig } from './firebaseConfig';

export const isFirebaseConfigured =
  !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('TODO');

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

if (isFirebaseConfigured) {
  // Wrapped so a failure here can never crash app startup — worst case the app
  // loads with Firebase disabled rather than dying before the first screen.
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    try {
      authInstance =
        typeof getReactNativePersistence === 'function'
          ? initializeAuth(app, {
              persistence: getReactNativePersistence(AsyncStorage),
            })
          : getAuth(app); // web / fallback
    } catch {
      // initializeAuth throws if called twice (e.g. Fast Refresh) — reuse it.
      authInstance = getAuth(app);
    }
    try {
      // ignoreUndefinedProperties lets us write domain objects that contain
      // optional (undefined) fields without stripping them first.
      dbInstance = initializeFirestore(app, { ignoreUndefinedProperties: true });
    } catch {
      dbInstance = getFirestore(app);
    }
    storageInstance = getStorage(app);
  } catch (e) {
    console.error('Firebase init failed:', e);
  }
}

/** These are non-null whenever `isFirebaseConfigured` is true. */
export const auth = authInstance;
export const db = dbInstance;
export const storage = storageInstance;
