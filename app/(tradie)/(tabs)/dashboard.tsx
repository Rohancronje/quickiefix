import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { JobCard } from '../../../src/components/JobCard';
import { Button, Card, EmptyState, Txt } from '../../../src/components/ui';
import { formatMoney, GST_ENABLED, monthKey, tradeMeta, tradieStatusMeta } from '../../../src/constants';
import { useTradie } from '../../../src/context/AuthContext';
import {
  useChooseFeed,
  useCustomerJobs,
  useJobOffers,
  useTradieActiveJob,
  useTradieFees,
  useTradieHistory,
} from '../../../src/hooks/useData';
import { useNow } from '../../../src/hooks/useNow';
import { waveEligible } from '../../../src/lib/dispatch';
import { formatDistance } from '../../../src/lib/geo';
import { getCurrentLocation } from '../../../src/lib/location';
import { backend, JobOffer } from '../../../src/services';
import { FeeLineItem } from '../../../src/types';
import { colors, font, radius, spacing } from '../../../src/theme';

export default function TradieDashboard() {
  const tradie = useTradie();
  const router = useRouter();
  const allOffers = useJobOffers(tradie.id);
  const chooseFeed = useChooseFeed(tradie.id);
  const activeJob = useTradieActiveJob(tradie.id);
  const myRequests = useCustomerJobs(tradie.id); // jobs this tradie booked as a customer
  const now = useNow(5000); // fast tick so offers surface as each wave widens
  // Only show jobs whose current wave includes this tradie (widens over time).
  const offers = allOffers.filter((o) => waveEligible(o.job, tradie.id, now));
  const activeRequests = myRequests.filter((j) =>
    ['searching', 'accepted', 'confirmed', 'travelling', 'on_site'].includes(j.status),
  );
  const history = useTradieHistory(tradie.id);
  const fees = useTradieFees(tradie.id);

  const [locating, setLocating] = useState(false);
  const isApproved = tradie.approval === 'approved';
  const isAvailable = tradie.status === 'available';
  const onActiveJob = tradie.status === 'job_accepted' || tradie.status === 'on_site';
  const statusMeta = tradieStatusMeta[tradie.status];
  // Independent tradies need a rate card so customers see pricing on acceptance;
  // company-tagged tradies inherit the company's rates. Prompt until it's set.
  const profileIncomplete = !tradie.companyId && !tradie.rateCard;

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

  // ---- Browse & choose ----
  const acceptSelection = async (offer: JobOffer) => {
    try {
      await backend.acceptSelection(offer.job.id, tradie.id);
      router.push({ pathname: '/job/[id]', params: { id: offer.job.id } });
    } catch (e) {
      Alert.alert('Could not accept', (e as Error).message);
    }
  };
  const declineSelection = (offer: JobOffer) => backend.declineSelection(offer.job.id, tradie.id);
  const expressInterest = async (offer: JobOffer) => {
    try {
      await backend.expressInterest(offer.job.id, tradie.id);
    } catch (e) {
      Alert.alert('Could not respond', (e as Error).message);
    }
  };
  const dismissRequest = (offer: JobOffer) => backend.declineJob(offer.job.id, tradie.id);

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

      {/* First-run onboarding: finish your profile */}
      {profileIncomplete && (
        <Card style={styles.onboard}>
          <Txt variant="heading" color={colors.white}>
            👋 Welcome, {tradie.firstName} — finish your profile
          </Txt>
          <Txt variant="caption" color={colors.onNavyMuted}>
            Add your rate card so customers see your pricing the moment you accept a job. Takes a minute.
          </Txt>
          <Button
            title="Complete my profile"
            small
            fullWidth={false}
            onPress={() => router.push('/profile')}
          />
        </Card>
      )}

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

      {/* Payment hold — the founder has paused this tradie from dispatch */}
      {tradie.paymentHold && (
        <Card style={styles.pending}>
          <Txt variant="heading" color={colors.danger}>
            ⏸️ Dispatch paused
          </Txt>
          <Txt variant="caption" color={colors.textMuted}>
            Your account is on a payment hold, so you won't receive new jobs. Please settle your
            QuickieFix invoice — dispatch resumes as soon as it's cleared.
          </Txt>
        </Card>
      )}

      {/* This-month fee tally (informational — billing happens off-app) */}
      {isApproved && <MoneyPanel fees={fees} creditsRemaining={tradie.freeJobCredits ?? 0} now={now} />}

      {/* Availability toggle */}
      {isApproved && !onActiveJob && (
        <Card style={styles.availCard}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="heading">
              {isAvailable ? 'You are available to accept jobs' : 'You are not accepting jobs'}
            </Txt>
            <Txt variant="caption" color={colors.textMuted}>
              {locating
                ? 'Getting your location…'
                : isAvailable
                ? 'You’ll be alerted to nearby jobs in real time.'
                : 'Turn on availability to start receiving jobs.'}
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

      {/* Browse & choose: the customer picked YOU — accept to lock it in. */}
      {isApproved && !onActiveJob && chooseFeed.selected.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Txt variant="label">You’ve been selected</Txt>
          {chooseFeed.selected.map((offer) => (
            <SelectionCard
              key={offer.job.id}
              offer={offer}
              onAccept={() => acceptSelection(offer)}
              onDecline={() => declineSelection(offer)}
            />
          ))}
        </View>
      )}

      {/* Browse & choose: opt-in requests for busy tradies. */}
      {isApproved && !onActiveJob && chooseFeed.requests.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Txt variant="label">Customers looking for you</Txt>
          {chooseFeed.requests.map((offer) => (
            <RequestCard
              key={offer.job.id}
              offer={offer}
              onInterested={() => expressInterest(offer)}
              onDismiss={() => dismissRequest(offer)}
            />
          ))}
        </View>
      )}

      {/* Offers */}
      {isApproved && !onActiveJob && (
        <View style={{ gap: spacing.sm }}>
          <View style={styles.offersHeader}>
            <Txt variant="label">Nearby jobs</Txt>
            {offers.length > 0 && (
              <View style={styles.countPill}>
                <Txt variant="caption" color={colors.white} style={{ fontWeight: '700' }}>
                  {offers.length}
                </Txt>
              </View>
            )}
          </View>

          {offers.length > 0 ? (
            offers.map((offer) => (
              <OfferCard key={offer.job.id} offer={offer} onAccept={() => accept(offer)} onDecline={() => decline(offer)} />
            ))
          ) : !isAvailable ? (
            <Card>
              <EmptyState
                emoji="🌙"
                title="You’re not accepting jobs"
                subtitle="Turn on availability to start receiving nearby job alerts."
              />
            </Card>
          ) : (
            <Card>
              <EmptyState
                emoji="📭"
                title="No jobs right now"
                subtitle="When a nearby customer needs your trade, it appears here instantly — be quick, first to accept wins."
              />
            </Card>
          )}
        </View>
      )}

      {/* Need help yourself — a tradie can also request a service */}
      <Card style={styles.needHelp}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label" color={colors.white}>
            Need a hand yourself?
          </Txt>
          <Txt variant="caption" color={colors.onNavyMuted}>
            Book another trade — you're the customer this time.
          </Txt>
        </View>
        <Button
          title="Request"
          small
          fullWidth={false}
          onPress={() => router.push('/new-job')}
        />
      </Card>

      {activeRequests.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Txt variant="label">Your requests</Txt>
          {activeRequests.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              now={now}
              onPress={() => router.push({ pathname: '/track/[id]', params: { id: job.id } })}
            />
          ))}
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
  const emergency = offer.job.isEmergency;
  return (
    <Card style={styles.offer}>
      <View style={[styles.requestedBanner, emergency && { backgroundColor: colors.dangerSoft }]}>
        <Txt variant="caption" color={emergency ? colors.danger : colors.blue} style={{ fontWeight: '700' }}>
          {emergency ? '🚨 Emergency job nearby' : '⚡ New job nearby'}
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

/** Browse & choose: the customer picked this tradie — final accept/decline. */
function SelectionCard({
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
    <Card style={[styles.offer, { borderColor: colors.success, borderWidth: 1.5 }]}>
      <View style={[styles.requestedBanner, { backgroundColor: colors.successSoft }]}>
        <Txt variant="caption" color={colors.success} style={{ fontWeight: '700' }}>
          ⭐ {offer.job.customerName} chose you for this job
        </Txt>
      </View>
      <View style={styles.offerTop}>
        <View style={styles.offerIcon}>
          <Txt style={{ fontSize: 22 }}>{meta.emoji}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="label">{meta.label}</Txt>
          <Txt variant="caption" color={colors.textMuted}>
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
          <Button title="Accept this job" kind="success" small onPress={onAccept} />
        </View>
      </View>
    </Card>
  );
}

/** Browse & choose: a busy tradie is asked whether they want a nearby job. */
function RequestCard({
  offer,
  onInterested,
  onDismiss,
}: {
  offer: JobOffer;
  onInterested: () => void;
  onDismiss: () => void;
}) {
  const meta = tradeMeta(offer.job.trade);
  return (
    <Card style={styles.offer}>
      <View style={[styles.requestedBanner, { backgroundColor: colors.infoSoft }]}>
        <Txt variant="caption" color={colors.blue} style={{ fontWeight: '700' }}>
          👀 A customer nearby is choosing a tradie
        </Txt>
      </View>
      <View style={styles.offerTop}>
        <View style={styles.offerIcon}>
          <Txt style={{ fontSize: 22 }}>{meta.emoji}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="label">{meta.label}</Txt>
          <Txt variant="caption" color={colors.textMuted}>
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
          <Button title="Not now" kind="ghost" small onPress={onDismiss} />
        </View>
        <View style={{ flex: 2 }}>
          <Button title="I’m interested" kind="primary" small onPress={onInterested} />
        </View>
      </View>
    </Card>
  );
}

function MoneyPanel({
  fees,
  creditsRemaining,
  now,
}: {
  fees: FeeLineItem[];
  creditsRemaining: number;
  now: number;
}) {
  const mk = monthKey(now);
  const thisMonth = fees.filter((f) => f.monthKey === mk);
  const completed = thisMonth.length;
  const waived = thisMonth.filter((f) => f.status === 'waived_credit').length;
  const billable = thisMonth.filter((f) => f.status !== 'waived_credit');
  const feeTotal = billable.reduce((s, f) => s + f.amountCents + f.gstCents, 0);

  return (
    <Card style={styles.money}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt variant="label" color={colors.white}>
          💳 This month
        </Txt>
        <Txt variant="caption" color={colors.amber} style={{ fontWeight: '700' }}>
          {creditsRemaining} free {creditsRemaining === 1 ? 'credit' : 'credits'} left
        </Txt>
      </View>
      <Txt variant="heading" color={colors.white}>
        {formatMoney(feeTotal)}
        {GST_ENABLED ? <Txt variant="caption" color={colors.onNavyMuted}> incl. GST</Txt> : null}
      </Txt>
      <Txt variant="caption" color={colors.onNavyMuted}>
        {completed} completed · {waived} free · {billable.length} billable ({formatMoney(feeTotal)}).
        {' '}Invoiced on the 1st — no in-app payment.
      </Txt>
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
  needHelp: {
    backgroundColor: colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  money: { backgroundColor: colors.navy, gap: 4 },
  onboard: { backgroundColor: colors.navy, gap: spacing.sm, alignItems: 'flex-start' },
});
