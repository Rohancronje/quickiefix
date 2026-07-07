import { Stack } from 'expo-router';
import { colors } from '../../src/theme';

export default function CustomerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="new-job" options={{ presentation: 'modal' }} />
      <Stack.Screen name="track/[id]" />
    </Stack>
  );
}
