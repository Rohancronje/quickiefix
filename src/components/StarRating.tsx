import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '../theme';

/** Read-only or interactive 5-star rating. */
export function StarRating({
  value,
  onChange,
  size = 24,
  readOnly,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.18 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= Math.round(value);
        const star = (
          <Text style={{ fontSize: size, color: filled ? colors.amber : colors.line }}>
            {filled ? '★' : '☆'}
          </Text>
        );
        if (readOnly || !onChange) return <View key={i}>{star}</View>;
        return (
          <Pressable key={i} onPress={() => onChange(i)} hitSlop={6}>
            {star}
          </Pressable>
        );
      })}
    </View>
  );
}
