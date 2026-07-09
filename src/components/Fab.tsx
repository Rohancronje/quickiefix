/**
 * Floating action button with an expanding quick-action menu (Uber-style).
 * Uses RN's built-in Animated (no Reanimated) so it stays old-architecture and
 * ships over-the-air. Actions fade + slide up from the button.
 */
import React, { useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, shadow } from '../theme';
import { Txt } from './ui';

export interface FabAction {
  icon: string;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
}

export function Fab({ actions }: { actions: FabAction[] }) {
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const animateTo = (to: number, cb?: () => void) =>
    Animated.timing(anim, {
      toValue: to,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(cb);

  const toggle = () => {
    if (open) animateTo(0, () => setOpen(false));
    else {
      setOpen(true);
      animateTo(1);
    }
  };
  const run = (fn: () => void) => animateTo(0, () => {
    setOpen(false);
    fn();
  });

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <>
      {open && <Pressable style={styles.backdrop} onPress={toggle} />}

      <View style={styles.wrap} pointerEvents="box-none">
        {open &&
          actions.map((a, i) => {
            const translateY = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [12 * (i + 1), 0],
            });
            return (
              <Animated.View
                key={a.label}
                style={[styles.actionRow, { opacity: anim, transform: [{ translateY }] }]}
              >
                <View style={styles.actionLabel}>
                  <Txt variant="caption" color={colors.white} style={{ fontWeight: '700' }}>
                    {a.label}
                  </Txt>
                </View>
                <Pressable
                  style={[
                    styles.actionBtn,
                    { backgroundColor: a.tone === 'danger' ? colors.danger : colors.surface },
                  ]}
                  onPress={() => run(a.onPress)}
                >
                  <Txt style={{ fontSize: 20 }}>{a.icon}</Txt>
                </Pressable>
              </Animated.View>
            );
          })}

        <Pressable style={styles.fab} onPress={toggle} accessibilityLabel="Quick actions">
          <Animated.Text style={[styles.plus, { transform: [{ rotate }] }]}>＋</Animated.Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,18,32,0.35)' },
  wrap: { position: 'absolute', right: 20, bottom: 24, alignItems: 'flex-end', gap: 12 },
  fab: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.floating,
  },
  plus: { fontSize: 34, color: colors.navy, lineHeight: 38, fontWeight: '300' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionLabel: {
    backgroundColor: colors.navy,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  actionBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
});
