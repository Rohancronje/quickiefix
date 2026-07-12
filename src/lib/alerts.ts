/**
 * In-app alert feedback: vibration + notification sound when a job offer
 * lands while the app is open. Both expo-haptics and expo-audio are NATIVE
 * modules, so every call probes for the native side first and silently
 * no-ops on binaries built without them (OTA-safe).
 */
import { requireOptionalNativeModule } from 'expo';

type Haptics = typeof import('expo-haptics');
type Audio = typeof import('expo-audio');

function haptics(): Haptics | null {
  try {
    if (!requireOptionalNativeModule('ExpoHaptics')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-haptics') as Haptics;
  } catch {
    return null;
  }
}

function audio(): Audio | null {
  try {
    if (!requireOptionalNativeModule('ExpoAudio')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-audio') as Audio;
  } catch {
    return null;
  }
}

/** Strong buzz for an incoming job offer. */
export function buzzForOffer(): void {
  try {
    const h = haptics();
    if (!h) return;
    void h.notificationAsync(h.NotificationFeedbackType.Success);
  } catch {
    /* no-op */
  }
}

/** Play the bundled notification chime (fire-and-forget). */
export function playOfferSound(): void {
  try {
    const a = audio();
    if (!a) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const player = a.createAudioPlayer(require('../../assets/notification.wav'));
    player.play();
    // Release once it finishes (defensive timeout — clip is ~1s).
    setTimeout(() => {
      try {
        player.remove();
      } catch {
        /* already released */
      }
    }, 4000);
  } catch {
    /* no-op */
  }
}

/** Combined attention hit for a new offer. */
export function offerAlert(): void {
  buzzForOffer();
  playOfferSound();
}
