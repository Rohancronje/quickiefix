import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { Avatar, Button, Card, Divider, Txt } from '../../../src/components/ui';
import { useAuth, useCustomer } from '../../../src/context/AuthContext';
import { useCustomerJobs } from '../../../src/hooks/useData';
import { initials } from '../../../src/lib/format';
import { resetDemoData } from '../../../src/services';
import { colors, spacing } from '../../../src/theme';

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

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Button title="Log out" kind="ghost" onPress={logout} />
        <Button title="Reset demo data" kind="ghost" onPress={confirmReset} />
      </View>
    </Screen>
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
});
