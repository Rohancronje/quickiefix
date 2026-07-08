import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { tradeMeta } from '../constants';
import { useAvailableTradies } from '../hooks/useData';
import { initials } from '../lib/format';
import { formatDistance } from '../lib/geo';
import { colors, font, radius, spacing } from '../theme';
import { Location, TradeCategory } from '../types';
import { StarRating } from './StarRating';
import { Avatar, Badge, EmptyState, Txt } from './ui';

/**
 * Shows the count of available matching tradies and a selectable list. The
 * customer picks one to send their request to.
 */
export function TradieSelectList({
  trade,
  location,
  excludeIds = [],
  selectedId,
  onSelect,
}: {
  trade: TradeCategory | null;
  location: Location | null;
  excludeIds?: string[];
  selectedId: string | null;
  onSelect: (tradieId: string) => void;
}) {
  const { candidates, loading } = useAvailableTradies(trade, location);
  const list = candidates.filter((c) => !excludeIds.includes(c.tradie.id));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.amber} size="large" />
        <Txt variant="caption" color={colors.textMuted}>
          Finding available tradies…
        </Txt>
      </View>
    );
  }

  if (list.length === 0) {
    return (
      <EmptyState
        emoji="😴"
        title="No tradies available right now"
        subtitle={`There are no ${trade ? tradeMeta(trade).label.toLowerCase() : ''}s online in your area at the moment. Try again shortly.`}
      />
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.countRow}>
        <View style={styles.countDot} />
        <Txt variant="label" color={colors.success}>
          {list.length} {list.length === 1 ? 'tradie' : 'tradies'} available near you
        </Txt>
      </View>

      {list.map(({ tradie, distanceKm, etaMinutes }) => {
        const meta = tradeMeta(tradie.primaryTrade);
        const selected = selectedId === tradie.id;
        return (
          <Pressable
            key={tradie.id}
            onPress={() => onSelect(tradie.id)}
            style={[styles.card, selected && styles.cardSelected]}
          >
            <Avatar label={initials(tradie.firstName, tradie.lastName)} size={52} color={colors.navy} />
            <View style={{ flex: 1, gap: 3 }}>
              <Txt variant="label">{tradie.businessName}</Txt>
              <View style={styles.metaRow}>
                <StarRating value={tradie.ratingAvg} readOnly size={13} />
                <Txt variant="caption" color={colors.textMuted}>
                  {tradie.ratingAvg.toFixed(1)} · {tradie.completedJobs} jobs
                </Txt>
              </View>
              <View style={styles.tagRow}>
                <Txt variant="caption" color={colors.textFaint}>
                  {meta.emoji} {meta.label}
                </Txt>
                {distanceKm > 0 && (
                  <Txt variant="caption" color={colors.textFaint}>
                    · {formatDistance(distanceKm)} · ~{etaMinutes} min
                  </Txt>
                )}
                {tradie.qualifications.length > 0 && (
                  <Badge label="✓ Verified" color={colors.success} soft={colors.successSoft} />
                )}
              </View>
            </View>
            <View style={[styles.radio, selected && styles.radioOn]}>
              {selected && <Txt style={styles.radioCheck}>✓</Txt>}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.line,
  },
  cardSelected: { borderColor: colors.amber, backgroundColor: colors.warningSoft },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.amber, borderColor: colors.amberDark },
  radioCheck: { color: colors.navy, fontWeight: '800', fontSize: 14 },
});
