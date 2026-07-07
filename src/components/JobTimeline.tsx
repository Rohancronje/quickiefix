import React from 'react';
import { StyleSheet, View } from 'react-native';
import { formatTime } from '../lib/format';
import { colors, font, spacing } from '../theme';
import { Job } from '../types';
import { Txt } from './ui';

interface Stage {
  key: string;
  label: string;
  at?: number;
}

/** Vertical progress timeline of a job's lifecycle. */
export function JobTimeline({ job }: { job: Job }) {
  const t = job.timestamps;
  const stages: Stage[] = [
    { key: 'requested', label: 'Request submitted', at: t.createdAt },
    { key: 'accepted', label: 'Tradie accepted', at: t.acceptedAt },
    { key: 'travelling', label: 'On the way', at: t.travellingAt },
    { key: 'on_site', label: 'Arrived on site', at: t.onSiteAt },
    { key: 'completed', label: 'Job completed', at: t.completedAt },
  ];

  return (
    <View style={styles.wrap}>
      {stages.map((s, i) => {
        const done = s.at != null;
        const isLast = i === stages.length - 1;
        return (
          <View key={s.key} style={styles.row}>
            <View style={styles.railCol}>
              <View style={[styles.dot, done ? styles.dotDone : styles.dotPending]}>
                {done && <Txt style={styles.check}>✓</Txt>}
              </View>
              {!isLast && (
                <View style={[styles.line, { backgroundColor: done ? colors.success : colors.line }]} />
              )}
            </View>
            <View style={styles.labelCol}>
              <Txt variant="label" color={done ? colors.text : colors.textFaint}>
                {s.label}
              </Txt>
              <Txt variant="caption" color={colors.textMuted}>
                {done ? formatTime(s.at) : 'Pending'}
              </Txt>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  row: { flexDirection: 'row', gap: spacing.md },
  railCol: { alignItems: 'center', width: 24 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dotPending: { backgroundColor: colors.surface, borderColor: colors.line },
  check: { color: colors.white, fontSize: 13, fontWeight: '800' },
  line: { width: 2, flex: 1, minHeight: 22, marginVertical: 2 },
  labelCol: { flex: 1, paddingBottom: spacing.lg, gap: 1 },
});
