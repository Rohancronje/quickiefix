import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JobMap } from '../../../src/components/JobMap';
import { JobTimeline } from '../../../src/components/JobTimeline';
import { MessageThread } from '../../../src/components/MessageThread';
import { StatusPill } from '../../../src/components/JobCard';
import { RatingForm } from '../../../src/components/RatingForm';
import { Screen } from '../../../src/components/Screen';
import { Button, Card, Field, Txt } from '../../../src/components/ui';
import { ON_SITE_RADIUS_KM, tradeMeta } from '../../../src/constants';
import { useTradie } from '../../../src/context/AuthContext';
import { useJob, useUser } from '../../../src/hooks/useData';
import { formatDuration } from '../../../src/lib/format';
import { distanceKm } from '../../../src/lib/geo';
import { hasCoords, watchPosition } from '../../../src/lib/location';
import { openInMaps } from '../../../src/lib/maps';
import { backend } from '../../../src/services';
import { colors, font, radius, spacing } from '../../../src/theme';
import { Job, Rating } from '../../../src/types';

export default function TradieJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tradie = useTradie();
  const job = useJob(id);
  const stopRef = useRef<(() => void) | null>(null);

  const jobCoords = job && hasCoords(job.location) ? job.location : null;
  const trackingActive = job?.status === 'confirmed' || job?.status === 'travelling';

  // GPS on-site detection: while travelling, watch position and auto-arrive
  // once inside the geofence radius around the property.
  useEffect(() => {
    let cancelled = false;
    if (!job || !trackingActive || !jobCoords) return;

    // Silent geofence: auto check-in when the tradie arrives on site. The
    // actual turn-by-turn navigation happens in the phone's own maps app.
    watchPosition((point) => {
      const d = distanceKm(point, { latitude: jobCoords.latitude, longitude: jobCoords.longitude });
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

  // Pre-accept: this screen doubles as the offer detail (via "Ask a question").
  const isOpenOffer = job.status === 'searching';
  const isMine = job.tradieId === tradie.id;
  const isChoose = job.assignmentMode === 'choose';
  const chosenMe = isChoose && job.selectedTradieId === tradie.id;
  const alreadyInterested = (job.interestedTradies ?? []).some((t) => t.tradieId === tradie.id);
  const acceptJob = async () => {
    try {
      if (chosenMe) {
        // The customer already picked this tradie — accepting locks the job in
        // directly (no redundant customer-confirm step).
        await backend.acceptSelection(job.id, tradie.id);
      } else {
        await backend.acceptJob(job.id, tradie.id);
      }
    } catch (e) {
      Alert.alert('Could not accept', (e as Error).message);
    }
  };
  const declineJob = () => {
    if (chosenMe) backend.declineSelection(job.id, tradie.id);
    else backend.declineJob(job.id, tradie.id);
    router.replace('/dashboard');
  };
  const expressInterest = async () => {
    try {
      await backend.expressInterest(job.id, tradie.id);
    } catch (e) {
      Alert.alert('Could not respond', (e as Error).message);
    }
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
          {/* Embedded map preview (renders only on builds that include maps). */}
          <JobMap location={job.location} />

          {/* Job location — tap to navigate (Google Maps / Apple Maps / Waze). */}
          <Pressable style={styles.mapsRow} onPress={() => openInMaps(job.location)}>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={colors.textMuted}>
                Job location
              </Txt>
              <Txt variant="label" color={colors.blue}>
                📍 {job.location.address}
              </Txt>
            </View>
            <Txt variant="caption" color={colors.blue} style={{ fontWeight: '800' }}>
              Open in maps ↗
            </Txt>
          </Pressable>
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

        {/* Pre-accept: open offer — behaviour depends on the matching mode. */}
        {isOpenOffer && chosenMe && (
          <View style={{ gap: spacing.md }}>
            <Card style={[styles.gpsCard, { backgroundColor: colors.successSoft }]}>
              <Txt variant="label" color={colors.success}>
                ⭐ {job.customerName} chose you for this job
              </Txt>
              <Txt variant="caption" color={colors.textMuted}>
                Accepting locks it in immediately — no further confirmation needed.
              </Txt>
            </Card>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Button title="Decline" kind="ghost" small onPress={declineJob} />
              </View>
              <View style={{ flex: 2 }}>
                <Button title="Accept — lock it in" kind="success" onPress={acceptJob} />
              </View>
            </View>
          </View>
        )}
        {isOpenOffer && isChoose && !chosenMe && (
          <View style={{ gap: spacing.md }}>
            <Card style={styles.gpsCard}>
              <Txt variant="label" color={colors.blue}>
                👀 The customer is choosing a tradie
              </Txt>
              <Txt variant="caption" color={colors.textMuted}>
                {alreadyInterested
                  ? "You're on their list — answer any questions below to stand out."
                  : 'Put yourself on their list, and answer any questions below to stand out.'}
              </Txt>
            </Card>
            {!alreadyInterested && (
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Button title="Not now" kind="ghost" small onPress={declineJob} />
                </View>
                <View style={{ flex: 2 }}>
                  <Button title="I'm interested" onPress={expressInterest} />
                </View>
              </View>
            )}
          </View>
        )}
        {isOpenOffer && !isChoose && (
          <View style={{ gap: spacing.md }}>
            <Card style={styles.gpsCard}>
              <Txt variant="label" color={colors.blue}>
                ⚡ This job is still open
              </Txt>
              <Txt variant="caption" color={colors.textMuted}>
                Ask the customer a question below, or accept it — first to accept wins.
              </Txt>
            </Card>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Button title="Decline" kind="ghost" small onPress={declineJob} />
              </View>
              <View style={{ flex: 2 }}>
                <Button title="Accept job" kind="success" onPress={acceptJob} />
              </View>
            </View>
          </View>
        )}

        {/* Taken by someone else while you were reading */}
        {!isOpenOffer && !isMine && job.status !== 'completed' && job.status !== 'cancelled' && (
          <Card style={styles.gpsCard}>
            <Txt variant="label" color={colors.textMuted}>
              This job has been taken by another tradie.
            </Txt>
          </Card>
        )}

        {/* Status-driven actions */}
        {job.status === 'accepted' && isMine && (
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
        {job.status === 'confirmed' && isMine && (
          <View style={{ gap: spacing.md }}>
            <Button title="Start travelling" icon="🚗" kind="secondary" onPress={() => backend.startTravelling(job.id)} />
            <Button title="I've arrived — start job" icon="📍" onPress={() => backend.arriveOnSite(job.id, 'manual')} />
          </View>
        )}
        {job.status === 'travelling' && isMine && (
          <Button title="I've arrived — start job" icon="📍" onPress={() => backend.arriveOnSite(job.id, 'manual')} />
        )}
        {job.status === 'on_site' && isMine && <CompleteJobSheet job={job} />}

        {/* Completed: durations + rate the customer */}
        {job.status === 'completed' && (
          <>
            <Card style={{ gap: spacing.sm }}>
              <Txt variant="label">Job summary</Txt>
              {job.completionCode && <Row label="Confirmation code" value={job.completionCode} />}
              {job.billing?.contactEmail && (
                <Row label="Invoice contact" value={job.billing.contactEmail} />
              )}
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

        {/* Messaging (contact-masked). Pre-accept, any candidate can ask the
            customer questions about the job; post-accept it's the assigned
            tradie's thread. */}
        {(isOpenOffer ||
          (isMine && ['accepted', 'confirmed', 'travelling', 'on_site'].includes(job.status))) && (
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

/**
 * Completion flow: confirm the invoicing contact with the customer on-site
 * (prefilled from their account), then complete. The server then generates the
 * QF- confirmation code and emails the customer their completion record.
 */
function CompleteJobSheet({ job }: { job: Job }) {
  const customer = useUser(job.customerId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  // Prefill from the job / customer account once available.
  useEffect(() => {
    if (!open) return;
    setName((v) => v || job.billing?.contactName || job.customerName || '');
    setEmail((v) => v || job.billing?.contactEmail || customer?.email || '');
  }, [open, customer?.email, job.billing?.contactName, job.billing?.contactEmail, job.customerName]);

  const valid = name.trim().length > 1 && /.+@.+\..+/.test(email.trim());

  const complete = async () => {
    try {
      setBusy(true);
      await backend.setJobBilling(job.id, { contactName: name, contactEmail: email });
      await backend.completeJob(job.id);
    } catch (e) {
      Alert.alert('Could not complete', (e as Error).message);
      setBusy(false);
    }
  };

  if (!open) {
    return <Button title="Complete job" icon="✅" kind="success" onPress={() => setOpen(true)} />;
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <Txt variant="label">Confirm invoicing details</Txt>
      <Txt variant="caption" color={colors.textMuted}>
        Check these with the customer — their completion record and confirmation code are emailed
        here, and your invoice references the same code.
      </Txt>
      <Field label="Invoice contact" placeholder="Who the invoice goes to" value={name} onChangeText={setName} />
      <Field
        label="Invoice email"
        placeholder="name@email.com"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Button
        title="Confirm & complete job"
        icon="✅"
        kind="success"
        disabled={!valid}
        loading={busy}
        onPress={complete}
      />
      <Button title="Back" kind="ghost" small onPress={() => setOpen(false)} />
    </Card>
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
  mapsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  gpsCard: { backgroundColor: colors.infoSoft, gap: spacing.xs, borderWidth: 0 },
  photo: { width: 100, height: 100, borderRadius: radius.md },
});
