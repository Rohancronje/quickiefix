import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { Button, Card, EmptyState, Txt } from '../../../src/components/ui';
import { tradeMeta, tradieStatusMeta } from '../../../src/constants';
import { useTradie } from '../../../src/context/AuthContext';
import { useJobOffers, useTradieActiveJob, useTradieHistory } from '../../../src/hooks/useData';
import { formatDistance } from '../../../src/lib/geo';
import { getCurrentLocation } from '../../../src/lib/location';
import { backend, JobOffer } from '../../../src/services';
import { colors, font, radius, spacing } from '../../../src/theme';

export default function TradieDashboard() {
  const tradie = useTradie();
  const router = useRouter();
  const offers = useJobOffers(tradie.id);
  const activeJob = useTradieActiveJob(tradie.id);
  const history = useTradieHistory(tradie.id);

  const [locating, setLocating] = useState(false);
  const isApproved = tradie.approval === 'approved';
  const isAvailable = tradie.status === 'available';
  const onActiveJob = tradie.status === 'job_accepted' || tradie.status === 'on_site';
  const statusMeta = tradieStatusMeta[tradie.status];

  const toggleAvailability = async (value: boolean) => {
    if (value) {
      // Capture location so the dispatch radius works; don't block if it fails.
      setLocating(true);
      try {
        const loc = await getCurrentLocation();
        await backend.setTradieLocation(tradie.id, { latitude: loc.latitude, longitude: loc.longitude });
      } catch {
        /* location optional */
      }
      setLocating(false);
      await backend.setTradieStatus(tradie.id, 'available');
    } else {
      await backend.setTradieStatus(tradie.id, 'offline');
    }
  };

  const accept = async (offer: JobOffer) => {
    try {
      await backend.acceptJob(offer.job.id, tradie.id);
      router.push({ pathname: '/job/[id]', params: { id: offer.job.id } });
    } catch (e) {
      Alert.alert('Could not accept', (e as Error).message);
    }
  };

  const decline = (offer: JobOffer) => backend.declineJob(offer.job.id, tradie.id);

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Txt variant="caption" color={colors.textMuted}>
            {tradie.businessName}
          </Txt>
          <Txt variant="title">Kia ora, {tradie.firstName}</Txt>
        </View>
        <View style={[styles.statusChip, { backgroundColor: statusMeta.soft }]}>
          <View style={[styles.statusDot, { backgroundColor: statusMeta.color }]} />
          <Txt variant="caption" color={statusMeta.color} style={{ fontWeight: '700' }}>
            {statusMeta.label}
          </Txt>
        </View>
      </View>

      {/* Pending approval */}
      {!isApproved && (
        <Card style={styles.pending}>
          <Txt variant="heading" color={colors.amberDark}>
            ⏳ Account pending approval
          </Txt>
          <Txt variant="caption" color={colors.textMuted}>
            An admin needs to verify your licence and qualifications before you can receive jobs.
          </Txt>
          <Button
            title="Approve now (demo)"
            small
            kind="secondary"
            onPress={() => backend.setApproval(tradie.id, 'approved')}
          />
        </Card>
      )}

      {/* Availability toggle */}
      {isApproved && !onActiveJob && (
        <Card style={styles.availCard}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="heading">{isAvailable ? 'You’re online' : 'You’re offline'}</Txt>
            <Txt variant="caption" color={colors.textMuted}>
              {locating
                ? 'Getting your location…'
                : isAvailable
                ? 'Receiving nearby job requests.'
                : 'Go online to receive jobs.'}
            </Txt>
          </View>
          <Switch
            value={isAvailable}
            onValueChange={toggleAvailability}
            trackColor={{ true: colors.success, false: colors.line }}
            thumbColor={colors.white}
          />
        </Card>
      )}

      {/* Active job */}
      {activeJob && (
        <Pressable onPress={() => router.push({ pathname: '/job/[id]', params: { id: activeJob.id } })}>
          <Card style={styles.activeCard}>
            <View style={styles.activeTop}>
              <Txt variant="label" color={colors.white}>
                🔧 Active job
              </Txt>
              <Txt variant="caption" color={colors.amber} style={{ fontWeight: '700' }}>
                {tradieStatusMeta[tradie.status].label}
              </Txt>
            </View>
            <Txt variant="heading" color={colors.white}>
              {tradeMeta(activeJob.trade).label} · {activeJob.customerName}
            </Txt>
            <Txt variant="caption" color={colors.onNavyMuted} numberOfLines={1}>
              📍 {activeJob.location.address}
            </Txt>
            <Txt variant="caption" color={colors.amber} style={{ marginTop: 4, fontWeight: '700' }}>
              Tap to manage →
            </Txt>
          </Card>
        </Pressable>
      )}

      {/* Offers */}
      {isApproved && !onActiveJob && (
        <View style={{ gap: spacing.sm }}>
          <View style={styles.offersHeader}>
            <Txt variant="label">Direct requests</Txt>
            {offers.length > 0 && (
              <View style={styles.countPill}>
                <Txt variant="caption" color={colors.white} style={{ fontWeight: '700' }}>
                  {offers.length}
                </Txt>
              </View>
            )}
          </View>

          {/* Directed requests show even when offline — a customer chose you. */}
          {offers.length > 0 ? (
            offers.map((offer) => (
              <OfferCard key={offer.job.id} offer={offer} onAccept={() => accept(offer)} onDecline={() => decline(offer)} />
            ))
          ) : !isAvailable ? (
            <Card>
              <EmptyState
                emoji="🌙"
                title="You’re offline"
                subtitle="Go online so customers can find and request you."
              />
            </Card>
          ) : (
            <Card>
              <EmptyState
                emoji="📭"
                title="No requests right now"
                subtitle="When a customer picks you, their request appears here instantly."
              />
            </Card>
          )}
        </View>
      )}

      {/* Today */}
      <Card>
        <Txt variant="label" style={{ marginBottom: spacing.md }}>
          Your stats
        </Txt>
        <View style={styles.statsRow}>
          <Stat value={`${history.length}`} label="Completed" />
          <View style={styles.statDivider} />
          <Stat value={tradie.ratingAvg ? tradie.ratingAvg.toFixed(1) : '—'} label="Rating" />
          <View style={styles.statDivider} />
          <Stat value={`${tradie.serviceRadiusKm}km`} label="Radius" />
        </View>
      </Card>
    </Screen>
  );
}

