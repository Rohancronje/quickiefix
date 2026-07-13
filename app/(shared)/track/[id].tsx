import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChooseTradieList } from '../../../src/components/ChooseTradieList';
import { JobMap } from '../../../src/components/JobMap';
import { JobTimeline } from '../../../src/components/JobTimeline';
import { MessageThread } from '../../../src/components/MessageThread';
import { StatusPill } from '../../../src/components/JobCard';
import { RatingForm } from '../../../src/components/RatingForm';
import { Screen } from '../../../src/components/Screen';
import { TradieProfileCard } from '../../../src/components/TradieProfileCard';
import { Button, Card, Field, Txt } from '../../../src/components/ui';
import { formatMoney, tradeMeta } from '../../../src/constants';
import { useJob, useMessages, useUser } from '../../../src/hooks/useData';
import { useNow } from '../../../src/hooks/useNow';
import { hadNoCandidates, isSearchExhausted, searchStageLabel, shouldAutoConfirm } from '../../../src/lib/dispatch';
import { formatDuration } from '../../../src/lib/format';
import { distanceKm, estimateEtaMinutes } from '../../../src/lib/geo';
import { backend } from '../../../src/services';
import { colors, font, radius, spacing } from '../../../src/theme';
import { Job, Rating, Tradie } from '../../../src/types';

