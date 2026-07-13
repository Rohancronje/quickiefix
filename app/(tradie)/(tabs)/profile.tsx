import { SupportCard } from '../../../src/components/SupportCard';
import { appAlert } from '../../../src/components/AppAlert';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { BiometricToggle } from '../../../src/components/BiometricToggle';
import { TradieProfileCard } from '../../../src/components/TradieProfileCard';
import { Button, Card, Chip, Divider, Field, Txt } from '../../../src/components/ui';
import { formatMoney, tradeMeta } from '../../../src/constants';
import { useAuth, useTradie } from '../../../src/context/AuthContext';
import { backend, resetDemoData } from '../../../src/services';
import { colors, radius, spacing } from '../../../src/theme';
import { AgencyLink, Engagement, RateCard } from '../../../src/types';

const RADIUS_OPTIONS = [5, 10, 15, 25];

/**
 * Property-agent panels: enter an agency's code to request a spot on their
 * approved list. Pending until the AGENCY confirms (they know who they
 * invited). Jobs at their managed properties then dispatch to you.
 */
function AgencyPanelCard({ tradieId, tradieName, companyId }: { tradieId: string; tradieName: string; companyId?: string }) {
  const [links, setLinks] = useState<AgencyLink[]>([]);
  const [agencyCode, setAgencyCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => backend.subscribeMyAgencyLinks(tradieId, setLinks, companyId), [tradieId, companyId]);

  const join = async () => {
    setError(null);
    if (!agencyCode.trim()) return;
    try {
      setBusy(true);
      const agencyName = await backend.requestAgencyLink(
        { id: tradieId, name: tradieName },
        agencyCode,
        'tradie',
      );
      setAgencyCode('');
      appAlert(
        'Request sent',
        `${agencyName} has been asked to add you to their approved panel. You'll appear for their properties once they confirm.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <Txt variant="label">🏢 Property agents</Txt>
      {links.length === 0 && (
        <Txt variant="caption" color={colors.textMuted}>
          Work with a property manager? Enter their agent code to join their approved panel — jobs
          at their properties come straight to you.
        </Txt>
      )}
      {links.map((l) => (
        <View key={l.id} style={agencyStyles.row}>
          <View style={{ flex: 1 }}>
            <Txt variant="label">{l.agencyName}</Txt>
          </View>
          <View
            style={[
              agencyStyles.pill,
              { backgroundColor: l.status === 'approved' ? colors.successSoft : colors.warningSoft },
            ]}
          >
            <Txt
              variant="caption"
              color={l.status === 'approved' ? colors.success : colors.warning}
              style={{ fontWeight: '700' }}
            >
              {l.status === 'approved' ? '✓ Approved' : '⏳ Pending'}
            </Txt>
          </View>
        </View>
      ))}
      <Field
        placeholder="Agent code (e.g. QF-AG-7K2P)"
        autoCapitalize="characters"
        value={agencyCode}
        onChangeText={setAgencyCode}
        error={error ?? undefined}
      />
      <Button title="Join panel" small loading={busy} onPress={join} />
    </Card>
  );
}

const agencyStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3 },
});

/** Independent tradies must carry their own NZBN — shown until one is saved. */
function NzbnPromptCard({ tradieId }: { tradieId: string }) {
  const [nzbn, setNzbn] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!nzbn.trim()) return;
    setSaving(true);
    await backend.setTradieNzbn(tradieId, nzbn).catch(() => {});
    setSaving(false);
  };

  return (
    <Card style={{ gap: spacing.sm, borderColor: colors.warning, borderWidth: 1 }}>
      <Txt variant="label" color={colors.warning}>
        ⚠️ Add your NZBN
      </Txt>
      <Txt variant="caption" color={colors.textMuted}>
        You're trading independently, so invoices need your own NZBN. Enter it here — or join a
        company with their seat code instead.
      </Txt>
      <Field placeholder="9429…" value={nzbn} onChangeText={setNzbn} keyboardType="numeric" />
      <Button title="Save NZBN" small loading={saving} onPress={save} />
    </Card>
  );
}

export default function TradieProfile() {
  const tradie = useTradie();
  const { logout } = useAuth();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Tag state: validated (companyId set) > claimed-pending (activeTagId only) > independent.
  const validated = !!tradie.companyId;
  const claimedPending = !!tradie.activeTagId && !tradie.companyId;

  const claimTag = () => {
    setJoinError(null);
    const c = code.trim().toUpperCase();
    if (!c) return;
    // Employee vs contractor changes identity + billing: employees trade
    // under the company's name/NZBN; contractors keep their own business.
    appAlert(
      'How do you work with them?',
      'Employees appear under their personal name with the company NZBN. Contractors keep their own business name and NZBN, and invoice the company.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: "I'm a contractor", onPress: () => doClaim(c, 'contractor') },
        { text: "I'm an employee", onPress: () => doClaim(c, 'employee') },
      ],
    );
  };

  const doClaim = async (c: string, engagement: Engagement) => {
    try {
      setJoining(true);
      const company = await backend.claimTag(c, tradie.id, engagement);
      setCode('');
      appAlert(
        'Code accepted',
        `You've claimed a ${engagement} seat with ${company.name}. It shows as pending until ${company.name} confirms you.`,
      );
    } catch (e) {
      setJoinError((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const leaveCompany = () =>
    appAlert('Leave company?', `You'll no longer be linked to ${tradie.companyName}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await backend.leaveCompany(tradie.id);
          } catch (e) {
            appAlert('Could not leave', (e as Error).message);
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
    appAlert('Reset demo data?', 'Clears all local data and logs you out.', [
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

      {/* Independent tradies need their own NZBN (employees trade under the
          company's — so leaving a company prompts this). */}
      {!tradie.companyId && !tradie.nzbn && <NzbnPromptCard tradieId={tradie.id} />}

      {/* Property agents — approved-panel memberships */}
      <AgencyPanelCard tradieId={tradie.id} tradieName={tradie.businessName} companyId={tradie.companyId} />

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

      {/* Help & support - tickets reach the back office + ops email */}
      <SupportCard user={tradie} />

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
