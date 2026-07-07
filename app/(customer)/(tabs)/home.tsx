import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { JobCard } from '../../../src/components/JobCard';
import { Button, Card, EmptyState, Txt } from '../../../src/components/ui';
import { TRADES } from '../../../src/constants';
import { useCustomer } from '../../../src/context/AuthContext';
import { useCustomerJobs } from '../../../src/hooks/useData';
import { useNow } from '../../../src/hooks/useNow';
import { colors, font, radius, spacing } from '../../../src/theme';

const ACTIVE = ['searching', 'accepted', 'travelling', 'on_site'];

export default function CustomerHome() {
  const customer = useCustomer();
  const router = useRouter();
  const now = useNow();
  const jobs = useCustomerJobs(customer.id);

  const active = jobs.filter((j) => ACTIVE.includes(j.status));
  const recent = jobs.filter((j) => !ACTIVE.includes(j.status)).slice(0, 3);

  const startJob = (trade?: string) =>
    router.push(trade ? { pathname: '/new-job', params: { trade } } : '/new-job');

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

      {/* Primary CTA */}
      <Card style={styles.cta}>
        <Txt variant="heading" color={colors.white}>
          Need a hand right now?
        </Txt>
        <Txt variant="caption" color={colors.onNavyMuted} style={{ marginBottom: spacing.sm }}>
          We'll dispatch the nearest verified tradie to you.
        </Txt>
        <Button title="Request help" icon="⚡" onPress={() => startJob()} />
      </Card>

      {/* Active jobs */}
      {active.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Txt variant="label">Active {active.length > 1 ? 'jobs' : 'job'}</Txt>
          {active.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              now={now}
              onPress={() => router.push({ pathname: '/track/[id]', params: { id: job.id } })}
            />
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
