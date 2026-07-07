import { Tabs } from 'expo-router';
import { TabBarIcon } from '../../../src/components/TabBarIcon';
import { colors, font } from '../../../src/theme';

export default function CustomerTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 88,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: font.size.xs, fontWeight: font.weight.semibold },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabBarIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ focused }) => <TabBarIcon emoji="📋" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ focused }) => <TabBarIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
