/**
 * Browse & choose: the customer's live list of tradies for a `choose`-mode job.
 * Combines currently-available matching tradies (live) with busy tradies who
 * opted in (`interestedTradies`), sorted nearest-first, each with a Choose
 * action. Picking one calls `selectTradie`, which sends that tradie a final
 * accept prompt.
 */
import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { formatMoney } from '../constants';
import { useAvailableTradies } from '../hooks/useData';
import { distanceKm, estimateEtaMinutes, formatDistance } from '../lib/geo';
import { backend } from '../services';
import { colors, radius, spacing } from '../theme';
import { Job } from '../types';
import { Button, Card, EmptyState, Txt } from './ui';

interface Entry {
  id: string;
  business: string;
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  distanceKm: number;
  etaMinutes: number;
  hourlyCents?: number;
  companyName?: string;
  badge: 'available' | 'responded';
}

export function ChooseTradieList({ job }: { job: Job }) {
  const available = useAvailableTradies(job.trade, job.location);
  const [busyId, setBusyId] = useState<string | null>(null);

  const declined = new Set(job.declinedBy);
  const entries: Entry[] = [];
  const seen = new Set<string>();

  for (const c of available) {
    if (c.tradie.id === job.customerId || declined.has(c.tradie.id)) continue;
    seen.add(c.tradie.id);
    entries.push({
      id: c.tradie.id,
      business: c.tradie.businessName,
      ratingAvg: c.tradie.ratingAvg,
      ratingCount: c.tradie.ratingCount,
      completedJobs: c.tradie.completedJobs,
      distanceKm: c.distanceKm,
      etaMinutes: c.etaMinutes,
      hourlyCents: c.tradie.rateCard?.hourlyRateCents,
      companyName: c.tradie.companyName,
      badge: 'available',
    });
  }

  for (const it of job.interestedTradies ?? []) {
    if (it.tradieId === job.customerId || declined.has(it.tradieId) || seen.has(it.tradieId)) continue;
    seen.add(it.tradieId);
    let km = 0;
    if (it.baseLocation && job.location.latitude != null && job.location.longitude != null) {
      km = distanceKm(it.baseLocation, {
        latitude: job.location.latitude,
        longitude: job.location.longitude,
      });
    }
    entries.push({
      id: it.tradieId,
      business: it.businessName,
      ratingAvg: it.ratingAvg,
      ratingCount: it.ratingCount,
      completedJobs: it.completedJobs,
      distanceKm: km,
      etaMinutes: estimateEtaMinutes(km),
      hourlyCents: it.rateCard?.hourlyRateCents,
      companyName: it.companyName,
      badge: 'responded',
    });
  }

  entries.sort((a, b) => a.distanceKm - b.distanceKm);

  const choose = async (id: string) => {
    try {
      setBusyId(id);
      await backend.selectTradie(job.id, id);
    } catch (e) {
      Alert.alert('Could not select', (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState
          emoji="🔎"
          title="Looking for available pros"
          subtitle="No one is free in your area just yet. Busy tradies nearby have been asked — anyone who says yes will appear here."
        />
      </Card>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {entries.map((e) => {
        const isSelected = job.selectedTradieId === e.id;
        return (
          <Card key={e.id} style={[styles.card, isSelected && styles.cardSelected]}>
            <View style={styles.top}>
              <View style={styles.avatar}>
                <Txt style={{ fontSize: 20 }}>{e.business.charAt(0).toUpperCase()}</Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="label" numberOfLines={1}>
                  {e.business}
                </Txt>
                <Txt variant="caption" color={colors.textMuted}>
                  {e.ratingCount > 0 ? `⭐ ${e.ratingAvg.toFixed(1)} (${e.ratingCount})` : '⭐ New'} ·{' '}
                  {e.completedJobs} jobs
                </Txt>
              </View>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: e.badge === 'available' ? colors.successSoft : colors.infoSoft },
                ]}
              >
                <Txt
                  variant="caption"
                  color={e.badge === 'available' ? colors.success : colors.blue}
                  style={{ fontWeight: '700' }}
                >
                  {e.badge === 'available' ? 'Available now' : 'Responded'}
                </Txt>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Txt variant="caption" color={colors.textMuted}>
                📍 {formatDistance(e.distanceKm)} · ~{e.etaMinutes} min
              </Txt>
              <Txt variant="caption" color={colors.text} style={{ fontWeight: '700' }}>
                {e.hourlyCents != null ? `${formatMoney(e.hourlyCents)}/hr` : 'Rate on request'}
              </Txt>
            </View>

            <Button
              title={isSelected ? 'Waiting for them to accept…' : 'Choose this tradie'}
              kind={isSelected ? 'secondary' : 'primary'}
              small
              disabled={isSelected || busyId != null}
              loading={busyId === e.id}
              onPress={() => choose(e.id)}
            />
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, borderWidth: 1, borderColor: colors.line },
  cardSelected: { borderColor: colors.blue, borderWidth: 1.5, backgroundColor: colors.infoSoft },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.navyCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
