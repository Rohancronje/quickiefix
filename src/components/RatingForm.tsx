import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Rating } from '../types';
import { StarRating } from './StarRating';
import { Button, Chip, Field, Txt } from './ui';

/** Collects a star rating, optional tags and a review, then emits a Rating. */
export function RatingForm({
  title,
  subtitle,
  tags,
  submitLabel = 'Submit rating',
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  tags: string[];
  submitLabel?: string;
  onSubmit: (rating: Rating) => void | Promise<void>;
}) {
  const [stars, setStars] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (t: string) =>
    setSelected((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const submit = async () => {
    if (stars === 0) return;
    setBusy(true);
    await onSubmit({ stars, tags: selected, review: review.trim() || undefined, at: Date.now() });
    setBusy(false);
  };

  return (
    <View style={styles.card}>
      <View style={{ gap: 2 }}>
        <Txt variant="heading">{title}</Txt>
        {subtitle && (
          <Txt variant="caption" color={colors.textMuted}>
            {subtitle}
          </Txt>
        )}
      </View>

      <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
        <StarRating value={stars} onChange={setStars} size={40} />
      </View>

      <View style={styles.chips}>
        {tags.map((t) => (
          <Chip key={t} label={t} selected={selected.includes(t)} onPress={() => toggle(t)} />
        ))}
      </View>

      <Field
        placeholder="Add a comment (optional)"
        value={review}
        onChangeText={setReview}
        multiline
        style={{ height: 90, textAlignVertical: 'top' }}
      />

      <Button title={submitLabel} disabled={stars === 0} loading={busy} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
