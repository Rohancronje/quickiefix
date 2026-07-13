/**
 * Per-job message centre — one tap from the 💬 icon on the job/tracking
 * screens. Shows the job's details + photos up top so the conversation has
 * context, with the masked message thread below. Messages are wiped by the
 * server the moment a job completes or is cancelled (onJobThreadCleanup).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusPill } from '../../../src/components/JobCard';
import { MessageThread } from '../../../src/components/MessageThread';
import { Button, Card, Txt } from '../../../src/components/ui';
import { tradeMeta } from '../../../src/constants';
import { useAuth } from '../../../src/context/AuthContext';
import { useJob } from '../../../src/hooks/useData';
import { colors, radius, spacing } from '../../../src/theme';

const OPEN = ['searching', 'accepted', 'confirmed', 'travelling', 'on_site'];

export default function JobMessages() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const job = useJob(id);

  if (job === undefined || !user) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.amber} size="large" />
      </SafeAreaView>
    );
  }
  if (job === null) {
    return (
      <SafeAreaView style={styles.center}>
        <Txt variant="title">Job not found</Txt>
        <Button title="Back" kind="ghost" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const meta = tradeMeta(job.trade);
  const isCustomer = user.id === job.customerId;
  const from = isCustomer
    ? { role: 'customer' as const, id: user.id, name: `${user.firstName} ${user.lastName}` }
    : {
        role: 'tradie' as const,
        id: user.id,
        name: user.role === 'tradie' ? user.businessName : `${user.firstName} ${user.lastName}`,
      };
  const withName = isCustomer
    ? job.tradieName ?? 'your tradie'
    : job.customerName;
  const open = OPEN.includes(job.status);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Txt style={styles.back}>‹</Txt>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Txt variant="heading">💬 Messages</Txt>
          <Txt variant="caption" color={colors.textMuted}>
            {meta.emoji} {meta.label} · with {withName}
          </Txt>
        </View>
        <StatusPill status={job.status} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {/* Job context: what this conversation is about. */}
        <Card style={{ gap: spacing.sm }}>
          <Txt variant="label">The job</Txt>
          <Txt variant="body" color={colors.textMuted}>
            {job.description}
          </Txt>
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

        {open ? (
          <>
            <MessageThread jobId={job.id} from={from} />
            <Txt variant="caption" color={colors.textFaint} style={{ textAlign: 'center' }}>
              🧹 Messages and photos are deleted automatically when the job closes.
            </Txt>
          </>
        ) : (
          <Card style={{ alignItems: 'center', gap: spacing.xs }}>
            <Txt style={{ fontSize: 30 }}>🧹</Txt>
            <Txt variant="label">This conversation has closed</Txt>
            <Txt variant="caption" color={colors.textMuted} style={{ textAlign: 'center' }}>
              Messages are cleared automatically when a job is completed or cancelled.
            </Txt>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  back: { fontSize: 34, color: colors.text, lineHeight: 34 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  photo: { width: 100, height: 100, borderRadius: radius.md },
});
