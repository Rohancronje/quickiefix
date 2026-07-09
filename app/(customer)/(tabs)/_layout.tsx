import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBarIcon } from '../../../src/components/TabBarIcon';
import { colors, font } from '../../../src/theme';

export default function CustomerTabs() {
  // Reserve the bottom inset so the tab bar clears the Android system nav bar
  // (the app draws edge-to-edge on SDK 54).
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 64 + insets.bottom,
          paddingTop: 10,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
        tabBarLabelStyle: { fontSize: font.size.xs, fontWeight: font.weight.bold, marginTop: 4 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon active="home" inactive="home-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon active="reader" inactive="reader-outline" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon active="person" inactive="person-outline" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
