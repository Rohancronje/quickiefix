import { TenantAgencyCard } from '../../../src/components/TenantAgencyCard';
import { SupportCard } from '../../../src/components/SupportCard';
import { appAlert } from '../../../src/components/AppAlert';
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
import { AddressField } from '../../../src/components/AddressField';
import { backend, resetDemoData } from '../../../src/services';
import { colors, radius, spacing } from '../../../src/theme';
import { Location, Property } from '../../../src/types';

export default function CustomerAccount() {
  const customer = useCustomer();
  const { logout } = useAuth();
  const jobs = useCustomerJobs(customer.id);
  const completed = jobs.filter((j) => j.status === 'completed').length;

  const confirmReset = () => {
    appAlert(
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
        <EditableAddress customerId={customer.id} kind="home" label="Saved home address" current={customer.homeAddress} />
        <Divider spacingV={spacing.xs} />
        <EditableAddress customerId={customer.id} kind="work" label="Saved work address" current={customer.workAddress} />
      </Card>

      <PropertiesSection customerId={customer.id} customerName={`${customer.firstName} ${customer.lastName}`} />

      {/* Property manager link (tenant side of the agency model) */}
      <TenantAgencyCard user={customer} />

      {/* Help & support - tickets reach the back office + ops email */}
      <SupportCard user={customer} />

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
      .catch((e) => appAlert('Could not add', (e as Error).message));
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
      <Button
        title="Remove property"
        kind="ghost"
        small
        onPress={() =>
          appAlert(
            'Remove this property?',
            `${property.label || property.address} is removed from your account${
              property.tenantIds.length > 0 ? ' and unlinked from its tenants' : ''
            }. Past jobs and their records are unaffected.`,
            [
              { text: 'Keep property', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () => backend.removeProperty(property.id),
              },
            ],
          )
        }
      />
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

/** Saved home/work address with inline editing (Places-backed). */
function EditableAddress({
  customerId,
  kind,
  label,
  current,
}: {
  customerId: string;
  kind: 'home' | 'work';
  label: string;
  current?: Location;
}) {
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    await backend
      .setCustomerAddress(
        customerId,
        kind,
        address.trim() ? { address: address.trim(), ...(coords ?? {}) } : null,
      )
      .catch((e) => appAlert('Could not save', (e as Error).message));
    setBusy(false);
    setEditing(false);
  };

  if (!editing) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Row label={label} value={current?.address ?? 'Not set'} />
        </View>
        <Button
          title={current ? 'Edit' : 'Set'}
          kind="ghost"
          small
          fullWidth={false}
          onPress={() => {
            setAddress(current?.address ?? '');
            setCoords(
              current?.latitude != null && current?.longitude != null
                ? { latitude: current.latitude, longitude: current.longitude }
                : null,
            );
            setEditing(true);
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <AddressField
        label={label}
        placeholder="12 Queen Street, Auckland"
        value={address}
        onChangeText={(t) => {
          setAddress(t);
          setCoords(null);
        }}
        onSelect={(r) => {
          setAddress(r.address);
          setCoords(
            r.latitude != null && r.longitude != null
              ? { latitude: r.latitude, longitude: r.longitude }
              : null,
          );
        }}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" kind="ghost" small onPress={() => setEditing(false)} />
        </View>
        <View style={{ flex: 2 }}>
          <Button
            title={address.trim() ? 'Save' : 'Clear address'}
            small
            loading={busy}
            onPress={save}
          />
        </View>
      </View>
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
