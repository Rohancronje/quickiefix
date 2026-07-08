import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMessages } from '../hooks/useData';
import { containsContactInfo } from '../lib/mask';
import { backend } from '../services';
import { colors, font, radius, spacing } from '../theme';
import { Button, Card, Field, Txt } from './ui';

/**
 * In-app job messaging with contact-detail masking (Pilot Spec §7). Keeps the
 * conversation on-platform: phone numbers / emails / handles are redacted on send.
 */
export function MessageThread({
  jobId,
  from,
}: {
  jobId: string;
  from: { role: 'customer' | 'tradie'; id: string; name: string };
}) {
  const messages = useMessages(jobId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const warn = containsContactInfo(text);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    await backend.sendMessage(jobId, from, t).catch(() => {});
    setText('');
    setSending(false);
  };

  return (
    <Card style={{ gap: spacing.sm }}>
      <Txt variant="label">💬 Messages</Txt>
      <Txt variant="caption" color={colors.textFaint}>
        Keep it on QuickieFix — phone numbers and emails are hidden for everyone's safety.
      </Txt>

      <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
        {messages.length === 0 ? (
          <Txt variant="caption" color={colors.textMuted}>
            No messages yet. Say hello or share access details.
          </Txt>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === from.id;
            return (
              <View
                key={m.id}
                style={[styles.bubble, mine ? styles.mine : styles.theirs]}
              >
                {!mine && (
                  <Txt variant="caption" color={colors.textMuted} style={{ fontWeight: '700' }}>
                    {m.senderName}
                  </Txt>
                )}
                <Txt variant="body" color={mine ? colors.white : colors.text}>
                  {m.text}
                </Txt>
              </View>
            );
          })
        )}
      </View>

      {warn && (
        <Txt variant="caption" color={colors.amberDark}>
          Contact details will be hidden when you send.
        </Txt>
      )}
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field placeholder="Message…" value={text} onChangeText={setText} multiline />
        </View>
        <Button title="Send" small fullWidth={false} loading={sending} disabled={!text.trim()} onPress={send} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: radius.md, padding: spacing.sm, maxWidth: '85%' },
  mine: { backgroundColor: colors.navy, alignSelf: 'flex-end' },
  theirs: { backgroundColor: colors.surfaceAlt, alignSelf: 'flex-start' },
});
