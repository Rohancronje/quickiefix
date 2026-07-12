import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Txt } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { colors, font, radius, spacing } from '../../src/theme';

export default function Welcome() {
  const router = useRouter();
  const { login } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  // Scale the hero to the device: small phones get a smaller lockup + headline.
  const { width, height } = useWindowDimensions();
  const compact = width < 370 || height < 700;
  const logoW = Math.min(280, width * 0.72);

  const demoLogin = async (email: string) => {
    try {
      setBusy(email);
      await login(email, 'password');
      // routing guard handles navigation
    } catch (e) {
      Alert.alert('Login failed', (e as Error).message);
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero}>
        <View style={styles.logoRow}>
          <Image
            source={require('../../assets/logo-light.png')}
            style={{ width: logoW, height: logoW * 0.47 }}
            resizeMode="contain"
          />
        </View>

        <View style={{ gap: spacing.sm, marginTop: compact ? spacing.xl : spacing.xxxl }}>
          <Txt style={[styles.headline, compact && { fontSize: 34, lineHeight: 38 }]}>
            Get trusted help{'\n'}fast.
          </Txt>
          <Txt style={styles.sub}>
            On-demand, verified tradies dispatched to your door. No quotes, no
            waiting, no phone tag.
          </Txt>
        </View>

        <View style={styles.pills}>
          {['Verified pros', 'Live dispatch', 'Rated & trusted'].map((p) => (
            <View key={p} style={styles.pill}>
              <Txt style={styles.pillText}>{p}</Txt>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          title="I need a tradie"
          icon="🔍"
          onPress={() => router.push('/(auth)/register')}
        />
        <Button
          title="I'm a tradie"
          kind="ghost"
          icon="🧰"
          textColor={colors.onNavy}
          style={styles.ghostOnDark}
          onPress={() => router.push('/(auth)/register-tradie')}
        />

        <Pressable onPress={() => router.push('/(auth)/login')} style={styles.loginLink}>
          <Txt style={styles.loginText}>
            Already have an account? <Txt style={styles.loginTextBold}>Log in</Txt>
          </Txt>
        </Pressable>

        <View style={styles.demoBox}>
          <Txt style={styles.demoLabel}>Try a demo account</Txt>
          <View style={styles.demoRow}>
            <DemoChip
              label="Customer"
              loading={busy === 'User1@testaccount.com'}
              onPress={() => demoLogin('User1@testaccount.com')}
            />
            <DemoChip
              label="Electrician"
              loading={busy === 'User2@testaccount.com'}
              onPress={() => demoLogin('User2@testaccount.com')}
            />
            <DemoChip
              label="Plumber"
              loading={busy === 'User7@testaccount.com'}
              onPress={() => demoLogin('User7@testaccount.com')}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function DemoChip({
  label,
  onPress,
  loading,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={loading} style={styles.demoChip}>
      <Txt style={styles.demoChipText}>{loading ? '…' : label}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy, padding: spacing.xl, justifyContent: 'space-between' },
  hero: { flex: 1, justifyContent: 'center' },
  logoRow: { alignItems: 'flex-start' },
  logoMark: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBolt: { fontSize: 26 },
  wordmark: { fontSize: font.size.xxl, fontWeight: font.weight.heavy, color: colors.white },
  wordmarkAccent: { color: colors.amber, fontSize: font.size.xxl, fontWeight: font.weight.heavy },
  headline: { fontSize: 44, lineHeight: 48, fontWeight: font.weight.heavy, color: colors.white },
  sub: { fontSize: font.size.md, color: colors.onNavyMuted, lineHeight: 23, marginTop: spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl },
  pill: {
    backgroundColor: colors.navyCard,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.navyLine,
  },
  pillText: { color: colors.onNavy, fontSize: font.size.xs, fontWeight: font.weight.semibold },
  actions: { gap: spacing.md },
  ghostOnDark: { backgroundColor: colors.navyCard, borderColor: colors.navyLine },
  loginLink: { alignItems: 'center', paddingVertical: spacing.sm },
  loginText: { color: colors.onNavyMuted, fontSize: font.size.sm },
  loginTextBold: { color: colors.amber, fontWeight: font.weight.bold, fontSize: font.size.sm },
  demoBox: {
    backgroundColor: colors.navySoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.navyLine,
    gap: spacing.sm,
  },
  demoLabel: {
    color: colors.onNavyMuted,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    textAlign: 'center',
  },
  demoRow: { flexDirection: 'row', gap: spacing.sm },
  demoChip: {
    flex: 1,
    backgroundColor: colors.navyCard,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.navyLine,
  },
  demoChipText: { color: colors.onNavy, fontSize: font.size.sm, fontWeight: font.weight.semibold },
});
