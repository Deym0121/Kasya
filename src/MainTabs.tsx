import { View, Pressable, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, shadow } from './theme';
import { MainTabParamList, RootStackParamList } from './navigation';
import HomeScreen from './screens/HomeScreen';
import RacesScreen from './screens/RacesScreen';
import HistoryScreen from './screens/HistoryScreen';
import ProfileScreen from './screens/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_BAR_HEIGHT = 56;

export default function MainTabs() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: TAB_BAR_HEIGHT + insets.bottom },
          // Labels stay on for every tab: the scan entry point is the floating
          // button below, so no slot needs a label-less custom tabBarButton.
          tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
          sceneStyle: { backgroundColor: colors.bg },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
          }}
        />
        <Tab.Screen
          name="Races"
          component={RacesScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Feather name="flag" size={size} color={color} />,
          }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Feather name="clock" size={size} color={color} />,
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
          }}
        />
      </Tab.Navigator>

      {/* Floating scan button — anchored to the bottom-right corner, above the bar.
          The lift comes from LAYOUT (absolute right/bottom offsets), never a
          translateY transform: RN drops touches that land outside a parent's
          layout bounds, so a transform-raised circle would leave its top edge
          dead to taps. The pressed scale is purely visual and shrinks inward,
          so it never pushes the hit area outside those bounds. */}
      <Pressable
        onPress={() => navigation.navigate('ScanSetup')}
        accessibilityRole="button"
        accessibilityLabel="Start a scan"
        style={({ pressed }) => [
          styles.fab,
          { bottom: TAB_BAR_HEIGHT + insets.bottom + 18 },
          pressed && { transform: [{ scale: 0.95 }] },
        ]}
      >
        <View style={styles.fabRing}>
          <Feather name="camera" size={26} color={colors.onDark} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lift,
  },
  fabRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
