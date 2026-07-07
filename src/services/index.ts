/**
 * Service selector.
 *
 * Automatically uses the real Firebase backend once you've filled in
 * `firebaseConfig.ts`; otherwise it falls back to the local mock backend so the
 * app runs with zero setup. Nothing else in the app needs to change — every
 * screen depends only on the `Backend` interface.
 */
import { Backend } from './backend';
import { firestoreBackend } from './firestoreBackend';
import { isFirebaseConfigured } from './firebase';
import { mockBackend } from './mockBackend';

export const usingFirebase = isFirebaseConfigured;

export const backend: Backend = isFirebaseConfigured ? firestoreBackend : mockBackend;

/** Restore the persisted session, whichever backend is active. */
export const getSessionUser = () => backend.getSessionUser();

/**
 * "Reset demo data" only makes sense for the mock. On Firebase it simply signs
 * the user out (there's no local demo store to reseed).
 */
export const resetDemoData = () =>
  isFirebaseConfigured ? backend.logout() : mockBackend.resetDemoData();

export * from './backend';
