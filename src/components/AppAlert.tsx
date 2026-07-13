/**
 * Branded in-app alert — a drop-in replacement for React Native's Alert.alert
 * (same signature), rendered in the app's own theme instead of the OS dialog.
 * Mount <AppAlertHost/> once at the root; call appAlert(...) anywhere.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { Txt } from './ui';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface Pending {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

let push: ((p: Pending) => void) | null = null;

export function appAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  const btns = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  if (!push) {
    // Host not mounted yet (very early startup) — fall back to the OS dialog.
    Alert.alert(title, message, btns);
    return;
  }
  push({ title, message, buttons: btns });
}

export function AppAlertHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    push = setPending;
    return () => {
      push = null;
    };
  }, []);

  const fire = (b: AlertButton) => {
    setPending(null);
    // Let the modal dismiss before the action runs (mirrors native behaviour).
    setTimeout(() => b.onPress?.(), 50);
  };

  const cancel = () => {
    const cancelBtn = pending?.buttons.find((b) => b.style === 'cancel');
    setPending(null);
    if (cancelBtn) setTimeout(() => cancelBtn.onPress?.(), 50);
  };

  if (!pending) return null;

  // Native convention: cancel first at the bottom-left; primary at the right.
  const ordered = [...pending.buttons].sort(
    (a, b) => (a.style === 'cancel' ? -1 : 0) - (b.style === 'cancel' ? -1 : 0),
  );

  return (
    <Modal transparent visible animationType="fade" onRequestClose={cancel}>
      <Pressable style={styles.backdrop} onPress={cancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Txt variant="heading" style={{ textAlign: 'center' }}>
            {pending.title}
          </Txt>
          {pending.message ? (
            <Txt variant="body" color={colors.textMuted} style={styles.msg}>
              {pending.message}
            </Txt>
          ) : null}
          <View style={ordered.length > 2 ? styles.colActions : styles.rowActions}>
            {ordered.map((b, i) => {
              const isCancel = b.style === 'cancel';
              const isDanger = b.style === 'destructive';
              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  onPress={() => fire(b)}
                  style={[
                    styles.btn,
                    ordered.length <= 2 && { flex: 1 },
                    isCancel
                      ? styles.btnGhost
                      : isDanger
                        ? { backgroundColor: colors.danger }
                        : { backgroundColor: colors.amber },
                  ]}
                >
                  <Txt
                    variant="label"
                    color={isCancel ? colors.text : isDanger ? colors.white : colors.navy}
                    style={{ textAlign: 'center' }}
                  >
                    {b.text}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,18,32,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 380,
    gap: spacing.md,
  },
  msg: { textAlign: 'center', lineHeight: 21 },
  rowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  colActions: { gap: spacing.sm, marginTop: spacing.xs },
  btn: {
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
  },
  btnGhost: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line },
});
