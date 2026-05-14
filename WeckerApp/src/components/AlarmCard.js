import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS, FONT_SIZE, BORDER_RADIUS, SPACING, SHADOWS } from '../constants/theme';
import { formatTime } from '../utils/notifications';

const DAY_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

// Wecker-Karte in der Liste
// Zeigt Zeit, Label, Wochentage, Sound und On/Off-Toggle
export default function AlarmCard({ alarm, onToggle, onEdit, onDelete }) {
  // Animation für Lösch-Feedback (Slide-Out)
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  function handleDelete() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    // Slide-Out Animation bevor gelöscht wird
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -400,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => onDelete(alarm.id));
  }

  // Anzeige der Wochentage: z.B. "Mo, Di, Fr" oder "Täglich" oder "Einmalig"
  function getDayLabel() {
    if (alarm.days.length === 0) return 'Einmalig';
    if (alarm.days.length === 7) return 'Täglich';
    if (alarm.days.length === 5 && !alarm.days.includes(0) && !alarm.days.includes(6)) {
      return 'Werktags';
    }
    return alarm.days
      .sort((a, b) => a - b)
      .map((d) => DAY_LABELS[d])
      .join(', ');
  }

  return (
    <Animated.View
      style={[
        styles.card,
        !alarm.enabled && styles.cardDisabled,
        {
          transform: [{ translateX: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      {/* Linker farbiger Balken zeigt ob Wecker aktiv ist */}
      <View style={[styles.indicator, alarm.enabled && styles.indicatorActive]} />

      {/* Mittlerer Bereich: Uhrzeit + Details */}
      <TouchableOpacity style={styles.content} onPress={() => onEdit(alarm)} activeOpacity={0.7}>
        <Text style={[styles.timeText, !alarm.enabled && styles.textDisabled]}>
          {formatTime(alarm.hours, alarm.minutes)}
        </Text>

        <Text style={[styles.labelText, !alarm.enabled && styles.textDisabled]}>
          {alarm.label}
        </Text>

        <View style={styles.detailsRow}>
          <Text style={styles.detailChip}>{getDayLabel()}</Text>
          <Text style={styles.detailChip}>🔊 {alarm.sound?.name || 'Standard'}</Text>
          <Text style={styles.detailChip}>💤 {alarm.snoozeMinutes} Min</Text>
        </View>
      </TouchableOpacity>

      {/* Rechter Bereich: Toggle + Löschen */}
      <View style={styles.actions}>
        <Switch
          value={alarm.enabled}
          onValueChange={() => {
            Haptics.selectionAsync();
            onToggle(alarm.id);
          }}
          trackColor={{ false: '#D1D5DB', true: COLORS.primaryLight }}
          thumbColor={alarm.enabled ? COLORS.primary : '#F3F4F6'}
        />
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteIcon}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.glass,
    borderRadius: BORDER_RADIUS.lg,
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
    ...SHADOWS.soft,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  indicator: {
    width: 4,
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    backgroundColor: COLORS.primary,
  },
  content: {
    flex: 1,
    padding: SPACING.md,
  },
  timeText: {
    fontSize: 38,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -1,
    lineHeight: 42,
  },
  labelText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 8,
  },
  textDisabled: {
    color: COLORS.textLight,
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailChip: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  actions: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: SPACING.sm,
    gap: SPACING.sm,
  },
  deleteBtn: {
    padding: SPACING.sm,
  },
  deleteIcon: {
    fontSize: 18,
  },
});