function OfferCard({
  offer,
  onAccept,
  onDecline,
}: {
  offer: JobOffer;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const meta = tradeMeta(offer.job.trade);
  return (
    <Card style={styles.offer}>
      <View style={styles.requestedBanner}>
        <Txt variant="caption" color={colors.blue} style={{ fontWeight: '700' }}>
          📨 {offer.job.customerName} requested you
        </Txt>
      </View>
      <View style={styles.offerTop}>
        <View style={styles.offerIcon}>
          <Txt style={{ fontSize: 22 }}>{meta.emoji}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="label">{meta.label}</Txt>
          <Txt variant="caption" color={colors.textMuted}>
            {offer.job.urgency === 'now' ? '⚡ Needed now' : '🗓️ Scheduled'} ·{' '}
            {formatDistance(offer.distanceKm)} away · ~{offer.etaMinutes} min
          </Txt>
        </View>
      </View>
      <Txt variant="body" color={colors.text} numberOfLines={2}>
        {offer.job.description}
      </Txt>
      <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
        📍 {offer.job.location.address}
      </Txt>
      <View style={styles.offerActions}>
        <View style={{ flex: 1 }}>
          <Button title="Decline" kind="ghost" small onPress={onDecline} />
        </View>
        <View style={{ flex: 2 }}>
          <Button title="Accept job" kind="success" small onPress={onAccept} />
        </View>
      </View>
    </Card>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  pending: { backgroundColor: colors.warningSoft, gap: spacing.sm, alignItems: 'flex-start' },
  availCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  activeCard: { backgroundColor: colors.navy, gap: 4 },
  activeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  offersHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  countPill: {
    backgroundColor: colors.danger,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  offer: { gap: spacing.sm, borderWidth: 1, borderColor: colors.line },
  requestedBanner: {
    backgroundColor: colors.infoSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  offerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  offerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: colors.line },
});
