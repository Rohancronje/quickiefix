/**
 * "Biometric unlock" setting. Renders nothing when the device (or this build)
 * can't do biometrics, so it's safe everywhere. Enabling requires one
 * successful fingerprint/face check — proof the enrolled biometric works.
 */
import React, { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import {
  biometricsAvailable,
  biometricUnlock,
  isBiolockEnabled,
  setBiolockEnabled,
} from '../lib/biometrics';
import { colors, spacing } from '../theme';
import { Card, Txt } from './ui';

export function BiometricToggle() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      setAvailable(await biometricsAvailable());
      setEnabled(await isBiolockEnabled());
    })();
  }, []);

  if (!available) return null;

  const toggle = async (value: boolean) => {
    if (value) {
      // Verify a biometric actually works before trusting it as the lock.
      const ok = await biometricUnlock('Confirm fingerprint / face to enable');
      if (!ok) return;
    }
    await setBiolockEnabled(value);
    setEnabled(value);
  };

  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label">🔒 Biometric unlock</Txt>
        <Txt variant="caption" color={colors.textMuted}>
          Require your fingerprint or face whenever the app is reopened after being closed.
        </Txt>
      </View>
      <Switch
        value={enabled}
        onValueChange={toggle}
        trackColor={{ true: colors.success, false: colors.line }}
        thumbColor={colors.white}
      />
    </Card>
  );
}
