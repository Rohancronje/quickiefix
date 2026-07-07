import { Stack } from 'expo-router';
import { colors } from '../../src/theme';

export default function TradieLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="job/[id]" />
    </Stack>
  );
}