export default function TrackJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const job = useJob(id);
  const now = useNow(5000); // fast tick so the wave stage + countdowns feel live
  const tradieUser = useUser(job?.tradieId ?? undefined);
  const tradie = tradieUser?.role === 'tradie' ? (tradieUser as Tradie) : null;

  // Pre-accept Q&A: while searching, tradies can ask questions. The thread only
  // surfaces (at the TOP, above the results) once a question actually arrives.
  const messages = useMessages(job?.id);
  const tradieMsgs = messages.filter((m) => m.from === 'tradie');
  const lastAsk = tradieMsgs.length > 0 ? tradieMsgs[tradieMsgs.length - 1] : null;
  const [viewTradieId, setViewTradieId] = useState<string | null>(null);
  const viewedUser = useUser(viewTradieId ?? undefined);
  const viewedTradie = viewedUser?.role === 'tradie' ? (viewedUser as Tradie) : null;

  // Client-side safety net for the wave clock (the scheduled function is the
  // authority, but this keeps the flow correct even before it runs): once every
  // wave is exhausted flip to no_tradie_found; auto-confirm emergencies.
  const firedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!job) return;
    // Auto-dispatch only: browse-and-choose has no wave clock — the customer
    // drives it, so we never auto-flip it to no_tradie_found.
    if (
      job.status === 'searching' &&
      job.assignmentMode !== 'choose' &&
      isSearchExhausted(job, now) &&
      firedRef.current !== job.id + ':nt'
    ) {
      firedRef.current = job.id + ':nt';
      backend.markNoTradieFound(job.id);
    }
    if (shouldAutoConfirm(job, now) && firedRef.current !== job.id + ':ac') {
      firedRef.current = job.id + ':ac';
      backend.confirmJob(job.id);
    }
  }, [job?.id, job?.status, now]);

  if (job === undefined) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.amber} size="large" />
      </SafeAreaView>
    );
  }
  if (job === null) {
    return (
      <Screen>
        <Txt variant="title">Job not found</Txt>
        <Button title="Go back" kind="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const meta = tradeMeta(job.trade);
  const searching = job.status === 'searching';
  const awaitingConfirm = job.status === 'accepted'; // a tradie accepted; customer must confirm
  const noneFound = job.status === 'no_tradie_found';

  const cancel = () =>
    Alert.alert('Cancel this job?', 'The tradie will be notified.', [
      { text: 'Keep job', style: 'cancel' },
      {
        text: 'Cancel job',
        style: 'destructive',
        onPress: () => backend.cancelJob(job.id, 'customer'),
      },
    ]);

  const confirm = async () => {
    await backend.confirmJob(job.id);
  };

  const submitRating = async (rating: Rating) => {
    await backend.rateAsCustomer(job.id, rating);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Txt style={styles.back}>‹</Txt>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Txt variant="heading">
            {meta.emoji} {meta.label}
          </Txt>
        </View>
        {['searching', 'accepted', 'confirmed', 'travelling', 'on_site'].includes(job.status) && (
          <Pressable
            onPress={() => router.push({ pathname: '/messages/[id]', params: { id: job.id } })}
            hitSlop={10}
            accessibilityLabel="Open job messages"
          >
            <Txt style={{ fontSize: 24 }}>💬</Txt>
          </Pressable>
        )}
        <StatusPill status={job.status} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {/* Pre-accept Q&A — surfaces at the top ONLY once a tradie asks. */}
        {searching && lastAsk && (
          <View style={{ gap: spacing.md }}>
            <Card style={styles.askBanner}>
              <Txt variant="label" color={colors.navy}>
                💬 {lastAsk.senderName} asked you a question
              </Txt>
              <Txt variant="caption" color={colors.navy} style={{ opacity: 0.75 }}>
                Answer below — quick replies help you get the right tradie faster.
              </Txt>
              <View style={styles.askActions}>
                <View style={{ flex: 1 }}>
                  <Button
                    title={viewTradieId ? '← Back to results' : 'View tradie'}
                    kind="secondary"
                    small
                    onPress={() => setViewTradieId(viewTradieId ? null : lastAsk.senderId)}
                  />
                </View>
                {viewTradieId != null && (
                  <View style={{ flex: 1 }}>
                    <Button title="Answer" small onPress={() => setViewTradieId(null)} />
                  </View>
                )}
              </View>
            </Card>

            {viewedTradie ? (
              <TradieProfileCard tradie={viewedTradie} />
            ) : (
              <MessageThread
                jobId={job.id}
                from={{ role: 'customer', id: job.customerId, name: job.customerName }}
              />
            )}
          </View>
        )}

        {/* Browse & choose: the customer picks their own tradie */}
        {searching && job.assignmentMode === 'choose' && (
          <View style={{ gap: spacing.md }}>
            <Card style={styles.searchHero}>
              <Txt variant="heading" color={colors.white} style={{ textAlign: 'center' }}>
                👀 Choose your tradie
              </Txt>
              <Txt variant="caption" color={colors.onNavyMuted} style={{ textAlign: 'center' }}>
                {job.selectedTradieId
                  ? 'Waiting for your pick to accept. You can choose someone else below if you like.'
                  : 'Pick from available pros nearby — compare rate, rating and distance. Busy tradies have been asked too, and will appear if they say yes.'}
              </Txt>
            </Card>
            <ChooseTradieList job={job} />
          </View>
        )}

        {/* Auto-dispatch search in progress */}
        {searching && job.assignmentMode !== 'choose' && (
          <Card style={styles.searchHero}>
            <ActivityIndicator color={colors.amber} size="large" />
            <Txt variant="heading" color={colors.white} style={{ textAlign: 'center' }}>
              {job.isEmergency ? '🚨 Finding you help now' : 'Finding you a tradie'}
            </Txt>
            <Txt variant="caption" color={colors.onNavyMuted} style={{ textAlign: 'center' }}>
              {searchStageLabel(job, now)} We alert the closest verified pros and widen the
              search until one accepts — usually within a few minutes.
            </Txt>
          </Card>
        )}

        {/* No tradie found */}
        {noneFound && (
          <Card style={[styles.searchHero, { backgroundColor: colors.navyCard }]}>
            <Txt style={{ fontSize: 34 }}>😕</Txt>
            <Txt variant="heading" color={colors.white} style={{ textAlign: 'center' }}>
              {hadNoCandidates(job) ? 'No tradies available' : 'No tradie free right now'}
            </Txt>
            <Txt variant="caption" color={colors.onNavyMuted} style={{ textAlign: 'center' }}>
              {hadNoCandidates(job)
                ? 'There are no tradies available in your area at this time. Please try again shortly.'
                : "We couldn't reach an available pro for this one. Our team has been alerted and will try to line someone up — you can also try again shortly."}
            </Txt>
            <Button title="Try again" onPress={() => router.replace('/new-job')} />
          </Card>
        )}

        {/* A tradie accepted — customer confirms them */}
        {awaitingConfirm && tradie && (
          <View style={{ gap: spacing.sm }}>
            <Card style={{ gap: spacing.sm, borderColor: colors.blue, borderWidth: 1 }}>
              <Txt variant="label" color={colors.blue}>
                ✅ {tradie.businessName} accepted your job
              </Txt>
              <Txt variant="caption" color={colors.textMuted}>
                Confirm to lock them in and let them head your way.
                {job.isEmergency ? ' As an emergency, this confirms automatically in a few minutes.' : ''}
              </Txt>
              {job.rateSnapshot && <RateSnapshotView job={job} />}
              <Button title="Confirm this tradie" icon="👍" onPress={confirm} />
            </Card>
            <TradieProfileCard tradie={tradie} />
          </View>
        )}

        {/* Confirmed / en route / on site — assigned tradie profile */}
        {tradie &&
          (job.status === 'confirmed' || job.status === 'travelling' || job.status === 'on_site') && (
            <View style={{ gap: spacing.sm }}>
              {job.status === 'confirmed' && (
                <View style={styles.etaBanner}>
                  <Txt variant="label" color={colors.blue}>
                    ✅ Confirmed · {tradie.businessName} is getting ready to head over.
                  </Txt>
                </View>
              )}
              {/* Rates were locked in at acceptance — show them up front. */}
              {job.status === 'confirmed' && job.rateSnapshot && <RateSnapshotView job={job} />}
              {job.status === 'travelling' &&
                (job.tradieLocation || tradie.baseLocation) &&
                job.location.latitude != null && <EtaBanner tradie={tradie} job={job} />}
              {job.status === 'on_site' && (
                <View style={[styles.etaBanner, { backgroundColor: colors.successSoft }]}>
                  <Txt variant="label" color={colors.success}>
                    🛠️ Your tradie is on site and working on the job.
                  </Txt>
                </View>
              )}
              <TradieProfileCard tradie={tradie} />
            </View>
          )}

        {/* Completed summary + rating */}
        {job.status === 'completed' && (
          <>
            {tradie && <TradieProfileCard tradie={tradie} />}
            <Card style={{ gap: spacing.sm }}>
              <Txt variant="label">Job summary</Txt>
              {job.completionCode && (
                <View style={styles.codeBox}>
                  <Txt variant="caption" color={colors.textMuted}>
                    Completion confirmation code
                  </Txt>
                  <Txt variant="heading">{job.completionCode}</Txt>
                  <Txt variant="caption" color={colors.textFaint}>
                    Emailed to you as your completion record — quote it on any invoice query.
                  </Txt>
                </View>
              )}
              <SummaryRow
                label="Total time"
                value={formatDuration(
                  job.timestamps.completedAt && job.timestamps.acceptedAt
                    ? job.timestamps.completedAt - job.timestamps.acceptedAt
                    : undefined,
                )}
              />
              <SummaryRow
                label="Time on site"
                value={formatDuration(
                  job.timestamps.completedAt && job.timestamps.onSiteAt
                    ? job.timestamps.completedAt - job.timestamps.onSiteAt
                    : undefined,
                )}
              />
            </Card>
            {job.customerRating ? (
              <Card style={{ alignItems: 'center', gap: spacing.xs }}>
                <Txt style={{ fontSize: 36 }}>🌟</Txt>
                <Txt variant="heading">Thanks for your rating!</Txt>
                <Txt variant="caption" color={colors.textMuted}>
                  You rated {job.customerRating.stars}/5.
                </Txt>
              </Card>
            ) : (
              <RatingForm
                title="How was your experience?"
                subtitle={`Rate ${job.tradieName ?? 'your tradie'}`}
                tags={['Professional', 'Friendly', 'On time', 'Excellent workmanship', 'Would recommend']}
                onSubmit={submitRating}
              />
            )}
            <ReportProblem job={job} />
          </>
        )}

        {/* Cancelled */}
        {job.status === 'cancelled' && (
          <Card style={{ alignItems: 'center', gap: spacing.xs }}>
            <Txt style={{ fontSize: 36 }}>🚫</Txt>
            <Txt variant="heading">Job cancelled</Txt>
          </Card>
        )}

        {/* Messaging with the ASSIGNED tradie (pre-accept Q&A renders at the
            top of the searching state instead). */}
        {['accepted', 'confirmed', 'travelling', 'on_site'].includes(job.status) && (
          <MessageThread
            jobId={job.id}
            from={{ role: 'customer', id: job.customerId, name: job.customerName }}
          />
        )}

        {/* Timeline */}
        {job.status !== 'searching' && job.status !== 'no_tradie_found' && (
          <Card>
            <Txt variant="label" style={{ marginBottom: spacing.md }}>
              Progress
            </Txt>
            <JobTimeline job={job} />
          </Card>
        )}

        {/* Job location preview (renders only on builds that include maps).
            While the tradie is en route, their live phone position appears as
            a second (amber) marker moving toward the property. */}
        {['confirmed', 'travelling', 'on_site'].includes(job.status) && (
          <JobMap
            location={job.location}
            tradie={job.status === 'travelling' ? job.tradieLocation ?? null : null}
          />
        )}

        {/* Request details */}
        <Card style={{ gap: spacing.sm }}>
          <Txt variant="label">Your request</Txt>
          <Txt variant="body" color={colors.textMuted}>
            {job.description}
          </Txt>
          <Txt variant="caption" color={colors.textFaint}>
            📍 {job.location.address}
          </Txt>
          {job.photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.xs }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {job.photos.map((uri) => (
                  <Image key={uri} source={{ uri }} style={styles.photo} />
                ))}
              </View>
            </ScrollView>
          )}
        </Card>

        {/* Cancel action */}
        {['searching', 'accepted', 'confirmed', 'travelling'].includes(job.status) && (
          <Button title="Cancel job" kind="ghost" onPress={cancel} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EtaBanner({ tradie, job }: { tradie: Tradie; job: Job }) {
  // Prefer the tradie's LIVE phone position (published while en route);
  // fall back to their base location only when no live fix has arrived yet.
  const from = job.tradieLocation ?? tradie.baseLocation;
  const km =
    from && job.location.latitude != null && job.location.longitude != null
      ? distanceKm(from, { latitude: job.location.latitude, longitude: job.location.longitude })
      : null;
  const live = !!job.tradieLocation;
  return (
    <View style={styles.etaBanner}>
      <Txt variant="label" color={colors.blue}>
        🚗 {tradie.businessName} is on the way
      </Txt>
      {km != null && (
        <Txt variant="caption" color={colors.textMuted}>
          {live ? '📍 Live · ' : ''}
          {km < 10 ? km.toFixed(1) : Math.round(km)} km away · arriving in about{' '}
          {estimateEtaMinutes(km)} min
        </Txt>
      )}
    </View>
  );
}

function ReportProblem({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [detail, setDetail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return (
      <Card style={{ alignItems: 'center', gap: spacing.xs }}>
        <Txt style={{ fontSize: 30 }}>📩</Txt>
        <Txt variant="label">Complaint submitted</Txt>
        <Txt variant="caption" color={colors.textMuted} style={{ textAlign: 'center' }}>
          Our team will review it and be in touch.
        </Txt>
      </Card>
    );
  }

  if (!open) {
    return <Button title="Report a problem" kind="ghost" onPress={() => setOpen(true)} />;
  }

  const submit = async () => {
    if (!subject.trim()) return;
    setBusy(true);
    await backend.fileComplaint(job, subject, detail);
    setBusy(false);
    setSent(true);
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <Txt variant="label">Report a problem</Txt>
      <Field
        label="Subject"
        placeholder="e.g. Tradie didn't finish the job"
        value={subject}
        onChangeText={setSubject}
      />
      <Field
        placeholder="Tell us what happened (optional)"
        value={detail}
        onChangeText={setDetail}
        multiline
        style={{ height: 90, textAlignVertical: 'top' }}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" kind="ghost" small onPress={() => setOpen(false)} />
        </View>
        <View style={{ flex: 2 }}>
          <Button title="Submit complaint" kind="danger" small disabled={!subject.trim()} loading={busy} onPress={submit} />
        </View>
      </View>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Txt variant="caption" color={colors.textMuted}>
        {label}
      </Txt>
      <Txt variant="label">{value}</Txt>
    </View>
  );
}

/** The rate card in force at acceptance — the customer's price expectation. */
function RateSnapshotView({ job }: { job: Job }) {
  const rc = job.rateSnapshot?.rateCard;
  if (!rc) return null;
  return (
    <View style={styles.rateBox}>
      <Txt variant="caption" color={colors.textMuted} style={{ marginBottom: 4 }}>
        💷 Rates{job.rateSnapshot?.companyName ? ` · ${job.rateSnapshot.companyName}` : ''}
      </Txt>
      <SummaryRow label="Hourly rate" value={formatMoney(rc.hourlyRateCents)} />
      {rc.calloutFeeCents != null && (
        <SummaryRow label="Call-out fee" value={formatMoney(rc.calloutFeeCents)} />
      )}
      {rc.afterHoursCalloutFeeCents != null && (
        <SummaryRow label="After-hours call-out" value={formatMoney(rc.afterHoursCalloutFeeCents)} />
      )}
      <Txt variant="caption" color={colors.textFaint} style={{ marginTop: 4 }}>
        The tradie invoices you directly at these rates.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  back: { fontSize: 34, color: colors.text, lineHeight: 34 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  searchHero: { backgroundColor: colors.navy, alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  etaBanner: {
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  photo: { width: 100, height: 100, borderRadius: radius.md },
  rateBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  codeBox: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  askBanner: { backgroundColor: colors.amber, gap: spacing.xs },
  askActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
});
