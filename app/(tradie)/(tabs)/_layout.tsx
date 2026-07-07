import { Tabs } from 'expo-router';
import { TabBarIcon } from '../../../src/components/TabBarIcon';
import { colors, font } from '../../../src/theme';

export default function TradieTabs() {
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
        name="dashboard"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ focused }) => <TabBarIcon emoji="🧰" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="timesheets"
        options={{
          title: 'Timesheets',
          tabBarIcon: ({ focused }) => <TabBarIcon emoji="🧾" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabBarIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
