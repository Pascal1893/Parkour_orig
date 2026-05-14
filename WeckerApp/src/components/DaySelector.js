import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS, FONT_SIZE, SHADOWS } from '../constants/theme';

// Wochentage auf Deutsch (Kurzform)
// Index: 0=Sonntag, 1=Montag, ..., 6=Samstag (entspricht JS Date.getDay())
const DAYS = [
  { label: 'So', index: 0 },
  { label: 'Mo', index: 1 },
  { label: 'Di', index: 2 },
  { label: 'Mi', index: 3 },
  { label: 'Do', index: 4 },
  { label: 'Fr', index: 5 },
  { label: 'Sa', index: 6 },
];

// selectedDays: Array mit Zahlen 0-6 (aktive Wochentage)
// onChange: Funktion die das neue Array bekommt
export default function DaySelector({ selectedDays = [], onChange }) {
  function toggleDay(index) {
    Haptics.selectionAsync(); // Leichtes haptisches Feedback
    const updated = selectedDays.includes(index)
      ? selectedDays.filter((d) => d !== index)
      : [...selectedDays, index];
    onChange(updated);
  }

  return (
    <View style={styles.container}>
      {DAYS.map(({ label, index }) => {
        const isSelected = selectedDays.includes(index);
        return (
          <TouchableOpacity
            key={index}
            onPress={() => toggleDay(index)}
            style={[styles.day, isSelected && styles.daySelected]}
            activeOpacity={0.7}
          >
            <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  day: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 58, 237, 0.15)',
  },
  daySelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    ...SHADOWS.soft,
  },
  dayText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  dayTextSelected: {
    color: '#FFFFFF',
  },
});
