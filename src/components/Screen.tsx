import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

/**
 * Standard screen container. Handles safe-area insets and optional scrolling.
 * `dark` switches to the navy brand background (used on auth / hero screens).
 */
export function Screen({
  children,
  scroll = true,
  dark = false,
  padded = true,
  edges = ['top'],
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  dark?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  contentStyle?: ViewStyle;
}) {
  const bg = dark ? colors.navy : colors.bg;
  const pad = padded ? { padding: spacing.lg } : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={edges}>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[pad, { gap: spacing.lg, paddingBottom: spacing.xxxl }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
