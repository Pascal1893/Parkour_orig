import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { useAlarms } from '../hooks/useAlarms';
import { scheduleSnooze } from '../utils/notifications';
import { upsertAlarm } from '../utils/storage';
import AlarmCard from '../components/AlarmCard';
import DigitalClock from '../components/DigitalClock';
import AlarmRingModal from '../components/AlarmRingModal';
import { COLORS, FONT_SIZE, SPACING, SHADOWS } from '../constants/theme';

// Hauptscreen: Zeigt die aktuelle Zeit und alle Wecker
export default function AlarmListScreen({ navigation }) {
  const { alarms, loading, saveAlarm, toggleAlarm, deleteAlarm, reloadAlarms } = useAlarms();

  // Wecker neu laden wenn dieser Screen den Fokus bekommt (z.B. nach Zurück-Navigation)
  useFocusEffect(
    useCallback(() => {
      reloadAlarms();
    }, [reloadAlarms])
  );
  const [ringingAlarm, setRingingAlarm] = useState(null); // Aktuell klingelnder Wecker
  const [refreshing, setRefreshing] = useState(false);
  // Animation für neuen Wecker (Fade-In des Headers)
  const headerAnim = useRef(new Animated.Value(0)).current;

  // Header einblenden beim Start
  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // Auf eingehende Notifications hören (wenn App im Vordergrund)
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const { alarmId, type } = notification.request.content.data;
      if (type === 'alarm' && alarmId) {
        // Den passenden Wecker finden und den Ring-Modal öffnen
        const alarm = alarms.find((a) => a.id === alarmId);
        if (alarm) setRingingAlarm(alarm);
      }
    });

    // Wenn der User auf eine Notification tippt (App im Hintergrund)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const { alarmId, type } = response.notification.request.content.data;
      if (type === 'alarm' && alarmId) {
        const alarm = alarms.find((a) => a.id === alarmId);
        if (alarm) setRingingAlarm(alarm);
      }
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, [alarms]);

  async function handleSnooze() {
    if (ringingAlarm) {
      await scheduleSnooze(ringingAlarm);
    }
    setRingingAlarm(null);
  }

  function handleDismiss() {
    setRingingAlarm(null);
  }

  function handleEdit(alarm) {
    navigation.navigate('AddAlarm', { alarm });
  }

  async function onRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }

  // Wecker nach Uhrzeit sortieren
  const sortedAlarms = [...alarms].sort((a, b) => {
    if (a.hours !== b.hours) return a.hours - b.hours;
    return a.minutes - b.minutes;
  });

  return (
    <LinearGradient colors={['#F0F4FF', '#E8EEFF']} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Animierter Header */}
        <Animated.View
          style={[
            styles.header,
            { opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-20, 0],
            }) }] },
          ]}
        >
          <Text style={styles.headerTitle}>Meine Wecker</Text>
          <Text style={styles.headerSub}>
            {alarms.filter((a) => a.enabled).length} aktiv
          </Text>
        </Animated.View>

        {/* Digitaluhr */}
        <DigitalClock />

        {/* Wecker-Liste */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {loading ? (
            <Text style={styles.emptyText}>Laden...</Text>
          ) : sortedAlarms.length === 0 ? (
            // Leerer Zustand
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>⏰</Text>
              <Text style={styles.emptyTitle}>Kein Wecker</Text>
              <Text style={styles.emptyText}>
                Tippe auf das + unten um deinen{'\n'}ersten Wecker zu erstellen
              </Text>
            </View>
          ) : (
            sortedAlarms.map((alarm) => (
              <AlarmCard
                key={alarm.id}
                alarm={alarm}
                onToggle={toggleAlarm}
                onEdit={handleEdit}
                onDelete={deleteAlarm}
              />
            ))
          )}

          {/* Abstand am Ende damit Tab-Bar nichts verdeckt */}
          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Alarm-Klingel-Modal */}
      <AlarmRingModal
        visible={!!ringingAlarm}
        alarm={ringingAlarm}
        onSnooze={handleSnooze}
        onDismiss={handleDismiss}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: SPACING.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    gap: SPACING.sm,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
