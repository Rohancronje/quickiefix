import React from 'react';
import { StyleSheet, View } from 'react-native';
import { tradeMeta } from '../constants';
import { initials } from '../lib/format';
import { colors, font, radius, spacing } from '../theme';
import { Tradie } from '../types';
import { StarRating } from './StarRating';
import { Avatar, Badge, Txt } from './ui';

/** Public reputation card for a tradie — shown to customers on acceptance. */
export function TradieProfileCard({ tradie }: { tradie: Tradie }) {
  const primary = tradeMeta(tradie.primaryTrade);
  const verified = tradie.qualifications.length > 0 || primary.regulated;
  const responseRate =
    tradie.jobsOffered > 0 ? Math.round((tradie.jobsAccepted / tradie.jobsOffered) * 100) : 100;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar label={initials(tradie.firstName, tradie.lastName)} size={60} color={colors.navy} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="heading">{tradie.businessName}</Txt>
          <Txt variant="caption" color={colors.textMuted}>
            {primary.emoji} {primary.label} · {tradie.yearsExperience} yrs experience
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 }}>
            <StarRating value={tradie.ratingAvg} readOnly size={15} />
            <Txt variant="caption" color={colors.textMuted}>
              {tradie.ratingAvg.toFixed(1)} ({tradie.ratingCount})
            </Txt>
          </View>
        </View>
      </View>

      <View style={styles.badges}>
        {tradie.approval === 'approved' && (
          <Badge label="✓ Verified" color={colors.success} soft={colors.successSoft} />
        )}
        {verified && (
          <Badge label="🎓 Qualified" color={colors.blue} soft={colors.infoSoft} />
        )}
        {tradie.secondaryTrades.map((t) => (
          <Badge key={t} label={tradeMeta(t).label} />
        ))}
      </View>

      <View style={styles.stats}>
        <Stat value={`${tradie.completedJobs}`} label="Jobs done" />
        <View style={styles.statDivider} />
        <Stat value={tradie.ratingAvg ? tradie.ratingAvg.toFixed(1) : '—'} label="Rating" />
        <View style={styles.statDivider} />
        <Stat value={`${responseRate}%`} label="Response" />
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Txt variant="heading" color={colors.navy}>
        {value}
      </Txt>
      <Txt variant="caption" color={colors.textMuted}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  header: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  statDivider: { width: 1, height: 28, backgroundColor: colors.line },
});
