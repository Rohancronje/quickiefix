import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Vector tab icon. The active tab gets a branded amber pill behind a navy
 * glyph; inactive tabs show a muted outline glyph. Icon pairs are passed
 * explicitly (filled + outline) so every tab reads crisply in both states.
 */
export function TabBarIcon({
  active,
  inactive,
  focused,
}: {
  active: IconName;
  inactive: IconName;
  focused: boolean;
}) {
  return (
    <View style={[styles.pill, focused && styles.pillActive]}>
      <Ionicons
        name={focused ? active : inactive}
        size={20}
        color={focused ? colors.navy : colors.textMuted}
      />
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
});
