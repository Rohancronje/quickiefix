import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JobTimeline } from '../../../src/components/JobTimeline';
import { StatusPill } from '../../../src/components/JobCard';
import { RatingForm } from '../../../src/components/RatingForm';
import { Screen } from '../../../src/components/Screen';
import { TradieProfileCard } from '../../../src/components/TradieProfileCard';
import { Button, Card, Field, Txt } from '../../../src/components/ui';
import { tradeMeta } from '../../../src/constants';
import { useJob, useUser } from '../../../src/hooks/useData';
import { formatDuration } from '../../../src/lib/format';
import { estimateEtaMinutes } from '../../../src/lib/geo';
import { backend } from '../../../src/services';
import { colors, font, radius, spacing } from '../../../src/theme';
import { Job, Rating, Tradie } from '../../../src/types';

export default function TrackJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const job = useJob(id);
  // While waiting we show the tradie the customer chose (requestedTradieId);
  // once accepted it's the same tradie under tradieId.
  const tradieUser = useUser(job?.tradieId ?? job?.requestedTradieId ?? undefined);
  const tradie = tradieUser?.role === 'tradie' ? (tradieUser as Tradie) : null;

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
  const declined =
    job.status === 'searching' &&
    !!job.requestedTradieId &&
    job.declinedBy.includes(job.requestedTradieId);
  const waiting = job.status === 'searching' && !declined;

  const cancel = () =>
    Alert.alert('Cancel this job?', 'The tradie will be notified.', [
      { text: 'Keep job', style: 'cancel' },
      {
        text: 'Cancel job',
        style: 'destructive',
        onPress: () => backend.cancelJob(job.id, 'customer'),
      },
    ]);

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
        <StatusPill status={job.status} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Waiting on the chosen tradie */}
        {waiting && (
          <Card style={styles.searchHero}>
            <ActivityIndicator color={colors.amber} size="large" />
            <Txt variant="heading" color={colors.white} style={{ textAlign: 'center' }}>
              Request sent!
            </Txt>
            <Txt variant="caption" color={colors.onNavyMuted} style={{ textAlign: 'center' }}>
              Please be patient while {tradie?.businessName ?? 'your tradie'} reviews your
              request. We'll let you know the moment they accept.
            </Txt>
          </Card>
        )}

        {/* Chosen tradie declined — let the customer pick another */}
        {declined && (
          <Card style={[styles.searchHero, { backgroundColor: colors.navyCard }]}>
            <Txt style={{ fontSize: 34 }}>😕</Txt>
            <Txt variant="heading" color={colors.white} style={{ textAlign: 'center' }}>
              {tradie?.businessName ?? 'That tradie'} can't take this right now
            </Txt>
            <Txt variant="caption" color={colors.onNavyMuted} style={{ textAlign: 'center' }}>
              No worries — choose another available tradie for the same job.
            </Txt>
            <Button
              title="Choose another tradie"
              onPress={() => router.push({ pathname: '/reassign/[id]', params: { id: job.id } })}
            />
          </Card>
        )}

        {/* Assigned / requested tradie profile */}
        {tradie && job.status !== 'completed' && job.status !== 'cancelled' && !declined && (
          <View style={{ gap: spacing.sm }}>
            {waiting && (
              <View style={styles.etaBanner}>
                <Txt variant="label" color={colors.blue}>
                  📨 Requested · {tradie.businessName}
                </Txt>
              </View>
            )}
            {(job.status === 'accepted' || job.status === 'travelling') &&
              tradie.baseLocation &&
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

        {/* Timeline */}
        {job.status !== 'searching' && (
          <Card>
            <Txt variant="label" style={{ marginBottom: spacing.md }}>
              Progress
            </Txt>
            <JobTimeline job={job} />
          </Card>
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
        {(job.status === 'searching' || job.status === 'accepted' || job.status === 'travelling') && (
          <Button title="Cancel job" kind="ghost" onPress={cancel} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EtaBanner({ tradie, job }: { tradie: Tradie; job: { location: { latitude?: number; longitude?: number } } }) {
  const eta = tradie.baseLocation && job.location.latitude != null && job.location.longitude != null
    ? estimateEtaMinutes(
        Math.hypot(
          (tradie.baseLocation.latitude - job.location.latitude) * 111,
          (tradie.baseLocation.longitude - job.location.longitude) * 88,
        ),
      )
    : null;
  return (
    <View style={styles.etaBanner}>
      <Txt variant="label" color={colors.blue}>
        🚗 {tradie.businessName} is on the way
      </Txt>
      {eta != null && (
        <Txt variant="caption" color={colors.textMuted}>
          Estimated arrival in about {eta} min
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
});
