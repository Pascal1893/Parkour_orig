import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { loadStats } from '../utils/stats';
import { COLORS, FONT_SIZE, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';

const WEEK_DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// Statistik-Screen: Streak, Wochenübersicht, Gesamtstatistiken
export default function StatsScreen() {
  const [stats, setStats] = useState(null);

  // Animationen
  const streakAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;

  // Statistiken neu laden wenn Tab geöffnet wird
  useFocusEffect(
    useCallback(() => {
      loadStats().then((data) => {
        setStats(data);
        // Animations beim Laden starten
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.spring(streakAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
          Animated.timing(ringAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
        ]).start();
      });
    }, [])
  );

  // Prozentualer Anteil pünktlicher Dismissals
  const onTimeRate = stats?.totalDismissals > 0
    ? Math.round((stats.onTimeDismissals / stats.totalDismissals) * 100)
    : 0;

  // Letzte 7 Tage aufbereiten (fehlende Tage als leer)
  function getWeekData() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const found = stats?.weekHistory?.find((h) => h.date === dateStr);
      days.push({
        label: WEEK_DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1],
        status: found ? (found.onTime ? 'good' : 'bad') : 'empty',
      });
    }
    return days;
  }

  return (
    <LinearGradient colors={['#F0F4FF', '#E8EEFF']} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Statistiken</Text>
          <Text style={styles.headerSub}>Deine Aufwach-Performance</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {!stats ? (
            <Text style={styles.loading}>Lade...</Text>
          ) : (
            <Animated.View style={{ opacity: fadeAnim, gap: SPACING.md }}>

              {/* Streak-Karte — Hauptelement */}
              <Animated.View
                style={[
                  styles.streakCard,
                  { transform: [{ scale: streakAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
                ]}
              >
                <LinearGradient
                  colors={['#7C3AED', '#3B82F6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.streakGradient}
                >
                  {/* Glow-Ring hinter der Zahl */}
                  <View style={styles.streakRing}>
                    <View style={styles.streakInner}>
                      <Text style={styles.streakNumber}>{stats.currentStreak}</Text>
                      <Text style={styles.streakLabel}>Tage in Folge</Text>
                    </View>
                  </View>

                  <Text style={styles.streakFire}>
                    {stats.currentStreak >= 7 ? '🔥🔥🔥' : stats.currentStreak >= 3 ? '🔥🔥' : stats.currentStreak >= 1 ? '🔥' : '😴'}
                  </Text>

                  <View style={styles.streakMeta}>
                    <View style={styles.streakMetaItem}>
                      <Text style={styles.streakMetaValue}>{stats.bestStreak}</Text>
                      <Text style={styles.streakMetaLabel}>Beste Serie</Text>
                    </View>
                    <View style={styles.streakMetaDivider} />
                    <View style={styles.streakMetaItem}>
                      <Text style={styles.streakMetaValue}>{onTimeRate}%</Text>
                      <Text style={styles.streakMetaLabel}>Pünktlich</Text>
                    </View>
                    <View style={styles.streakMetaDivider} />
                    <View style={styles.streakMetaItem}>
                      <Text style={styles.streakMetaValue}>{stats.totalDismissals}</Text>
                      <Text style={styles.streakMetaLabel}>Gesamt</Text>
                    </View>
                  </View>
                </LinearGradient>
              </Animated.View>

              {/* Wochenübersicht */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Diese Woche</Text>
                <View style={styles.weekRow}>
                  {getWeekData().map((day, i) => (
                    <View key={i} style={styles.dayCol}>
                      <View
                        style={[
                          styles.dayCicle,
                          day.status === 'good' && styles.dayGood,
                          day.status === 'bad' && styles.dayBad,
                          day.status === 'empty' && styles.dayEmpty,
                        ]}
                      >
                        <Text style={styles.dayCircleIcon}>
                          {day.status === 'good' ? '✓' : day.status === 'bad' ? '💤' : '·'}
                        </Text>
                      </View>
                      <Text style={styles.dayLabel}>{day.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Legende */}
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.success }]} />
                    <Text style={styles.legendText}>Pünktlich</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.warning }]} />
                    <Text style={styles.legendText}>Gesnoozed</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.textLight }]} />
                    <Text style={styles.legendText}>Kein Alarm</Text>
                  </View>
                </View>
              </View>

              {/* Motivations-Nachricht */}
              <View style={styles.motivationCard}>
                <Text style={styles.motivationIcon}>
                  {stats.currentStreak >= 7 ? '🏆' : stats.currentStreak >= 3 ? '💪' : '⭐'}
                </Text>
                <Text style={styles.motivationText}>
                  {stats.currentStreak === 0
                    ? 'Starte heute deine Serie — jeder Champion fängt irgendwo an!'
                    : stats.currentStreak < 3
                    ? `${stats.currentStreak} Tag${stats.currentStreak > 1 ? 'e' : ''} in Folge — weiter so!`
                    : stats.currentStreak < 7
                    ? `${stats.currentStreak} Tage — du bist auf dem richtigen Weg! 💪`
                    : `${stats.currentStreak} Tage! Du bist eine echte Aufwach-Maschine! 🏆`}
                </Text>
              </View>

              {/* Pünktlichkeits-Balken */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Pünktlichkeits-Rate</Text>
                <View style={styles.rateRow}>
                  <View style={styles.rateBar}>
                    <Animated.View
                      style={[
                        styles.rateFill,
                        {
                          width: ringAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', `${onTimeRate}%`],
                          }),
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.rateText}>{onTimeRate}%</Text>
                </View>
                <Text style={styles.rateDesc}>
                  {stats.onTimeDismissals} von {stats.totalDismissals} Alarmen ohne Snooze
                </Text>
              </View>

              <View style={{ height: SPACING.xxl }} />
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
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
  content: {
    padding: SPACING.md,
  },
  loading: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginTop: SPACING.xxl,
  },
  // Streak-Karte
  streakCard: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.glow,
  },
  streakGradient: {
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.md,
  },
  streakRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  streakInner: {
    alignItems: 'center',
  },
  streakNumber: {
    fontSize: 56,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 60,
  },
  streakLabel: {
    fontSize: FONT_SIZE.xs,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  streakFire: {
    fontSize: 32,
  },
  streakMeta: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  streakMetaItem: {
    flex: 1,
    alignItems: 'center',
  },
  streakMetaValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  streakMetaLabel: {
    fontSize: FONT_SIZE.xs,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  streakMetaDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: SPACING.sm,
  },
  // Wochenkarte
  card: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    gap: SPACING.md,
    ...SHADOWS.soft,
  },
  cardTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
    gap: 6,
  },
  dayCicle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayGood: { backgroundColor: COLORS.success },
  dayBad: { backgroundColor: COLORS.warning },
  dayEmpty: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.1)',
    borderStyle: 'dashed',
  },
  dayCircleIcon: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dayLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    gap: SPACING.md,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  // Motivationskarte
  motivationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: 'rgba(124,58,237,0.07)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.15)',
  },
  motivationIcon: { fontSize: 32 },
  motivationText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textPrimary,
    fontWeight: '500',
    lineHeight: 20,
  },
  // Pünktlichkeitsbalken
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  rateBar: {
    flex: 1,
    height: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  rateFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 6,
  },
  rateText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.primary,
    minWidth: 42,
    textAlign: 'right',
  },
  rateDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: -SPACING.sm,
  },
});
