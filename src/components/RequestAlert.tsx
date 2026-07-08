import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tradeMeta } from '../constants';
import { JobOffer } from '../services';
import { colors, font, radius, shadow, spacing } from '../theme';
import { Txt } from './ui';

/**
 * A loud, hard-to-miss in-app alert for incoming direct requests. Renders as a
 * floating banner over ALL tradie screens (so the tradie is alerted even when
 * they're not on the dashboard), pulses for attention, buzzes on arrival, and
 * jumps to the dashboard on tap. Time-sensitive by design.
 */
export function RequestAlert({ offers }: { offers: JobOffer[] }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const prevCount = useRef(0);
  const pulse = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(-120)).current;

  const count = offers.length;
  const top = offers[0];

  // Buzz when a NEW request arrives (count goes up).
  useEffect(() => {
    if (count > prevCount.current && Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
    prevCount.current = count;
  }, [count]);

  // Slide in / out.
  useEffect(() => {
    Animated.timing(drop, {
      toValue: count > 0 ? 0 : -140,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [count, drop]);

  // Continuous attention pulse while a request is pending.
  useEffect(() => {
    if (count === 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [count, pulse]);

  if (count === 0) return null;

  const meta = tradeMeta(top.job.trade);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingTop: insets.top + 6, transform: [{ translateY: drop }] }]}
    >
      <Pressable onPress={() => router.push('/dashboard')}>
        <Animated.View style={[styles.banner, { transform: [{ scale }] }]}>
          <View style={styles.bell}>
            <Txt style={{ fontSize: 22 }}>🔔</Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="label" color={colors.navy}>
              {count > 1 ? `${count} new job requests!` : 'New job request!'}
            </Txt>
            <Txt variant="caption" color={colors.navy} numberOfLines={1} style={{ opacity: 0.8 }}>
              {top.job.customerName} needs a {meta.label.toLowerCase()} · tap to respond
            </Txt>
          </View>
          <Txt style={styles.chev}>›</Txt>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: spacing.md,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.amber,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.floating,
  },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(11,18,32,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chev: { fontSize: 28, color: colors.navy, fontWeight: '800', marginRight: 4 },
});
