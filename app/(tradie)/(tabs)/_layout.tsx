import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RequestAlert } from '../../../src/components/RequestAlert';
import { NewJobTabButton, TabBarIcon } from '../../../src/components/TabBarIcon';
import { useAuth } from '../../../src/context/AuthContext';
import { useJobOffers } from '../../../src/hooks/useData';
import { colors, font } from '../../../src/theme';

export default function TradieTabs() {
  // Use the non-throwing auth hook: on logout the user briefly becomes null
  // before the route guard redirects, and a layout must tolerate that.
  const { user } = useAuth();
  // Android draws edge-to-edge (SDK 54), so reserve the bottom inset for the
  // system nav bar — otherwise the tab bar sits under the nav buttons.
  const insets = useSafeAreaInsets();
  const tradieId = user?.role === 'tradie' ? user.id : undefined;
  const offers = useJobOffers(tradieId);
  const pending = offers.length;

  return (
    <View style={{ flex: 1 }}>
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
          name="dashboard"
          options={{
            title: 'Home',
            tabBarBadge: pending > 0 ? pending : undefined,
            tabBarBadgeStyle: { backgroundColor: colors.danger, fontSize: 11 },
            tabBarIcon: ({ focused }) => (
              <TabBarIcon active="home" inactive="home-outline" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="timesheets"
          options={{
            title: 'Timesheets',
            tabBarIcon: ({ focused }) => (
              <TabBarIcon active="receipt" inactive="receipt-outline" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="new-job-launcher"
          options={{
            title: 'New Job',
            tabBarButton: () => <NewJobTabButton />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused }) => (
              <TabBarIcon active="person" inactive="person-outline" focused={focused} />
            ),
          }}
        />
      </Tabs>

      {/* Loud, global in-app alert for incoming direct requests */}
      <RequestAlert offers={offers} />
    </View>
  );
}
