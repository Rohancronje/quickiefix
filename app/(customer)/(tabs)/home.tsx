import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { JobCard } from '../../../src/components/JobCard';
import { Button, Card, EmptyState, Txt } from '../../../src/components/ui';
import { TRADES, tradeMeta } from '../../../src/constants';
import { useCustomer } from '../../../src/context/AuthContext';
import { useCustomerJobs } from '../../../src/hooks/useData';
import { useNow } from '../../../src/hooks/useNow';
import { backend } from '../../../src/services';
import { colors, radius, spacing } from '../../../src/theme';
import { Job } from '../../../src/types';

const ACTIVE = ['searching', 'accepted', 'confirmed', 'travelling', 'on_site'];

const STATUS_TEXT: Record<string, string> = {
  searching: 'Finding you a tradie…',
  accepted: 'A tradie accepted — confirm them',
  confirmed: 'Confirmed — your tradie is getting ready',
  travelling: 'Your tradie is on the way',
  on_site: 'Your tradie is on site',
};

export default function CustomerHome() {
  const customer = useCustomer();
  const router = useRouter();
  const now = useNow();
  const jobs = useCustomerJobs(customer.id);

  const active = jobs.filter((j) => ACTIVE.includes(j.status));
  const primary = active[0]; // jobs are newest-first
  const others = active.slice(1);
  const recent = jobs.filter((j) => !ACTIVE.includes(j.status)).slice(0, 3);

  const startJob = (trade?: string) =>
    router.push(trade ? { pathname: '/new-job', params: { trade } } : '/new-job');

  const openJob = (id: string) => router.push({ pathname: '/track/[id]', params: { id } });

  const cancelJob = (job: Job) =>
    Alert.alert(
      'Cancel this request?',
      `Your ${tradeMeta(job.trade).label.toLowerCase()} request will be cancelled${
        job.tradieId ? ' and the tradie notified' : ''
      }.`,
      [
        { text: 'Keep request', style: 'cancel' },
        {
          text: 'Cancel request',
          style: 'destructive',
          onPress: () => backend.cancelJob(job.id, 'customer'),
        },
      ],
    );

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Txt variant="caption" color={colors.textMuted}>
            Kia ora,
          </Txt>
          <Txt variant="title">{customer.firstName} 👋</Txt>
        </View>
        <View style={styles.logoMark}>
          <Txt style={{ fontSize: 20 }}>⚡</Txt>
        </View>
      </View>

      {/* Resume banner — a request is still in progress. Shown prominently so
          reopening the app always surfaces it with continue/cancel. */}
      {primary && (
        <Card style={styles.resume}>
          <Txt variant="label" color={colors.amber}>
            ⚡ Request in progress
          </Txt>
          <Txt variant="heading" color={colors.white}>
            {tradeMeta(primary.trade).emoji} {tradeMeta(primary.trade).label}
          </Txt>
          <Txt variant="caption" color={colors.onNavyMuted}>
            {STATUS_TEXT[primary.status] ?? 'In progress'}
          </Txt>
          <View style={styles.resumeActions}>
            <View style={{ flex: 1 }}>
              <Button
                title="Cancel"
                kind="ghost"
                small
                textColor={colors.onNavy}
                style={styles.resumeGhost}
                onPress={() => cancelJob(primary)}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Button title="Continue" icon="→" small onPress={() => openJob(primary.id)} />
            </View>
          </View>
        </Card>
      )}

      {/* Primary CTA */}
      <Card style={styles.cta}>
        <Txt variant="heading" color={colors.white}>
          {primary ? 'Need something else?' : 'Need a hand right now?'}
        </Txt>
        <Txt variant="caption" color={colors.onNavyMuted} style={{ marginBottom: spacing.sm }}>
          We'll dispatch the nearest verified tradie to you.
        </Txt>
        <Button title="Request help" icon="⚡" onPress={() => startJob()} />
      </Card>

      {/* Any additional active jobs */}
      {others.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Txt variant="label">Other active {others.length > 1 ? 'jobs' : 'job'}</Txt>
          {others.map((job) => (
            <JobCard key={job.id} job={job} now={now} onPress={() => openJob(job.id)} />
          ))}
        </View>
      )}

      {/* Quick categories */}
      <View style={{ gap: spacing.sm }}>
        <Txt variant="label">What do you need?</Txt>
        <View style={styles.grid}>
          {TRADES.slice(0, 8).map((t) => (
            <Pressable key={t.key} style={styles.tile} onPress={() => startJob(t.key)}>
              <Txt style={{ fontSize: 26 }}>{t.emoji}</Txt>
              <Txt variant="caption" color={colors.text} style={{ textAlign: 'center' }}>
                {t.label}
              </Txt>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Recent */}
      <View style={{ gap: spacing.sm }}>
        <Txt variant="label">Recent</Txt>
        {recent.length === 0 ? (
          <Card>
            <EmptyState
              emoji="🧰"
              title="No jobs yet"
              subtitle="Your completed and cancelled jobs will show here."
            />
          </Card>
        ) : (
          recent.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              now={now}
              onPress={() => router.push({ pathname: '/track/[id]', params: { id: job.id } })}
            />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: { backgroundColor: colors.navy, gap: spacing.xs },
  resume: { backgroundColor: colors.navy, gap: spacing.xs, borderWidth: 1, borderColor: colors.amber },
  resumeActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  resumeGhost: { backgroundColor: colors.navyCard, borderColor: colors.navyLine },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '23%',
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 4,
  },
});
