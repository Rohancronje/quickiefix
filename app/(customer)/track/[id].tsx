import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JobTimeline } from '../../../src/components/JobTimeline';
import { StatusPill } from '../../../src/components/JobCard';
import { RatingForm } from '../../../src/components/RatingForm';
import { Screen } from '../../../src/components/Screen';
import { TradieProfileCard } from '../../../src/components/TradieProfileCard';
import { Button, Card, Txt } from '../../../src/components/ui';
import { tradeMeta } from '../../../src/constants';
import { useJob, useUser } from '../../../src/hooks/useData';
import { formatDuration } from '../../../src/lib/format';
import { estimateEtaMinutes } from '../../../src/lib/geo';
import { backend } from '../../../src/services';
import { colors, font, radius, spacing } from '../../../src/theme';
import { Rating, Tradie } from '../../../src/types';

export default function TrackJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const job = useJob(id);
  const tradieUser = useUser(job?.tradieId);
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
        {/* Searching hero */}
        {job.status === 'searching' && (
          <Card style={styles.searchHero}>
            <ActivityIndicator color={colors.amber} size="large" />
            <Txt variant="heading" color={colors.white} style={{ textAlign: 'center' }}>
              Finding your tradie…
            </Txt>
            <Txt variant="caption" color={colors.onNavyMuted} style={{ textAlign: 'center' }}>
              We're notifying nearby verified {meta.label.toLowerCase()}s. Hang tight — this
              usually only takes a moment.
            </Txt>
          </Card>
        )}

        {/* Assigned tradie */}
        {tradie && job.status !== 'completed' && job.status !== 'cancelled' && (
          <View style={{ gap: spacing.sm }}>
            {job.status !== 'on_site' && tradie.baseLocation && job.location.latitude != null && (
              <EtaBanner tradie={tradie} job={job} />
            )}
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
