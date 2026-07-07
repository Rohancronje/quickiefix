import React from 'react';
import { Text, View } from 'react-native';

/** Emoji-based tab icon (keeps the app icon-library free for the MVP). */
export function TabBarIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', opacity: focused ? 1 : 0.55 }}>
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
    </View>
  );
}
