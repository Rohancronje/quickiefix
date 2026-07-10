import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { BiometricToggle } from '../../../src/components/BiometricToggle';
import { TradieProfileCard } from '../../../src/components/TradieProfileCard';
import { Button, Card, Chip, Divider, Field, Txt } from '../../../src/components/ui';
import { formatMoney, tradeMeta } from '../../../src/constants';
import { useAuth, useTradie } from '../../../src/context/AuthContext';
import { backend, resetDemoData } from '../../../src/services';
import { colors, radius, spacing } from '../../../src/theme';
import { RateCard } from '../../../src/types';

const RADIUS_OPTIONS = [5, 10, 15, 25];

export default function TradieProfile() {
  const tradie = useTradie();
  const { logout } = useAuth();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Tag state: validated (companyId set) > claimed-pending (activeTagId only) > independent.
  const validated = !!tradie.companyId;
  const claimedPending = !!tradie.activeTagId && !tradie.companyId;

  const claimTag = async () => {
    setJoinError(null);
    const c = code.trim().toUpperCase();
    if (!c) return;
    try {
      setJoining(true);
      const company = await backend.claimTag(c, tradie.id);
      setCode('');
      Alert.alert(
        'Code accepted',
        `You've claimed a seat with ${company.name}. It shows as pending until QuickieFix confirms your details.`,
      );
    } catch (e) {
      setJoinError((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const leaveCompany = () =>
    Alert.alert('Leave company?', `You'll no longer be linked to ${tradie.companyName}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await backend.leaveCompany(tradie.id);
          } catch (e) {
            Alert.alert('Could not leave', (e as Error).message);
          }
        },
      },
    ]);

  const approvalMeta = {
    approved: { label: '✓ Verified & approved', color: colors.success, soft: colors.successSoft },
    pending: { label: '⏳ Pending approval', color: colors.amberDark, soft: colors.warningSoft },
    rejected: { label: '✕ Rejected', color: colors.danger, soft: colors.dangerSoft },
    suspended: { label: '⛔ Suspended', color: colors.danger, soft: colors.dangerSoft },
  }[tradie.approval];

  const confirmReset = () => {
    Alert.alert('Reset demo data?', 'Clears all local data and logs you out.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await resetDemoData();
          await logout();
        },
      },
    ]);
  };

  return (
    <Screen>
      <Txt variant="title">Profile</Txt>

      <View style={[styles.approvalBanner, { backgroundColor: approvalMeta.soft }]}>
        <Txt variant="label" color={approvalMeta.color}>
          {approvalMeta.label}
        </Txt>
      </View>

      <TradieProfileCard tradie={tradie} />

      {/* Company tag */}
      <Card style={{ gap: spacing.md }}>
        <Txt variant="label">Company</Txt>
        {validated ? (
          <>
            <View style={styles.companyRow}>
              <Txt style={{ fontSize: 22 }}>🏢</Txt>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Txt variant="heading">{tradie.companyName}</Txt>
                  <View style={styles.greenDot} />
                  <Txt variant="caption" color={colors.success} style={{ fontWeight: '700' }}>
                    Verified
                  </Txt>
                </View>
                <Txt variant="caption" color={colors.textMuted}>
                  Your jobs and rates are managed by this business.
                </Txt>
              </View>
            </View>
            <Txt variant="caption" color={colors.textFaint}>
              Only {tradie.companyName} can remove you from their team.
            </Txt>
          </>
        ) : claimedPending ? (
          <>
            <View style={styles.companyRow}>
              <Txt style={{ fontSize: 22 }}>⏳</Txt>
              <View style={{ flex: 1 }}>
                <Txt variant="heading">Pending verification</Txt>
                <Txt variant="caption" color={colors.textMuted}>
                  You've claimed a company seat. QuickieFix is confirming your details match.
                </Txt>
              </View>
            </View>
            <Button title="Cancel this claim" kind="ghost" small onPress={leaveCompany} />
          </>
        ) : (
          <>
            <Txt variant="caption" color={colors.textMuted}>
              Work for a business? Enter the seat code they sent you to link your account. Sole
              traders can skip this.
            </Txt>
            <Field
              placeholder="Seat code (e.g. QF-7K2P9M)"
              autoCapitalize="characters"
              value={code}
              onChangeText={setCode}
              error={joinError ?? undefined}
            />
            <Button title="Claim seat" small loading={joining} onPress={claimTag} />
          </>
        )}
      </Card>

      {/* Rate card */}
      <RateCardCard tradie={tradie} validated={validated} />

      {/* Qualifications */}
      <Card style={{ gap: spacing.sm }}>
        <Txt variant="label">Trades & qualifications</Txt>
        <Row label="Primary trade" value={tradeMeta(tradie.primaryTrade).label} />
        {tradie.secondaryTrades.length > 0 && (
          <Row label="Secondary" value={tradie.secondaryTrades.map((t) => tradeMeta(t).label).join(', ')} />
        )}
        {tradie.qualifications.map((q, i) => (
          <View key={i}>
            <Divider spacingV={spacing.xs} />
            <Row label={`${tradeMeta(q.trade).label} licence`} value={q.licenceNumber ?? '—'} />
            {q.expiry && <Row label="Expiry" value={q.expiry} />}
          </View>
        ))}
        {tradie.nzbn && <Row label="NZBN" value={tradie.nzbn} />}
      </Card>

      {/* Service radius */}
      <Card style={{ gap: spacing.md }}>
        <Txt variant="label">Service radius</Txt>
        <View style={styles.chips}>
          {RADIUS_OPTIONS.map((km) => (
            <Chip
              key={km}
              label={`${km} km`}
              selected={tradie.serviceRadiusKm === km}
              onPress={() => backend.setServiceRadius(tradie.id, km)}
            />
          ))}
        </View>
      </Card>

      {/* Sign-in & security */}
      <BiometricToggle />

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Button title="Log out" kind="ghost" onPress={logout} />
        <Button title="Reset demo data" kind="ghost" onPress={confirmReset} />
      </View>
    </Screen>
  );
}

function dollarsToCents(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}
const centsToDollars = (c?: number) => (c != null ? (c / 100).toFixed(2) : '');

function RateCardCard({
  tradie,
  validated,
}: {
  tradie: { id: string; rateCard?: RateCard; companyName?: string };
  validated: boolean;
}) {
  const rc = tradie.rateCard;
  const [hourly, setHourly] = useState(centsToDollars(rc?.hourlyRateCents));
  const [callout, setCallout] = useState(centsToDollars(rc?.calloutFeeCents));
  const [afterHours, setAfterHours] = useState(centsToDollars(rc?.afterHoursCalloutFeeCents));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // While validated-tagged the rate editor is locked to the company's rates (§6.3).
  if (validated) {
    return (
      <Card style={{ gap: spacing.sm }}>
        <Txt variant="label">Rate card 🔒</Txt>
        <Txt variant="caption" color={colors.textMuted}>
          Rates are managed by {tradie.companyName}. Your personal rate card is kept on file and
          resumes if you leave the company.
        </Txt>
      </Card>
    );
  }

  const save = async () => {
    const hourlyRateCents = dollarsToCents(hourly);
    if (hourlyRateCents <= 0) return;
    setSaving(true);
    const card: RateCard = { hourlyRateCents };
    if (dollarsToCents(callout) > 0) card.calloutFeeCents = dollarsToCents(callout);
    if (dollarsToCents(afterHours) > 0) card.afterHoursCalloutFeeCents = dollarsToCents(afterHours);
    await backend.setTradieRateCard(tradie.id, card).catch(() => {});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <Txt variant="label">Your rate card</Txt>
      <Txt variant="caption" color={colors.textMuted}>
        Shown to customers when you accept a job. Enter amounts in dollars.
      </Txt>
      <Field label="Hourly rate ($)" placeholder="95" keyboardType="numeric" value={hourly} onChangeText={setHourly} />
      <Field label="Call-out fee ($, optional)" placeholder="80" keyboardType="numeric" value={callout} onChangeText={setCallout} />
      <Field label="After-hours call-out ($, optional)" placeholder="140" keyboardType="numeric" value={afterHours} onChangeText={setAfterHours} />
      <Button
        title={saved ? '✓ Saved' : 'Save rate card'}
        small
        loading={saving}
        disabled={dollarsToCents(hourly) <= 0}
        onPress={save}
      />
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
      <Txt variant="caption" color={colors.textMuted}>
        {label}
      </Txt>
      <Txt variant="label" style={{ flex: 1, textAlign: 'right' }}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  approvalBanner: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
