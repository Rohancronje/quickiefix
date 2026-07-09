import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, radius, shadow } from '../theme';

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

/**
 * The raised centre "New Job" tab button — an amber circle that launches the
 * request flow instead of switching tabs.
 */
export function NewJobTabButton() {
  const router = useRouter();
  return (
    <View style={styles.centerWrap} pointerEvents="box-none">
      <Pressable
        style={styles.centerBtn}
        onPress={() => router.push('/new-job')}
        accessibilityLabel="New job"
      >
        <Ionicons name="add" size={30} color={colors.navy} />
      </Pressable>
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
  centerWrap: { flex: 1, alignItems: 'center' },
  centerBtn: {
    top: -18,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.surface,
    ...shadow.floating,
  },
});
