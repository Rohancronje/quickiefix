import { appAlert } from '../../../src/components/AppAlert';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { AvailabilityCard } from '../../../src/components/AvailabilityCard';
import { JobCard } from '../../../src/components/JobCard';
import { Button, Card, Txt } from '../../../src/components/ui';
import { formatMoney, GST_ENABLED, monthKey, tradeMeta, tradieStatusMeta } from '../../../src/constants';
import { greeting } from '../../../src/lib/greeting';
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
  const pendingCount = offers.length + chooseFeed.selected.length + chooseFeed.requests.length;
  const activeRequests = myRequests.filter((j) =>
    ['searching', 'accepted', 'confirmed', 'travelling', 'on_site'].includes(j.status),
  );
  const history = useTradieHistory(tradie.id);
  const fees = useTradieFees(tradie.id);

  const [locating, setLocating] = useState(false);
  const isApproved = tradie.approval === 'approved';
  const onActiveJob = tradie.status === 'job_accepted' || tradie.status === 'on_site';
  // Independent tradies need a rate card so customers see pricing on acceptance;
  // company-tagged tradies inherit the company's rates. Prompt until it's set.
  const profileIncomplete = !tradie.companyId && !tradie.rateCard;

  // Keep the dispatch/browse distance anchored to the PHONE, not a stale point:
  // refresh the tradie's location whenever the app opens/foregrounds while
  // they're available (silent best-effort — GPS off changes nothing).
  const lastLocRefresh = useRef(0);
  useEffect(() => {
    const refresh = () => {
      if (tradie.status !== 'available') return;
      if (Date.now() - lastLocRefresh.current < 120_000) return; // at most every 2 min
      lastLocRefresh.current = Date.now();
      getCurrentLocation()
        .then((loc) =>
          backend.setTradieLocation(tradie.id, { latitude: loc.latitude, longitude: loc.longitude }),
        )
        .catch(() => {});
    };
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [tradie.id, tradie.status]);

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

  // ---- Browse & choose ----
  const acceptSelection = async (offer: JobOffer) => {
    try {
      await backend.acceptSelection(offer.job.id, tradie.id);
      router.push({ pathname: '/job/[id]', params: { id: offer.job.id } });
    } catch (e) {
      appAlert('Could not accept', (e as Error).message);
    }
  };
  const declineSelection = (offer: JobOffer) => backend.declineSelection(offer.job.id, tradie.id);
  const expressInterest = async (offer: JobOffer) => {
    try {
      await backend.expressInterest(offer.job.id, tradie.id);
    } catch (e) {
      appAlert('Could not respond', (e as Error).message);
    }
  };
  const dismissRequest = (offer: JobOffer) => backend.declineJob(offer.job.id, tradie.id);

  return (
    <Screen>
      {/* Brand — centred lockup at the very top (per the design reference) */}
      <Image
        source={require('../../../assets/logo.png')}
        style={styles.brand}
        resizeMode="contain"
        accessibilityLabel="QuickieFix"
      />

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
            {tradie.businessName}
          </Txt>
          <Txt variant="title">
            {greeting()}, {tradie.firstName}
          </Txt>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconBtn} onPress={() => router.push('/profile')}>
            <Txt style={{ fontSize: 18 }}>🔔</Txt>
            {pendingCount > 0 && (
              <View style={styles.bellBadge}>
                <Txt style={styles.bellBadgeText}>{pendingCount}</Txt>
              </View>
            )}
          </Pressable>
          <Pressable style={styles.avatar} onPress={() => router.push('/profile')}>
            <Txt style={styles.avatarText}>{tradie.firstName.charAt(0).toUpperCase()}</Txt>
          </Pressable>
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

      {/* Availability — the most important control in the app, right under the greeting */}
      {isApproved && (
        <AvailabilityCard status={tradie.status} locating={locating} onToggle={toggleAvailability} />
      )}

      {/* Operational summary — the numbers a working tradie actually cares about */}
      {isApproved && (
        <>
          <OperationalSummary
            completed={tradie.completedJobs}
            inProgress={activeJob ? 1 : 0}
            rating={tradie.ratingAvg}
            ratingCount={tradie.ratingCount}
            radiusKm={tradie.serviceRadiusKm}
            lastCompletedAt={history[0]?.timestamps.completedAt}
          />
          <PerformanceBanner
            rating={tradie.ratingAvg}
            ratingCount={tradie.ratingCount}
            completed={tradie.completedJobs}
          />
        </>
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
              onView={() => router.push({ pathname: '/job/[id]', params: { id: offer.job.id } })}
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
              onView={() => router.push({ pathname: '/job/[id]', params: { id: offer.job.id } })}
            />
          ))}
        </View>
      )}

      {/* Need help yourself — a tradie can also request a service */}
      <Card style={styles.needHelp}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label" color={colors.white}>
            Need help?
          </Txt>
          <Txt variant="caption" color={colors.onNavyMuted}>
            Request trusted help in minutes — you're the customer this time.
          </Txt>
        </View>
        <Button
          title="Request help"
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

      {/* This month — fee tally (informational; billing happens off-app) */}
      {isApproved && <MoneyPanel fees={fees} creditsRemaining={tradie.freeJobCredits ?? 0} now={now} />}
    </Screen>
  );
}

