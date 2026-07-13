/**
 * Biometric app-lock helpers (fingerprint / face unlock).
 *
 * expo-local-authentication is a NATIVE module: builds that predate it don't
 * have the native side, and OTA updates still reach those builds. Everything
 * here lazy-requires the module inside try/catch so on an old binary the
 * feature simply reports "unavailable" instead of crashing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';

const FLAG_KEY = 'quickiefix.biolock.v1'; // '1' = require biometric unlock on cold start
const LAST_UNLOCK_KEY = 'quickiefix.lastUnlock.v1'; // ms timestamp of last successful unlock

type LocalAuth = typeof import('expo-local-authentication');

function mod(): LocalAuth | null {
  try {
    // Probe for the NATIVE module first — requireOptionalNativeModule returns
    // null (never throws) when this binary wasn't built with it. Only then do
    // we require the JS package, whose import would otherwise crash.
    if (!requireOptionalNativeModule('ExpoLocalAuthentication')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-local-authentication') as LocalAuth;
  } catch {
    return null;
  }
}

/** Device can do biometrics AND has at least one fingerprint/face enrolled. */
export async function biometricsAvailable(): Promise<boolean> {
  try {
    const la = mod();
    if (!la) return false;
    const [hw, enrolled] = await Promise.all([la.hasHardwareAsync(), la.isEnrolledAsync()]);
    return hw && enrolled;
  } catch {
    return false;
  }
}

// One OS sheet at a time: if a second unlock request lands while a prompt is
// already up (double-mount, double-effect, re-lock race), it shares the same
// pending result instead of stacking a second prompt.
let inFlight: Promise<boolean> | null = null;

/** Prompt the OS biometric sheet. True only on a positive match. */
export function biometricUnlock(reason = 'Unlock QuickieFix'): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const la = mod();
      if (!la) return false;
      const res = await la.authenticateAsync({
        promptMessage: reason,
        cancelLabel: 'Use password instead',
        disableDeviceFallback: false, // allow device PIN as OS-level fallback
      });
      if (res.success) {
        // Remember the moment of success so an app "refresh" straight after
        // (Android recreating the activity around the biometric sheet) doesn't
        // demand a second scan.
        await AsyncStorage.setItem(LAST_UNLOCK_KEY, String(Date.now())).catch(() => {});
      }
      return res.success;
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Did a biometric unlock succeed within the last `windowMs`? Used to skip a
 *  redundant second prompt when the app restarts right after unlocking. */
export async function wasRecentlyUnlocked(windowMs = 30_000): Promise<boolean> {
  try {
    const at = Number(await AsyncStorage.getItem(LAST_UNLOCK_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < windowMs;
  } catch {
    return false;
  }
}

export async function isBiolockEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FLAG_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setBiolockEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) await AsyncStorage.setItem(FLAG_KEY, '1');
    else await AsyncStorage.removeItem(FLAG_KEY);
  } catch {
    /* non-fatal */
  }
}
