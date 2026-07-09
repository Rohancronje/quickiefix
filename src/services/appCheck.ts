/**
 * Firebase App Check — wiring scaffold (NOT yet enforcing).
 *
 * WHY THIS IS A SCAFFOLD, NOT A DROP-IN:
 * The app uses the Firebase *JS* SDK, whose App Check has no built-in Play
 * Integrity / App Attest provider for React Native (its providers are web
 * reCAPTCHA). So real device attestation on mobile needs a native token source.
 * This file centralises the init + the decision point so turning it on later is
 * a one-flag change, and it's a safe no-op until then. Server enforcement is
 * also OFF (no `enforceAppCheck` on the callables), so nothing breaks meanwhile.
 *
 * TO ENABLE REAL APP CHECK (requires a native rebuild):
 *   1. Firebase console → App Check → register the Android app with the
 *      **Play Integrity** provider (iOS → App Attest). Copy a debug token for
 *      local testing.
 *   2. Provide an attestation token source. Two options:
 *        a) Add `@react-native-firebase/app-check` (native) and initialise it
 *           there, OR
 *        b) Supply a `CustomProvider` whose `getToken()` returns a Play
 *           Integrity token from a small native module, e.g.:
 *
 *        import { initializeAppCheck, CustomProvider } from 'firebase/app-check';
 *        initializeAppCheck(app, {
 *          provider: new CustomProvider({
 *            getToken: async () => {
 *              const token = await getPlayIntegrityToken(); // native module
 *              return { token, expireTimeMillis: Date.now() + 55 * 60 * 1000 };
 *            },
 *          }),
 *          isTokenAutoRefreshEnabled: true,
 *        });
 *
 *   3. Flip APP_CHECK_ENABLED to true here AND add `enforceAppCheck: true` to the
 *      callable(s) in functions/index.js (start with `sendPasswordReset`), then
 *      rebuild the app. Roll out gradually — non-attested clients get rejected.
 */
import { FirebaseApp } from 'firebase/app';

/** Master switch — leave false until all three steps in the header are done. */
export const APP_CHECK_ENABLED = false;

/**
 * Initialise App Check. No-op until APP_CHECK_ENABLED is true and a real
 * provider is wired above — called from firebase.ts so there's a single place
 * to turn it on.
 */
export function initAppCheck(_app: FirebaseApp): void {
  if (!APP_CHECK_ENABLED) return;
  // Wire the real provider here (see file header). Deliberately not importing
  // 'firebase/app-check' until it's actually enabled, to avoid shipping an
  // unusable web-only provider into the native bundle.
  console.warn('App Check is enabled but no attestation provider is wired yet.');
}
