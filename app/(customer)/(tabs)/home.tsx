import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { JobCard } from '../../../src/components/JobCard';
import { Button, Card, EmptyState, Txt } from '../../../src/components/ui';
import { formatMoney, TRADES, tradeMeta } from '../../../src/constants';
import { useCustomer } from '../../../src/context/AuthContext';
import { useCustomerJobs, useSupply } from '../../../src/hooks/useData';
import { useNow } from '../../../src/hooks/useNow';
import { greeting } from '../../../src/lib/greeting';
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
  // Narrow phones: 3 trade tiles per row so labels stay readable; else 4.
  const { width } = useWindowDimensions();
  const tileWidth = width < 370 ? '31%' : '23%';

  const active = jobs.filter((j) => ACTIVE.includes(j.status));
  const primary = active[0]; // jobs are newest-first
  const others = active.slice(1);
  const recent = jobs.filter((j) => !ACTIVE.includes(j.status)).slice(0, 3);

  // Live proof of supply — anchored to the saved home address when it has
  // coordinates (ETA needs a reference point; the count works without one).
  const supply = useSupply(
    customer.homeAddress?.latitude != null && customer.homeAddress?.longitude != null
      ? { latitude: customer.homeAddress.latitude, longitude: customer.homeAddress.longitude }
      : undefined,
  );
  const fromPrice =
    supply.fromCalloutCents != null
      ? `call-out from ${formatMoney(supply.fromCalloutCents)}`
      : supply.fromHourlyCents != null
        ? `from ${formatMoney(supply.fromHourlyCents)}/hr`
        : null;
  const supplyLine =
    supply.count > 0
      ? [
          supply.nearestEtaMinutes != null ? `Nearest verified pro ~${supply.nearestEtaMinutes} min away` : 'Verified pros ready now',
          fromPrice,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

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
      {/* Brand — centred lockup at the very top (matches the tradie home) */}
      <Image
        source={require('../../../assets/logo.png')}
        style={styles.brand}
        resizeMode="contain"
        accessibilityLabel="QuickieFix"
      />

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Txt variant="title">
            {greeting()}, {customer.firstName}
          </Txt>
          <Txt variant="caption" color={colors.textMuted}>
            What do you need sorted today?
          </Txt>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconBtn} onPress={() => router.push('/activity')}>
            <Txt style={{ fontSize: 18 }}>🔔</Txt>
            {active.length > 0 && (
              <View style={styles.bellBadge}>
                <Txt style={styles.bellBadgeText}>{active.length}</Txt>
              </View>
            )}
          </Pressable>
          <Pressable style={styles.avatar} onPress={() => router.push('/account')}>
            <Txt style={styles.avatarText}>{customer.firstName.charAt(0).toUpperCase()}</Txt>
          </Pressable>
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

      {/* Primary CTA — with live proof of supply, so the promise ("fast,
          verified, priced upfront") is on the screen where users decide. */}
      <Card style={styles.cta}>
        {supply.count > 0 && (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Txt variant="caption" color={colors.success} style={{ fontWeight: '700' }}>
              {supply.count} verified {supply.count === 1 ? 'tradie' : 'tradies'} near you now
            </Txt>
          </View>
        )}
        <Txt variant="heading" color={colors.white}>
          {primary ? 'Need something else?' : 'Need a hand right now?'}
        </Txt>
        <Txt variant="caption" color={colors.onNavyMuted} style={{ marginBottom: spacing.sm }}>
          {supplyLine ?? "We'll dispatch the nearest verified tradie to you."}
        </Txt>
        <Button
          title={supply.nearestEtaMinutes != null ? `Request help · ~${supply.nearestEtaMinutes} min` : 'Request help'}
          icon="⚡"
          onPress={() => startJob()}
        />
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
            <Pressable key={t.key} style={[styles.tile, { width: tileWidth }]} onPress={() => startJob(t.key)}>
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
  // Generous whitespace in the source PNG → render larger, pull margins in.
  brand: { alignSelf: 'center', height: 86, width: 254, marginVertical: -16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
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
  cta: { backgroundColor: colors.navy, gap: spacing.xs },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(31,180,113,0.15)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginBottom: 2,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  resume: { backgroundColor: colors.navy, gap: spacing.xs, borderWidth: 1, borderColor: colors.amber },
  resumeActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  resumeGhost: { backgroundColor: colors.navyCard, borderColor: colors.navyLine },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
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
