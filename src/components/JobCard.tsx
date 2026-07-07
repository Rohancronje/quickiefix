import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { jobStatusMeta, tradeMeta } from '../constants';
import { relativeTime } from '../lib/format';
import { colors, font, radius, spacing } from '../theme';
import { Job } from '../types';
import { Badge, Txt } from './ui';

export function StatusPill({ status }: { status: Job['status'] }) {
  const m = jobStatusMeta[status];
  return <Badge label={m.label} color={m.color} soft={m.soft} dot />;
}

export function JobCard({
  job,
  now,
  onPress,
  showCustomer,
}: {
  job: Job;
  now: number;
  onPress?: () => void;
  showCustomer?: boolean;
}) {
  const meta = tradeMeta(job.trade);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && onPress ? { opacity: 0.85 } : null]}
    >
      <View style={styles.tradeIcon}>
        <Txt style={{ fontSize: 24 }}>{meta.emoji}</Txt>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.topRow}>
          <Txt variant="label" style={{ flex: 1 }}>
            {meta.label}
          </Txt>
          <StatusPill status={job.status} />
        </View>
        <Txt variant="caption" color={colors.textMuted} numberOfLines={2}>
          {job.description}
        </Txt>
        <View style={styles.metaRow}>
          <Txt variant="caption" color={colors.textFaint}>
            {showCustomer ? job.customerName : job.location.address}
          </Txt>
          <Txt variant="caption" color={colors.textFaint}>
            {relativeTime(job.timestamps.createdAt, now)}
          </Txt>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tradeIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    gap: spacing.sm,
  },
});
