/**
 * Biometric app-lock helpers (fingerprint / face unlock).
 *
 * expo-local-authentication is a NATIVE module: builds that predate it don't
 * have the native side, and OTA updates still reach those builds. Everything
 * here lazy-requires the module inside try/catch so on an old binary the
 * feature simply reports "unavailable" instead of crashing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const FLAG_KEY = 'quickiefix.biolock.v1'; // '1' = require biometric unlock on cold start

type LocalAuth = typeof import('expo-local-authentication');

function mod(): LocalAuth | null {
  try {
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

/** Prompt the OS biometric sheet. True only on a positive match. */
export async function biometricUnlock(reason = 'Unlock QuickieFix'): Promise<boolean> {
  try {
    const la = mod();
    if (!la) return false;
    const res = await la.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Use password instead',
      disableDeviceFallback: false, // allow device PIN as OS-level fallback
    });
    return res.success;
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
