import { View, Pressable, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, shadow } from './theme';
import { MainTabParamList } from './navigation';
import HomeScreen from './screens/HomeScreen';
import HistoryScreen from './screens/HistoryScreen';
import ProfileScreen from './screens/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Never rendered — the ScanTab press is intercepted and routed to ScanSetup. */
function NullScreen() {
  return null;
}

/** The raised accent camera button in the middle of the tab bar. */
function ScanTabButton({ onPress }: BottomTabBarButtonProps) {
  return (
    <View style={styles.scanSlot}>
      <Pressable
        onPress={onPress ?? undefined}
        accessibilityRole="button"
        accessibilityLabel="Start a scan"
        style={({ pressed }) => [styles.scanBtn, pressed && { transform: [{ translateY: -14 }, { scale: 0.96 }] }]}
      >
        <Feather name="camera" size={24} color={colors.onDark} />
      </Pressable>
    </View>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
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
        name="ScanTab"
        component={NullScreen}
        options={{
          tabBarLabel: 'Scan',
          tabBarButton: (props) => <ScanTabButton {...props} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.getParent()?.navigate('ScanSetup'); // the root stack owns the scan flow
          },
        })}
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
  );
}

const styles = StyleSheet.create({
  scanSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -14 }],
    ...shadow.lift,
  },
});
