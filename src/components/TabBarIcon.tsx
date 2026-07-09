import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

/**
 * Tab icon. The active tab gets a branded amber pill behind its glyph so the
 * current tab is unmistakable; inactive tabs dim their glyph. (Emoji-based to
 * keep the app icon-library free — the pill + label tint carry the state, since
 * emoji can't be colour-tinted.)
 */
export function TabBarIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[styles.pill, focused && styles.pillActive]}>
      <Text style={[styles.glyph, !focused && styles.glyphInactive]}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 56,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: colors.amber,
  },
  glyph: { fontSize: 18 },
  glyphInactive: { opacity: 0.55 },
});
