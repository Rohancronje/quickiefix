import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen } from '../../../src/components/Screen';
import { TradieSelectList } from '../../../src/components/TradieSelectList';
import { Button, Txt } from '../../../src/components/ui';
import { tradeMeta } from '../../../src/constants';
import { useJob } from '../../../src/hooks/useData';
import { backend } from '../../../src/services';
import { colors, spacing } from '../../../src/theme';

export default function ReassignJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const job = useJob(id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (job === undefined) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.amber} size="large" />
      </SafeAreaView>
    );
  }
  if (job === null || job.status !== 'searching') {
    return (
      <Screen>
        <Txt variant="title">Not available</Txt>
        <Button title="Go back" kind="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const send = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    await backend.reassignJob(job.id, selectedId);
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Txt style={styles.back}>‹</Txt>
        </Pressable>
        <Txt variant="heading">Choose another tradie</Txt>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Txt variant="body" color={colors.textMuted}>
          Pick another available {tradeMeta(job.trade).label.toLowerCase()} for your job at{' '}
          {job.location.address}.
        </Txt>
        <TradieSelectList
          trade={job.trade}
          location={job.location}
          excludeIds={job.declinedBy}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Send request"
          icon="📨"
          disabled={!selectedId}
          loading={submitting}
          onPress={send}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  back: { fontSize: 34, color: colors.text, lineHeight: 34 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
});
