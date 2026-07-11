import { Stack } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/theme';

export default function CustomerLayout() {
  // On logout the user is null for a beat before the route guard redirects.
  // Render nothing in that window so role-locked screens (useCustomer) never
  // mount without a session — otherwise they throw mid-transition.
  const { user } = useAuth();
  if (!user || user.role !== 'customer') return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
