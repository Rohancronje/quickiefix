import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

/**
 * Standard screen container. Handles safe-area insets, optional scrolling, and
 * keyboard avoidance so inputs are never hidden behind the keyboard.
 *
 * Keyboard strategy (best-effort without a native lib):
 *  - iOS: `automaticallyAdjustKeyboardInsets` insets the scroll content by the
 *    keyboard height, so a focused field can be scrolled to.
 *  - Android: relies on `adjustResize` (set in app.json) — the window resizes
 *    and the ScrollView shrinks. `KeyboardAvoidingView` (padding on iOS) is a
 *    belt-and-braces layer for non-scrolling content.
 * For pixel-perfect auto-scroll-to-field, migrate to react-native-keyboard-
 * controller on the next native build.
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

  // Scroll case: iOS `automaticallyAdjustKeyboardInsets` handles it (no KAV, to
  // avoid double-adjust); Android relies on adjustResize. Non-scroll case: a
  // KeyboardAvoidingView pushes the content up on iOS.
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={edges}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[pad, { gap: spacing.lg, paddingBottom: spacing.xxxl }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <KeyboardAvoidingView
          style={[styles.flex, pad, contentStyle]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {children}
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
});
