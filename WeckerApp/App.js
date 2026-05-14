import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { setupNotifications } from './src/utils/notifications';
import AlarmListScreen from './src/screens/AlarmListScreen';
import AddAlarmScreen from './src/screens/AddAlarmScreen';
import StatsScreen from './src/screens/StatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { COLORS } from './src/constants/theme';

// Stack-Navigator für Alarm-Screen + AddAlarm-Screen
const AlarmStack = createNativeStackNavigator();
function AlarmStackNavigator() {
  return (
    <AlarmStack.Navigator screenOptions={{ headerShown: false }}>
      <AlarmStack.Screen name="AlarmList" component={AlarmListScreen} />
      <AlarmStack.Screen
        name="AddAlarm"
        component={AddAlarmScreen}
        // Slide-from-bottom Animation beim Öffnen
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
    </AlarmStack.Navigator>
  );
}

// Bottom Tab Navigator
const Tab = createBottomTabNavigator();

export default function App() {
  // Notifications beim Start der App einrichten
  useEffect(() => {
    setupNotifications();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              // Tab-Bar Design
              tabBarStyle: styles.tabBar,
              tabBarActiveTintColor: COLORS.tabActive,
              tabBarInactiveTintColor: COLORS.tabInactive,
              tabBarLabelStyle: styles.tabLabel,
              // Animiertes Tab-Icon
              tabBarIcon: ({ color, focused }) => {
                const icons = {
                  Wecker: '⏰',
                  Hinzufügen: '＋',
                  Statistiken: '📊',
                  Einstellungen: '⚙️',
                };
                return (
                  <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
                    <Text style={[styles.tabEmoji, { opacity: focused ? 1 : 0.6 }]}>
                      {icons[route.name]}
                    </Text>
                  </View>
                );
              },
            })}
          >
            <Tab.Screen name="Wecker" component={AlarmStackNavigator} />
            <Tab.Screen
              name="Hinzufügen"
              component={AddAlarmScreen}
              listeners={({ navigation }) => ({
                tabPress: (e) => {
                  e.preventDefault();
                  navigation.navigate('Wecker', {
                    screen: 'AddAlarm',
                    params: { alarm: null },
                  });
                },
              })}
            />
            <Tab.Screen name="Statistiken" component={StatsScreen} />
            <Tab.Screen name="Einstellungen" component={SettingsScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.tabBackground,
    borderTopWidth: 0,
    // Glassmorphism-ähnlicher Schatten
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 20,
    height: 70,
    paddingBottom: 10,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  tabIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  tabIconActive: {
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
  },
  tabEmoji: {
    fontSize: 22,
  },
});