/** Suburb/city portion of an address — candidates see the area, not the door
 *  number, until a job is theirs (mirrors the job screen). */
function areaOnly(address: string): string {
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(', ') : 'Nearby';
}

/** "🗓️ Tomorrow 8:00 am" line for scheduled jobs on offer cards. */
function ScheduledLine({ ts }: { ts?: number }) {
  if (ts == null) return null;
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <Txt variant="caption" color={colors.blue} style={{ fontWeight: '700' }}>
      🗓️ Wanted: {day}, {time}
    </Txt>
  );
}

/** Browse & choose: the customer picked this tradie — final accept/decline. */
function SelectionCard({
  offer,
  onAccept,
  onDecline,
  onView,
}: {
  offer: JobOffer;
  onAccept: () => void;
  onDecline: () => void;
  onView: () => void;
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
      <ScheduledLine ts={offer.job.scheduledFor} />
      <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
        📍 {areaOnly(offer.job.location.address)} · exact address once it's yours
      </Txt>
      <Button title="View details & photos" kind="secondary" small onPress={onView} />
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
  onView,
}: {
  offer: JobOffer;
  onInterested: () => void;
  onDismiss: () => void;
  onView: () => void;
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
      <ScheduledLine ts={offer.job.scheduledFor} />
      <Txt variant="caption" color={colors.textFaint} numberOfLines={1}>
        📍 {areaOnly(offer.job.location.address)} · exact address once it's yours
      </Txt>
      <Button title="View details & photos" kind="secondary" small onPress={onView} />
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

/** Short, human "when" for the last-completed line. */
function formatWhen(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === now.toDateString()
    ? `today at ${time}`
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** Operational summary — completed / in-progress / rating / radius, at a glance. */
function OperationalSummary({
  completed,
  inProgress,
  rating,
  ratingCount,
  radiusKm,
  lastCompletedAt,
}: {
  completed: number;
  inProgress: number;
  rating: number;
  ratingCount: number;
  radiusKm: number;
  lastCompletedAt?: number;
}) {
  // Narrow phones: 2×2 grid so labels never crush; wider: all four across.
  const { width } = useWindowDimensions();
  const cellWidth = width < 370 ? '50%' : '25%';
  const cells = [
    { label: 'Completed', value: `${completed}` },
    { label: 'In progress', value: `${inProgress}` },
    { label: 'Rating', value: ratingCount > 0 ? `★ ${rating.toFixed(1)}` : '★ New' },
    { label: 'Radius', value: `${radiusKm} km` },
  ];
  return (
    <Card style={styles.summary}>
      <View style={styles.summaryGrid}>
        {cells.map((c) => (
          <View key={c.label} style={[styles.summaryCell, { width: cellWidth }]}>
            <Txt style={styles.summaryValue}>{c.value}</Txt>
            <Txt variant="caption" color={colors.onNavyMuted}>
              {c.label}
            </Txt>
          </View>
        ))}
      </View>
      {lastCompletedAt != null && (
        <Txt variant="caption" color={colors.onNavyMuted} style={styles.summaryFoot}>
          Last completed {formatWhen(lastCompletedAt)}
        </Txt>
      )}
    </Card>
  );
}

/** A little achievement badge — engagement over billing. */
function PerformanceBanner({
  rating,
  ratingCount,
  completed,
}: {
  rating: number;
  ratingCount: number;
  completed: number;
}) {
  let emoji = '🚀';
  let title = 'Ready to earn';
  let sub = 'Accept your first job to start building your reputation.';
  if (ratingCount >= 5 && rating >= 4.8) {
    emoji = '🏆';
    title = 'Top-rated pro';
    sub = `Customers rate you ${rating.toFixed(1)}★ — outstanding.`;
  } else if (completed >= 1) {
    emoji = '⭐';
    title = `${completed} job${completed > 1 ? 's' : ''} completed`;
    sub = 'Great work — stay available to keep the momentum going.';
  }
  return (
    <Card style={styles.perf}>
      <Txt style={{ fontSize: 24 }}>{emoji}</Txt>
      <View style={{ flex: 1 }}>
        <Txt variant="label">{title}</Txt>
        <Txt variant="caption" color={colors.textMuted}>
          {sub}
        </Txt>
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
  // The source PNG has generous whitespace padding, so render a touch larger
  // and pull the margins in for a visually ~32px lockup.
  brand: { alignSelf: 'center', height: 86, width: 254, marginVertical: -16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.amber, fontSize: 18, fontWeight: '800' },
  summary: { backgroundColor: colors.navy, gap: spacing.md },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  summaryCell: { gap: 2, alignItems: 'center' },
  summaryValue: { color: colors.white, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  summaryFoot: { borderTopWidth: 1, borderTopColor: colors.navyLine, paddingTop: spacing.sm },
  perf: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
  activeCard: { backgroundColor: colors.navy, gap: 4 },
  activeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
