import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, font, spacing } from '../theme';

/**
 * Catches render/runtime JS errors so the app shows a message instead of
 * white-screening or closing. Also surfaces the error text for diagnosis.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.emoji}>⚠️</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.sub}>The app hit an unexpected error.</Text>
        <ScrollView style={styles.box} contentContainerStyle={{ padding: spacing.md }}>
          <Text style={styles.err}>{error.message}</Text>
          {!!error.stack && <Text style={styles.stack}>{error.stack}</Text>}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.navy, padding: spacing.xl, justifyContent: 'center' },
  emoji: { fontSize: 44, textAlign: 'center', marginBottom: spacing.md },
  title: { color: colors.white, fontSize: font.size.xl, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.onNavyMuted, textAlign: 'center', marginTop: 6, marginBottom: spacing.lg },
  box: { maxHeight: 280, backgroundColor: colors.navyCard, borderRadius: 12 },
  err: { color: '#FF9AA2', fontWeight: '700', fontSize: font.size.sm },
  stack: { color: colors.onNavyMuted, fontSize: font.size.xs, marginTop: spacing.sm },
});
