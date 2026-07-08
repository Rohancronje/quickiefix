import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme';

/** Redirect the user into the right route group based on session + role. */
function useAuthRouting() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const group = segments[0];
    const inAuth = group === '(auth)';
    const inShared = group === '(shared)'; // job request/track — either role

    if (!user && !inAuth) {
      router.replace('/welcome');
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

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.amber} size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(tradie)" />
      <Stack.Screen name="(shared)" />
    </Stack>
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
