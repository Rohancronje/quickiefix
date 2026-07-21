/**
 * The most important control in the app: the tradie's availability.
 * A status pill that animates smoothly between states (green available /
 * amber on-a-job / grey offline) with a large toggle. Built-in Animated only
 * (colour interpolation → useNativeDriver:false is fine at this scale).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Switch, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { TradieStatus } from '../types';
import { Card, Txt } from './ui';

type Visual = { dot: string; soft: string; label: string; sub: string };

function visualFor(status: TradieStatus, locating: boolean): Visual {
  if (status === 'available') {
    return {
      dot: colors.success,
      soft: colors.successSoft,
      label: 'Available',
      sub: locating ? 'Getting your location…' : "You're visible to nearby customers.",
    };
  }
  if (status === 'job_accepted' || status === 'on_site') {
    return {
      dot: colors.amberDark,
      soft: colors.warningSoft,
      label: 'On a job',
      sub: 'New offers pause until you finish up.',
    };
  }
  return {
    dot: colors.textFaint,
    soft: colors.surfaceAlt,
    label: 'Unavailable',
    sub: 'Turn on availability to start receiving jobs.',
  };
}

export function AvailabilityCard({
  status,
  locating,
  onToggle,
  leading,
}: {
  status: TradieStatus;
  locating: boolean;
  onToggle: (value: boolean) => void;
  /** Optional node shown at the start of the card (e.g. the tradie avatar). */
  leading?: React.ReactNode;
}) {
  const isAvailable = status === 'available';
  const onJob = status === 'job_accepted' || status === 'on_site';
  const v = visualFor(status, locating);

  // 0 = offline, 1 = available, 2 = on-a-job → drives the animated tint.
  const target = onJob ? 2 : isAvailable ? 1 : 0;
  const anim = useRef(new Animated.Value(target)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: target, duration: 250, useNativeDriver: false }).start();
  }, [target, anim]);

  const tint = anim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [colors.surfaceAlt, colors.successSoft, colors.warningSoft],
  });
  const dot = anim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [colors.textFaint, colors.success, colors.amberDark],
  });

  return (
    <Card style={styles.card}>
      {leading}
      <View style={{ flex: 1, gap: spacing.sm }}>
        <Animated.View style={[styles.pill, { backgroundColor: tint }]}>
          <Animated.View style={[styles.dot, { backgroundColor: dot }]} />
          <Txt variant="caption" color={v.dot} style={styles.pillText}>
            {v.label}
          </Txt>
        </Animated.View>
        <Txt variant="caption" color={colors.textMuted}>
          {v.sub}
        </Txt>
      </View>
      {!onJob && (
        <Switch
          value={isAvailable}
          onValueChange={onToggle}
          trackColor={{ true: colors.success, false: colors.line }}
          thumbColor={colors.white}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  pillText: { fontWeight: '800', fontSize: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
