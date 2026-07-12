/**
 * Push notifications (Expo push service), fully guarded.
 *
 * expo-notifications is a NATIVE module. Binaries built before it exists still
 * receive OTA JS, so every entry point probes for the native side first and
 * degrades to a no-op — never a crash. Token delivery on Android also needs
 * FCM V1 credentials on EAS + google-services.json (see design/build-day-checklist.md).
 */
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type Notifications = typeof import('expo-notifications');

const PROJECT_ID = 'af87594c-64e6-4ab1-8796-04cf077c722b';

function mod(): Notifications | null {
  try {
    if (!requireOptionalNativeModule('ExpoPushTokenManager')) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as Notifications;
  } catch {
    return null;
  }
}

export function pushAvailable(): boolean {
  return mod() != null;
}

/** Show notifications while the app is foregrounded (banner, no badge spam). */
export function configureNotificationHandling(): void {
  try {
    const n = mod();
    if (!n) return;
    n.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    /* no-op on unsupported binaries */
  }
}

/**
 * Ask permission and return this device's Expo push token (null if declined,
 * unsupported, or on a binary without the native module).
 */
export async function getPushToken(): Promise<string | null> {
  try {
    const n = mod();
    if (!n) return null;

    if (Platform.OS === 'android') {
      // High-importance channel so job offers pop with sound.
      await n.setNotificationChannelAsync('offers', {
        name: 'Job offers',
        importance: n.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FFB020',
        sound: 'default',
      });
    }

    const perms = await n.getPermissionsAsync();
    let granted = perms.granted;
    if (!granted) {
      const req = await n.requestPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) return null;

    const token = await n.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    return token.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Clear the app-icon badge and sweep delivered notifications. Called whenever
 * the app comes to the foreground — the app itself always shows live state, so
 * once it's open the tray items are stale.
 */
export function clearNotificationBadge(): void {
  try {
    const n = mod();
    if (!n) return;
    void n.setBadgeCountAsync(0).catch(() => {});
    void n.dismissAllNotificationsAsync().catch(() => {});
  } catch {
    /* no-op */
  }
}

/**
 * Subscribe to notification taps. The payload carries { jobId, role } so the
 * app can jump straight to the job. Returns an unsubscribe (no-op when
 * unavailable).
 */
export function onNotificationTap(cb: (data: Record<string, unknown>) => void): () => void {
  try {
    const n = mod();
    if (!n) return () => {};
    const sub = n.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data;
      if (data) cb(data as Record<string, unknown>);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
