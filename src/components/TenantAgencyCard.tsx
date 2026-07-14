/**
 * Tenant → property manager link. Tenants get the agency code from their
 * property manager's invite email; entering it here creates a pending link
 * the AGENCY approves, after which the agency adds them to their property.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { appAlert } from './AppAlert';
import { useTenantProperties } from '../hooks/useData';
import { backend } from '../services';
import { colors, radius, spacing } from '../theme';
import { AgencyLink, AppUser } from '../types';
import { Button, Card, Field, Txt } from './ui';

export function TenantAgencyCard({ user }: { user: AppUser }) {
  const [links, setLinks] = useState<AgencyLink[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Confirmed but not linked to a property yet? Tell the tenant what's
  // missing instead of leaving a silent gap.
  const rented = useTenantProperties(user.id);

  useEffect(() => backend.subscribeMyAgencyLinks(user.id, setLinks), [user.id]);

  const join = async () => {
    setError(null);
    if (!code.trim()) return;
    try {
      setBusy(true);
      const agencyName = await backend.requestAgencyLink(
        { id: user.id, name: `${user.firstName} ${user.lastName}`, email: user.email },
        code,
        'tenant',
      );
      setCode('');
      appAlert(
        'Request sent',
        `${agencyName} has been asked to confirm you as their tenant. Once they approve and add you to your property, it appears under 🏠 Properties.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <Txt variant="label">🏢 Property manager</Txt>
      {links.length === 0 && (
        <Txt variant="caption" color={colors.textMuted}>
          Renting through a property manager? Enter the code from their invite — repairs at your
          place then go through their approved tradies.
        </Txt>
      )}
      {links.map((l) => (
        <View key={l.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Txt variant="label">{l.agencyName}</Txt>
          </View>
          <View
            style={[
              styles.pill,
              { backgroundColor: l.status === 'approved' ? colors.successSoft : colors.warningSoft },
            ]}
          >
            <Txt
              variant="caption"
              color={l.status === 'approved' ? colors.success : colors.warning}
              style={{ fontWeight: '700' }}
            >
              {l.status === 'approved' ? '✓ Confirmed' : '⏳ Pending'}
            </Txt>
          </View>
        </View>
      ))}
      {links.some((l) => l.status === 'approved') && rented.length === 0 && (
        <Txt variant="caption" color={colors.warning}>
          ⚠️ You're confirmed, but your property manager hasn't linked you to your address yet —
          ask them to add you to your property so repairs there are one tap away.
        </Txt>
      )}
      <Field
        placeholder="Agent code (e.g. QF-AG-7K2P)"
        autoCapitalize="characters"
        value={code}
        onChangeText={setCode}
        error={error ?? undefined}
      />
      <Button title="Link my property manager" small loading={busy} onPress={join} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 3 },
});
