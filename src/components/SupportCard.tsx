/**
 * In-platform support: raise a ticket from the app — it lands in the back
 * office and emails the ops inbox. Keeps ALL communication on the platform.
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { backend } from '../services';
import { colors, spacing } from '../theme';
import { AppUser } from '../types';
import { Button, Card, Field, Txt } from './ui';

export function SupportCard({ user }: { user: AppUser }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!subject.trim() || !detail.trim()) return;
    setBusy(true);
    try {
      await backend.fileSupportTicket(
        {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role === 'tradie' ? 'tradie' : 'customer',
        },
        subject,
        detail,
      );
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Card style={{ alignItems: 'center', gap: spacing.xs }}>
        <Txt style={{ fontSize: 30 }}>🛟</Txt>
        <Txt variant="label">We're on it</Txt>
        <Txt variant="caption" color={colors.textMuted} style={{ textAlign: 'center' }}>
          Your message has reached the QuickieFix team — we'll come back to you here or by email.
        </Txt>
      </Card>
    );
  }

  if (!open) {
    return (
      <Card style={{ gap: spacing.sm }}>
        <Txt variant="label">🛟 Help & support</Txt>
        <Txt variant="caption" color={colors.textMuted}>
          Questions, issues or feedback — message the QuickieFix team directly.
        </Txt>
        <Button title="Contact QuickieFix" kind="secondary" small onPress={() => setOpen(true)} />
      </Card>
    );
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <Txt variant="label">🛟 Contact QuickieFix</Txt>
      <Field label="Subject" placeholder="What's it about?" value={subject} onChangeText={setSubject} />
      <Field
        label="Message"
        placeholder="Tell us what's going on…"
        value={detail}
        onChangeText={setDetail}
        multiline
        numberOfLines={4}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" kind="ghost" small onPress={() => setOpen(false)} />
        </View>
        <View style={{ flex: 2 }}>
          <Button
            title="Send"
            small
            loading={busy}
            disabled={!subject.trim() || !detail.trim()}
            onPress={send}
          />
        </View>
      </View>
    </Card>
  );
}
