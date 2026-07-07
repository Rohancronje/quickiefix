import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, Field, Txt } from '../../src/components/ui';
import { TRADES, tradeMeta } from '../../src/constants';
import { useAuth } from '../../src/context/AuthContext';
import { colors, font, radius, spacing } from '../../src/theme';
import { Qualification, TradeCategory } from '../../src/types';

const RADIUS_OPTIONS = [5, 10, 15, 25];

export default function RegisterTradie() {
  const router = useRouter();
  const { registerTradie } = useAuth();

  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [years, setYears] = useState('');
  const [nzbn, setNzbn] = useState('');
  const [primaryTrade, setPrimaryTrade] = useState<TradeCategory | null>(null);
  const [secondary, setSecondary] = useState<TradeCategory[]>([]);
  const [licenceNumber, setLicenceNumber] = useState('');
  const [licenceExpiry, setLicenceExpiry] = useState('');
  const [serviceRadiusKm, setRadius] = useState(15);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const primaryRegulated = useMemo(
    () => (primaryTrade ? tradeMeta(primaryTrade).regulated : false),
    [primaryTrade],
  );

  const toggleSecondary = (t: TradeCategory) => {
    if (t === primaryTrade) return;
    setSecondary((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
    );
  };

  const submit = async () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      return setError('Complete your personal details.');
    }
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (!businessName.trim()) return setError('Enter your business name.');
    if (!primaryTrade) return setError('Select your primary trade.');
    if (primaryRegulated && !licenceNumber.trim()) {
      return setError(`${tradeMeta(primaryTrade).label} is regulated — a licence number is required.`);
    }

    const qualifications: Qualification[] = primaryRegulated
      ? [
          {
            trade: primaryTrade,
            licenceNumber: licenceNumber.trim(),
            expiry: licenceExpiry.trim() || undefined,
            details: 'Submitted at registration',
          },
        ]
      : [];

    try {
      setBusy(true);
      await registerTradie({
        firstName,
        lastName,
        email,
        password,
        businessName,
        tradingName: tradingName || undefined,
        yearsExperience: parseInt(years, 10) || 0,
        nzbn: nzbn || undefined,
        primaryTrade,
        secondaryTrades: secondary,
        qualifications,
        serviceRadiusKm,
      });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Txt style={styles.back}>‹ Back</Txt>
          </Pressable>

          <View style={{ gap: spacing.xs, marginTop: spacing.lg }}>
            <Txt style={styles.title}>Join as a tradie</Txt>
            <Txt style={styles.subtitle}>
              Your account stays pending until an admin verifies your details.
            </Txt>
          </View>

          {/* Personal */}
          <Section title="Personal">
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field label="First name" placeholder="Mia" value={firstName} onChangeText={setFirst} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Last name" placeholder="Wallace" value={lastName} onChangeText={setLast} />
              </View>
            </View>
            <Field
              label="Email"
              placeholder="you@business.co.nz"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Field
              label="Password"
              placeholder="At least 6 characters"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </Section>

          {/* Business */}
          <Section title="Business">
            <Field label="Business name" placeholder="Bright Spark Electrical" value={businessName} onChangeText={setBusinessName} />
            <Field label="Trading name (optional)" placeholder="Bright Spark" value={tradingName} onChangeText={setTradingName} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field label="Years experience" placeholder="8" keyboardType="number-pad" value={years} onChangeText={setYears} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="NZBN (optional)" placeholder="9429…" keyboardType="number-pad" value={nzbn} onChangeText={setNzbn} />
              </View>
            </View>
          </Section>

          {/* Primary trade */}
          <Section title="Primary trade">
            <View style={styles.chips}>
              {TRADES.map((t) => (
                <Chip
                  key={t.key}
                  label={t.label}
                  emoji={t.emoji}
                  selected={primaryTrade === t.key}
                  onPress={() => {
                    setPrimaryTrade(t.key);
                    setSecondary((cur) => cur.filter((x) => x !== t.key));
                  }}
                />
              ))}
            </View>
          </Section>

          {/* Secondary trades */}
          <Section title="Secondary trades (optional)">
            <View style={styles.chips}>
              {TRADES.filter((t) => t.key !== primaryTrade).map((t) => (
                <Chip
                  key={t.key}
                  label={t.label}
                  emoji={t.emoji}
                  selected={secondary.includes(t.key)}
                  onPress={() => toggleSecondary(t.key)}
                />
              ))}
            </View>
          </Section>

          {/* Qualifications for regulated trades */}
          {primaryRegulated && (
            <Section title="Licence & qualifications">
              <View style={styles.regBanner}>
                <Txt style={styles.regText}>
                  {tradeMeta(primaryTrade!).emoji} {tradeMeta(primaryTrade!).label} is a regulated
                  trade. A licence number is required for verification.
                </Txt>
              </View>
              <Field label="Licence number" placeholder="EWRB-104882" value={licenceNumber} onChangeText={setLicenceNumber} />
              <Field label="Licence expiry (optional)" placeholder="2027-06-30" value={licenceExpiry} onChangeText={setLicenceExpiry} />
              <Txt style={styles.uploadHint}>
                📎 Certificate & insurance upload will be requested during admin review.
              </Txt>
            </Section>
          )}

          {/* Service radius */}
          <Section title="Service radius">
            <Txt style={styles.radiusLabel}>How far will you travel for a job?</Txt>
            <View style={styles.chips}>
              {RADIUS_OPTIONS.map((km) => (
                <Chip
                  key={km}
                  label={`${km} km`}
                  selected={serviceRadiusKm === km}
                  onPress={() => setRadius(km)}
                />
              ))}
            </View>
          </Section>

          {error && <Txt style={styles.error}>{error}</Txt>}
          <Button title="Submit application" loading={busy} onPress={submit} />

          <Pressable
            onPress={() => router.replace('/(auth)/login')}
            style={{ alignItems: 'center', paddingVertical: spacing.md }}
          >
            <Txt style={styles.link}>
              Already registered? <Txt style={styles.linkBold}>Log in</Txt>
            </Txt>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Txt style={styles.sectionTitle}>{title}</Txt>
      <View style={{ gap: spacing.md }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy },
  content: { padding: spacing.xl, gap: spacing.lg, flexGrow: 1 },
  back: { color: colors.onNavyMuted, fontSize: font.size.md, fontWeight: font.weight.semibold },
  title: { fontSize: font.size.display, fontWeight: font.weight.heavy, color: colors.white },
  subtitle: { fontSize: font.size.sm, color: colors.onNavyMuted, lineHeight: 20 },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  regBanner: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: spacing.md },
  regText: { color: colors.amberDark, fontSize: font.size.sm, fontWeight: font.weight.medium, lineHeight: 19 },
  uploadHint: { color: colors.textFaint, fontSize: font.size.xs },
  radiusLabel: { color: colors.textMuted, fontSize: font.size.sm },
  error: { color: colors.danger, fontSize: font.size.sm, fontWeight: font.weight.semibold, textAlign: 'center' },
  link: { color: colors.onNavyMuted, fontSize: font.size.sm },
  linkBold: { color: colors.amber, fontWeight: font.weight.bold, fontSize: font.size.sm },
});
