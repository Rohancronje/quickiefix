import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, AppState, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { LockScreen } from '../src/components/LockScreen';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { clearNotificationBadge, configureNotificationHandling, onNotificationTap } from '../src/lib/push';
import { colors } from '../src/theme';

/**
 * On wide screens (desktop web) the mobile-first UI is centred in a phone-width
 * column on a navy gutter, so it reads as an intentional app frame instead of a
 * stretched mobile layout. On phones it's a passthrough (full width).
 */
function AppFrame({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  if (width < 700) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 460,
          backgroundColor: colors.bg,
          overflow: 'hidden',
          // web-only shadow; ignored on native
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
        } as never}
      >
        {children}
      </View>
    </View>
  );
}

/** Redirect the user into the right route group based on session + role. */
function useAuthRouting() {
  const { user, loading, sessionEnded } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const group = segments[0];
    const inAuth = group === '(auth)';
    const inShared = group === '(shared)'; // job request/track — either role

    if (!user && !inAuth) {
      // Returning users (session ended on app close) go straight to login;
      // first-time visitors get the welcome pitch.
      router.replace(sessionEnded ? '/login' : '/welcome');
    } else if (user && !inShared) {
      const target = user.role === 'tradie' ? '(tradie)' : '(customer)';
      if (group !== target) {
        router.replace(user.role === 'tradie' ? '/dashboard' : '/home');
      }
    }
  }, [user, loading, segments, router]);

  return loading;
}

function RootNavigator() {
  const loading = useAuthRouting();
  const { user, locked } = useAuth();
  const router = useRouter();

  // Push notifications: show banners in the foreground; tapping a job push
  // jumps straight to that job (tradie → offer screen, customer → tracking).
  // Opening/foregrounding the app clears the icon badge + stale tray items —
  // the app itself always shows live state, so once open they're redundant.
  useEffect(() => {
    configureNotificationHandling();
    clearNotificationBadge();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') clearNotificationBadge();
    });
    const unsubTap = onNotificationTap((data) => {
      const jobId = typeof data.jobId === 'string' ? data.jobId : null;
      if (!jobId) return;
      const role = typeof data.role === 'string' ? data.role : 'tradie';
      router.push(
        role === 'customer'
          ? { pathname: '/track/[id]', params: { id: jobId } }
          : { pathname: '/job/[id]', params: { id: jobId } },
      );
    });
    return () => {
      sub.remove();
      unsubTap();
    };
  }, [router]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.amber} size="large" />
      </View>
    );
  }

  // Biometric app lock: a restored session stays sealed behind the OS
  // fingerprint/face prompt after the app was fully closed.
  if (user && locked) {
    return (
      <AppFrame>
        <LockScreen />
      </AppFrame>
    );
  }

  return (
    <AppFrame>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(tradie)" />
        <Stack.Screen name="(shared)" />
      </Stack>
    </AppFrame>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
