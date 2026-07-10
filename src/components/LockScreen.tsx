/**
 * Biometric app lock. Shown over everything when a restored session is locked
 * (the user fully closed the app with biometric unlock enabled). Auto-prompts
 * on mount; "Use password instead" signs out to the normal login screen.
 */
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme';
import { Button, Txt } from './ui';

export function LockScreen() {
  const { user, unlock, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const tryUnlock = async () => {
    setBusy(true);
    const ok = await unlock();
    setBusy(false);
    if (!ok) setFailed(true);
  };

  // Bring up the OS biometric sheet as soon as the screen appears.
  useEffect(() => {
    tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Image
          source={require('../../assets/logo-light.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Txt style={{ fontSize: 44 }}>🔒</Txt>
        <Txt variant="heading" color={colors.white} style={{ textAlign: 'center' }}>
          {user ? `Welcome back, ${user.firstName}` : 'Welcome back'}
        </Txt>
        <Txt variant="caption" color={colors.onNavyMuted} style={{ textAlign: 'center' }}>
          {failed
            ? "Biometric check didn't go through — try again or sign in with your password."
            : 'Unlock with your fingerprint or face to continue.'}
        </Txt>
      </View>

      <View style={styles.actions}>
        <Button title="Unlock" icon="🔓" loading={busy} onPress={tryUnlock} />
        <Button
          title="Use password instead"
          kind="ghost"
          textColor={colors.onNavy}
          style={styles.ghost}
          onPress={logout}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy, padding: spacing.xl, justifyContent: 'space-between' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  logo: { height: 90, width: 220 },
  actions: { gap: spacing.md },
  ghost: { backgroundColor: colors.navyCard, borderColor: colors.navyLine },
});
