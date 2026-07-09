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
import { backend } from '../../src/services';
import { colors, font, spacing } from '../../src/theme';

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    try {
      setBusy(true);
      await login(email, password);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const forgotPassword = async () => {
    if (resetting) return;
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Enter your email above first, then tap “Forgot password”.');
      return;
    }
    try {
      setResetting(true);
      await backend.resetPassword(email);
      setInfo('If an account exists for that email, we’ve sent a reset link. Check your inbox (and spam).');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setResetting(false);
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
            <Txt style={styles.title}>Welcome back</Txt>
            <Txt style={styles.subtitle}>Log in to continue.</Txt>
          </View>

          <View style={styles.card}>
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
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {error && <Txt style={styles.error}>{error}</Txt>}
            {info && <Txt style={styles.info}>{info}</Txt>}
            <Button title="Log in" loading={busy} onPress={submit} />
            <Pressable onPress={forgotPassword} disabled={resetting} hitSlop={8} style={{ alignSelf: 'center' }}>
              <Txt style={styles.forgot}>{resetting ? 'Sending…' : 'Forgot password?'}</Txt>
            </Pressable>
          </View>

          <Pressable
            onPress={() => router.replace('/(auth)/register')}
            style={{ alignItems: 'center', paddingVertical: spacing.md }}
          >
            <Txt style={styles.link}>
              New here? <Txt style={styles.linkBold}>Create an account</Txt>
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
  error: { color: colors.danger, fontSize: font.size.sm, fontWeight: font.weight.medium },
  info: { color: colors.success, fontSize: font.size.sm, fontWeight: font.weight.medium },
  forgot: { color: colors.amberDark, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  link: { color: colors.onNavyMuted, fontSize: font.size.sm },
  linkBold: { color: colors.amber, fontWeight: font.weight.bold, fontSize: font.size.sm },
});
