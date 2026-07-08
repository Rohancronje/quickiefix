import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { TradieProfileCard } from '../../../src/components/TradieProfileCard';
import { Button, Card, Chip, Divider, Field, Txt } from '../../../src/components/ui';
import { tradeMeta } from '../../../src/constants';
import { useAuth, useTradie } from '../../../src/context/AuthContext';
import { backend, resetDemoData } from '../../../src/services';
import { colors, radius, spacing } from '../../../src/theme';

const RADIUS_OPTIONS = [5, 10, 15, 25];

export default function TradieProfile() {
  const tradie = useTradie();
  const { logout } = useAuth();
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const joinCompany = async () => {
    setJoinError(null);
    const code = inviteCode.trim();
    if (!code) return;
    try {
      setJoining(true);
      const company = await backend.redeemInvite(code, tradie.id);
      setInviteCode('');
      Alert.alert('Joined!', `You're now part of ${company.name}.`);
    } catch (e) {
      setJoinError((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const leaveCompany = () =>
    Alert.alert('Leave company?', `You'll no longer be linked to ${tradie.companyName}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => backend.leaveCompany(tradie.id) },
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

      {/* Company */}
      <Card style={{ gap: spacing.md }}>
        <Txt variant="label">Company</Txt>
        {tradie.companyId ? (
          <>
            <View style={styles.companyRow}>
              <Txt style={{ fontSize: 22 }}>🏢</Txt>
              <View style={{ flex: 1 }}>
                <Txt variant="heading">{tradie.companyName}</Txt>
                <Txt variant="caption" color={colors.textMuted}>
                  You're managed by this business.
                </Txt>
              </View>
            </View>
            <Button title="Leave company" kind="ghost" small onPress={leaveCompany} />
          </>
        ) : (
          <>
            <Txt variant="caption" color={colors.textMuted}>
              Work for a business? Enter the invite code they sent you to link your account. Sole
              traders can skip this.
            </Txt>
            <Field
              placeholder="Invite code"
              autoCapitalize="none"
              value={inviteCode}
              onChangeText={setInviteCode}
              error={joinError ?? undefined}
            />
            <Button title="Join company" small loading={joining} onPress={joinCompany} />
          </>
        )}
      </Card>

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

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Button title="Log out" kind="ghost" onPress={logout} />
        <Button title="Reset demo data" kind="ghost" onPress={confirmReset} />
      </View>
    </Screen>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
