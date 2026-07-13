import React from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { Button, Card, EmptyState, Divider, Txt } from '../../../src/components/ui';
import { tradeMeta } from '../../../src/constants';
import { useTradie } from '../../../src/context/AuthContext';
import { useTradieHistory } from '../../../src/hooks/useData';
import { formatDateTime, formatDuration } from '../../../src/lib/format';
import { jobsToCsv, toTimesheetRow } from '../../../src/lib/timesheet';
import { colors, spacing } from '../../../src/theme';

export default function Timesheets() {
  const tradie = useTradie();
  const jobs = useTradieHistory(tradie.id);

  const totalWorkedMs = jobs.reduce((sum, j) => {
    const r = toTimesheetRow(j);
    return sum + (r.workingDurationMs ?? 0);
  }, 0);

  const exportCsv = async () => {
    if (jobs.length === 0) {
      Alert.alert('Nothing to export', 'Complete a job first to build your timesheet.');
      return;
    }
    try {
      await Share.share({
        title: 'QuickieFix Timesheet',
        message: jobsToCsv(jobs),
      });
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message);
    }
  };

  return (
    <Screen>
      <Txt variant="title">Timesheets</Txt>

      <Card>
        <View style={styles.summary}>
          <Stat value={`${jobs.length}`} label="Jobs" />
          <Divider />
          <Stat value={formatDuration(totalWorkedMs)} label="Time worked" />
        </View>
        <Button title="Export as CSV" icon="⬇️" small kind="secondary" onPress={exportCsv} style={{ marginTop: spacing.md }} />
      </Card>

      {jobs.length === 0 ? (
        <Card>
          <EmptyState emoji="🧾" title="No completed jobs yet" subtitle="Finished jobs appear here, ready to export." />
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {jobs.map((job) => {
            const row = toTimesheetRow(job);
            return (
              <Card key={job.id} style={{ gap: spacing.xs }}>
                <View style={styles.rowTop}>
                  <Txt variant="label">
                    {tradeMeta(job.trade).emoji} {tradeMeta(job.trade).label}
                  </Txt>
                  <Txt variant="caption" color={colors.textMuted}>
                    {formatDateTime(row.completedAt)}
                  </Txt>
                </View>
                <Txt variant="caption" color={colors.textMuted}>
                  Customer: {row.customerName} · {row.address}
                </Txt>
                {row.companyName && (
                  <Txt variant="caption" color={colors.navy} style={{ fontWeight: '700' }}>
                    Contracted to: {row.companyName}
                  </Txt>
                )}
                <Divider spacingV={spacing.xs} />
                <View style={styles.durations}>
                  <Micro label="Total" value={formatDuration(row.totalDurationMs)} />
                  <Micro label="On site" value={formatDuration(row.workingDurationMs)} />
                  <Micro label="Rating" value={row.stars ? `${row.stars}★` : '—'} />
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Txt variant="heading" color={colors.navy}>
        {value}
      </Txt>
      <Txt variant="caption" color={colors.textMuted}>
        {label}
      </Txt>
    </View>
  );
}

function Micro({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 1 }}>
      <Txt variant="caption" color={colors.textFaint}>
        {label}
      </Txt>
      <Txt variant="label">{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  durations: { flexDirection: 'row', gap: spacing.md },
});
