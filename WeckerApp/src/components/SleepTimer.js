import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { calcSleepDuration } from '../utils/stats';
import { COLORS, FONT_SIZE, SPACING, BORDER_RADIUS } from '../constants/theme';

// Zeigt an wie viele Stunden Schlaf der Nutzer bekommt
// Wird auf dem AddAlarmScreen und der AlarmCard verwendet
export default function SleepTimer({ hours: alarmHours, minutes: alarmMinutes, compact = false }) {
  const { hours, minutes } = calcSleepDuration(alarmHours, alarmMinutes);

  // Icon je nach Schlafdauer: Mond = wenig Schlaf, Sonne = gut
  const icon = hours >= 7 ? '☀️' : hours >= 5 ? '🌙' : '😴';
  // Bewertung der Schlafdauer
  const quality = hours >= 7 ? 'Optimal' : hours >= 5 ? 'Okay' : 'Zu wenig';
  const qualityColor = hours >= 7 ? COLORS.success : hours >= 5 ? COLORS.warning : COLORS.danger;

  if (compact) {
    // Kurze Version für die Alarm-Karte
    return (
      <View style={styles.compact}>
        <Text style={styles.compactIcon}>{icon}</Text>
        <Text style={styles.compactText}>
          {hours}h {minutes}min Schlaf
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.label}>Schlafzeit</Text>
        <Text style={styles.duration}>
          {hours}h {minutes}min
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: qualityColor + '22' }]}>
        <Text style={[styles.badgeText, { color: qualityColor }]}>{quality}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(124,58,237,0.06)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.12)',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(124,58,237,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  info: { flex: 1 },
  label: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  duration: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  badgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  // Kompakt-Version
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactIcon: { fontSize: 12 },
  compactText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
});
