import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { BiometricToggle } from '../../../src/components/BiometricToggle';
import { Avatar, Button, Card, Divider, Field, Txt } from '../../../src/components/ui';
import { tradeMeta } from '../../../src/constants';
import { useAuth, useCustomer } from '../../../src/context/AuthContext';
import {
  useCustomerJobs,
  useLandlordJobs,
  useLandlordProperties,
  useTenantProperties,
} from '../../../src/hooks/useData';
import { initials } from '../../../src/lib/format';
import { backend, resetDemoData } from '../../../src/services';
import { colors, radius, spacing } from '../../../src/theme';
import { Property } from '../../../src/types';

export default function CustomerAccount() {
  const customer = useCustomer();
  const { logout } = useAuth();
  const jobs = useCustomerJobs(customer.id);
  const completed = jobs.filter((j) => j.status === 'completed').length;

  const confirmReset = () => {
    Alert.alert(
      'Reset demo data?',
      'This clears all local jobs and accounts and reseeds the demo. You will be logged out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetDemoData();
            await logout();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Txt variant="title">Account</Txt>

      <Card style={{ alignItems: 'center', gap: spacing.sm }}>
        <Avatar label={initials(customer.firstName, customer.lastName)} size={72} />
        <Txt variant="heading">
          {customer.firstName} {customer.lastName}
        </Txt>
        <Txt variant="caption" color={colors.textMuted}>
          {customer.email}
        </Txt>
      </Card>

      <Card>
        <View style={styles.statsRow}>
          <Stat value={jobs.length} label="Requests" />
          <Divider />
          <Stat value={completed} label="Completed" />
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Row label="Saved home address" value={customer.homeAddress?.address ?? 'Not set'} />
        <Divider spacingV={spacing.xs} />
        <Row label="Saved work address" value={customer.workAddress?.address ?? 'Not set'} />
      </Card>

      <PropertiesSection customerId={customer.id} customerName={`${customer.firstName} ${customer.lastName}`} />

      {/* Sign-in & security */}
      <BiometricToggle />

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Button title="Log out" kind="ghost" onPress={logout} />
        <Button title="Reset demo data" kind="ghost" onPress={confirmReset} />
      </View>
    </Screen>
  );
}

function PropertiesSection({ customerId, customerName }: { customerId: string; customerName: string }) {
  const owned = useLandlordProperties(customerId);
  const rented = useTenantProperties(customerId);
  const landlordJobs = useLandlordJobs(customerId);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  const addProperty = async () => {
    if (!address.trim()) return;
    setBusy(true);
    await backend
      .createProperty({ id: customerId, name: customerName }, { label, address })
      .catch((e) => Alert.alert('Could not add', (e as Error).message));
    setBusy(false);
    setLabel('');
    setAddress('');
    setAdding(false);
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt variant="label">🏠 Properties</Txt>
        {!adding && <Button title="+ Add" kind="ghost" small fullWidth={false} onPress={() => setAdding(true)} />}
      </View>

      {owned.length === 0 && rented.length === 0 && !adding && (
        <Txt variant="caption" color={colors.textMuted}>
          Landlord? Add a property and link your tenants — you'll get visibility and an emailed
          record of every job at it, and jobs bill to you as payer of record.
        </Txt>
      )}

      {adding && (
        <View style={{ gap: spacing.sm }}>
          <Field label="Label (optional)" placeholder="e.g. Unit 4, Takapuna" value={label} onChangeText={setLabel} />
          <Field label="Address" placeholder="12 Queen Street, Auckland" value={address} onChangeText={setAddress} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" kind="ghost" small onPress={() => setAdding(false)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button title="Add property" small loading={busy} disabled={!address.trim()} onPress={addProperty} />
            </View>
          </View>
        </View>
      )}

      {owned.map((p) => (
        <OwnedProperty key={p.id} property={p} />
      ))}

      {rented.map((p) => (
        <View key={p.id} style={styles.propBox}>
          <Txt variant="label">{p.label || p.address}</Txt>
          <Txt variant="caption" color={colors.textMuted}>
            You're a tenant here · managed by {p.landlordName}
          </Txt>
        </View>
      ))}

      {landlordJobs.length > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Txt variant="caption" color={colors.textMuted} style={{ fontWeight: '700' }}>
            Jobs at your properties
          </Txt>
          {landlordJobs.slice(0, 5).map((j) => (
            <View key={j.id} style={styles.jobRow}>
              <Txt variant="caption">
                {tradeMeta(j.trade).emoji} {tradeMeta(j.trade).label} · {j.location.address}
              </Txt>
              <Txt variant="caption" color={colors.textFaint}>
                {j.status.replace('_', ' ')}
              </Txt>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function OwnedProperty({ property }: { property: Property }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const link = async () => {
    if (!email.trim()) return;
    setErr(null);
    setBusy(true);
    try {
      await backend.linkTenant(property.id, email);
      setEmail('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.propBox}>
      <Txt variant="label">{property.label || property.address}</Txt>
      {property.label && (
        <Txt variant="caption" color={colors.textFaint}>
          {property.address}
        </Txt>
      )}
      <Txt variant="caption" color={colors.textMuted}>
        {property.tenantEmails.length} tenant{property.tenantEmails.length === 1 ? '' : 's'} linked
      </Txt>
      {property.tenantEmails.map((e) => (
        <View key={e} style={styles.jobRow}>
          <Txt variant="caption">👤 {e}</Txt>
          <Button
            title="Unlink"
            kind="ghost"
            small
            fullWidth={false}
            onPress={() => {
              const id = property.tenantIds[property.tenantEmails.indexOf(e)];
              if (id) backend.unlinkTenant(property.id, id);
            }}
          />
        </View>
      ))}
      <Field
        placeholder="Tenant's QuickieFix email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        error={err ?? undefined}
      />
      <Button title="Link tenant" small loading={busy} disabled={!email.trim()} onPress={link} />
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Txt variant="title" color={colors.navy}>
        {value}
      </Txt>
      <Txt variant="caption" color={colors.textMuted}>
        {label}
      </Txt>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="caption" color={colors.textMuted}>
        {label}
      </Txt>
      <Txt variant="body">{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  propBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  jobRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
});
