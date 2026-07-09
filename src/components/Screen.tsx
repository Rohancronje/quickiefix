import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

/**
 * Standard screen container. Handles safe-area insets, optional scrolling, and
 * keyboard avoidance so inputs are never hidden behind the keyboard.
 *
 * Keyboard strategy: scrollable screens use KeyboardAwareScrollView, which
 * auto-scrolls the focused input above the keyboard on both platforms (pure JS,
 * no native module). Non-scroll screens use a KeyboardAvoidingView.
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
        <KeyboardAwareScrollView
          style={styles.flex}
          contentContainerStyle={[pad, { gap: spacing.lg, paddingBottom: spacing.xxxl }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          enableOnAndroid
          enableResetScrollToCoords={false}
          extraScrollHeight={Platform.OS === 'ios' ? 20 : 40}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </KeyboardAwareScrollView>
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
