import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, Txt } from '../../src/components/ui';
import { useAuth } from '../../src/context/AuthContext';
import { colors, font, spacing } from '../../src/theme';

export default function RegisterCustomer() {
  const router = useRouter();
  const { registerCustomer } = useAuth();
  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    try {
      setBusy(true);
      await registerCustomer({ firstName, lastName, email, password });
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
            <Txt style={styles.title}>Create account</Txt>
            <Txt style={styles.subtitle}>Get trusted help in minutes.</Txt>
          </View>

          <View style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field label="First name" placeholder="Sam" value={firstName} onChangeText={setFirst} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Last name" placeholder="Taylor" value={lastName} onChangeText={setLast} />
              </View>
            </View>
            <Field
              label="Email"
              placeholder="you@example.com"
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
            {error && <Txt style={styles.error}>{error}</Txt>}
            <Button title="Create account" loading={busy} onPress={submit} />
          </View>

          <Pressable
            onPress={() => router.replace('/(auth)/login')}
            style={{ alignItems: 'center', paddingVertical: spacing.md }}
          >
            <Txt style={styles.link}>
              Already have an account? <Txt style={styles.linkBold}>Log in</Txt>
            </Txt>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy },
  content: { padding: spacing.xl, gap: spacing.md, flexGrow: 1 },
  back: { color: colors.onNavyMuted, fontSize: font.size.md, fontWeight: font.weight.semibold },
  title: { fontSize: font.size.display, fontWeight: font.weight.heavy, color: colors.white },
  subtitle: { fontSize: font.size.md, color: colors.onNavyMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  error: { color: colors.danger, fontSize: font.size.sm, fontWeight: font.weight.medium },
  link: { color: colors.onNavyMuted, fontSize: font.size.sm },
  linkBold: { color: colors.amber, fontWeight: font.weight.bold, fontSize: font.size.sm },
});
