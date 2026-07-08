import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JobTimeline } from '../../../src/components/JobTimeline';
import { MessageThread } from '../../../src/components/MessageThread';
import { StatusPill } from '../../../src/components/JobCard';
import { RatingForm } from '../../../src/components/RatingForm';
import { Screen } from '../../../src/components/Screen';
import { Button, Card, Txt } from '../../../src/components/ui';
import { ON_SITE_RADIUS_KM, tradeMeta } from '../../../src/constants';
import { useTradie } from '../../../src/context/AuthContext';
import { useJob } from '../../../src/hooks/useData';
import { formatDuration } from '../../../src/lib/format';
import { distanceKm, formatDistance } from '../../../src/lib/geo';
import { hasCoords, watchPosition } from '../../../src/lib/location';
import { backend } from '../../../src/services';
import { colors, font, radius, spacing } from '../../../src/theme';
import { Rating } from '../../../src/types';

export default function TradieJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tradie = useTradie();
  const job = useJob(id);
  const [liveDistance, setLiveDistance] = useState<number | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const jobCoords = job && hasCoords(job.location) ? job.location : null;
  const trackingActive = job?.status === 'confirmed' || job?.status === 'travelling';

  // GPS on-site detection: while travelling, watch position and auto-arrive
  // once inside the geofence radius around the property.
  useEffect(() => {
    let cancelled = false;
    if (!job || !trackingActive || !jobCoords) return;

    watchPosition((point) => {
      const d = distanceKm(point, { latitude: jobCoords.latitude, longitude: jobCoords.longitude });
      setLiveDistance(d);
      if (d <= ON_SITE_RADIUS_KM) {
        backend.arriveOnSite(job.id, 'gps');
      }
    })
      .then((stop) => {
        if (cancelled) stop();
        else stopRef.current = stop;
      })
      .catch(() => {
        /* GPS unavailable — manual arrival still works */
      });

    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [job?.id, trackingActive, jobCoords?.latitude, jobCoords?.longitude]);

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
        <Button title="Back to jobs" kind="ghost" onPress={() => router.replace('/dashboard')} />
      </Screen>
    );
  }

  const meta = tradeMeta(job.trade);
  const rateCustomer = async (rating: Rating) => {
    await backend.rateAsTradie(job.id, rating);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/dashboard')} hitSlop={10}>
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
        {/* Customer + location */}
        <Card style={{ gap: spacing.sm }}>
          <Txt variant="label">Customer</Txt>
          <Txt variant="heading">{job.customerName}</Txt>
          <Txt variant="body" color={colors.textMuted}>
            {job.description}
          </Txt>
          <View style={styles.addressRow}>
            <Txt variant="caption" color={colors.textFaint} style={{ flex: 1 }}>
              📍 {job.location.address}
            </Txt>
          </View>
          {job.photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {job.photos.map((uri) => (
                  <Image key={uri} source={{ uri }} style={styles.photo} />
                ))}
              </View>
            </ScrollView>
          )}
        </Card>

        {/* Live GPS proximity while travelling */}
        {trackingActive && jobCoords && (
          <Card style={styles.gpsCard}>
            <Txt variant="label" color={colors.blue}>
              🛰️ Live navigation
            </Txt>
            {liveDistance != null ? (
              <Txt variant="caption" color={colors.textMuted}>
                {formatDistance(liveDistance)} from site. You'll be checked in automatically when you
                arrive (within {Math.round(ON_SITE_RADIUS_KM * 1000)} m).
              </Txt>
            ) : (
              <Txt variant="caption" color={colors.textMuted}>
                Acquiring GPS… you can also start the job manually below.
              </Txt>
            )}
          </Card>
        )}

        {/* Status-driven actions */}
        {job.status === 'accepted' && (
          <Card style={styles.gpsCard}>
            <Txt variant="label" color={colors.blue}>
              ⏳ Waiting for {job.customerName} to confirm
            </Txt>
            <Txt variant="caption" color={colors.textMuted}>
              You've got this job. As soon as the customer confirms you can set off.
              {job.isEmergency ? ' Emergencies confirm automatically within a few minutes.' : ''}
            </Txt>
          </Card>
        )}
        {job.status === 'confirmed' && (
          <View style={{ gap: spacing.md }}>
            <Button title="Start travelling" icon="🚗" kind="secondary" onPress={() => backend.startTravelling(job.id)} />
            <Button title="I've arrived — start job" icon="📍" onPress={() => backend.arriveOnSite(job.id, 'manual')} />
          </View>
        )}
        {job.status === 'travelling' && (
          <Button title="I've arrived — start job" icon="📍" onPress={() => backend.arriveOnSite(job.id, 'manual')} />
        )}
        {job.status === 'on_site' && (
          <Button title="Complete job" icon="✅" kind="success" onPress={() => backend.completeJob(job.id)} />
        )}

        {/* Completed: durations + rate the customer */}
        {job.status === 'completed' && (
          <>
            <Card style={{ gap: spacing.sm }}>
              <Txt variant="label">Job summary</Txt>
              <Row
                label="Total duration"
                value={formatDuration(
                  job.timestamps.completedAt && job.timestamps.acceptedAt
                    ? job.timestamps.completedAt - job.timestamps.acceptedAt
                    : undefined,
                )}
              />
              <Row
                label="Working time on site"
                value={formatDuration(
                  job.timestamps.completedAt && job.timestamps.onSiteAt
                    ? job.timestamps.completedAt - job.timestamps.onSiteAt
                    : undefined,
                )}
              />
            </Card>
            {job.tradieRating ? (
              <Card style={{ alignItems: 'center', gap: spacing.xs }}>
                <Txt style={{ fontSize: 34 }}>✅</Txt>
                <Txt variant="heading">All done!</Txt>
                <Txt variant="caption" color={colors.textMuted}>
                  This job is complete and added to your timesheet.
                </Txt>
              </Card>
            ) : (
              <RatingForm
                title="Rate the customer"
                subtitle="Your feedback stays private and helps other tradies."
                tags={['Good communication', 'Easy access', 'Respectful', 'Clear brief', 'Would work with again']}
                submitLabel="Submit & finish"
                onSubmit={rateCustomer}
              />
            )}
            <Button title="Back to jobs" kind="ghost" onPress={() => router.replace('/dashboard')} />
          </>
        )}

        {/* Messaging (contact-masked) */}
        {['accepted', 'confirmed', 'travelling', 'on_site'].includes(job.status) && (
          <MessageThread
            jobId={job.id}
            from={{ role: 'tradie', id: tradie.id, name: tradie.businessName }}
          />
        )}

        {/* Timeline */}
        <Card>
          <Txt variant="label" style={{ marginBottom: spacing.md }}>
            Progress
          </Txt>
          <JobTimeline job={job} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
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
  addressRow: { flexDirection: 'row', alignItems: 'center' },
  gpsCard: { backgroundColor: colors.infoSoft, gap: spacing.xs, borderWidth: 0 },
  photo: { width: 100, height: 100, borderRadius: radius.md },
});
