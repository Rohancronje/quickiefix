import { Stack } from 'expo-router';
import { colors } from '../../src/theme';

// Screens usable by BOTH customers and tradies (a tradie can also request help).
export default function SharedLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="new-job" options={{ presentation: 'modal' }} />
      <Stack.Screen name="track/[id]" />
      <Stack.Screen name="reassign/[id]" />
    </Stack>
  );
}
