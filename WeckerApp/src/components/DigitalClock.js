import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONT_SIZE } from '../constants/theme';

// Lebendige Digitaluhr auf dem Hauptscreen
// Zeigt die aktuelle Zeit mit sanfter Puls-Animation bei jedem Sekunden-Wechsel
export default function DigitalClock() {
  const [time, setTime] = useState(new Date());
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Uhr jede Sekunde aktualisieren
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
      // Sanfter Puls bei jedem Tick
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.015,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const hours = String(time.getHours()).padStart(2, '0');
  const minutes = String(time.getMinutes()).padStart(2, '0');
  const seconds = String(time.getSeconds()).padStart(2, '0');

  // Wochentag und Datum auf Deutsch
  const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const dateStr = `${weekdays[time.getDay()]}, ${time.getDate()}. ${months[time.getMonth()]}`;

  return (
    <View style={styles.container}>
      {/* Datum */}
      <Text style={styles.dateText}>{dateStr}</Text>

      {/* Uhrzeit mit Puls-Animation */}
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <LinearGradient
          colors={['#7C3AED', '#3B82F6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientWrapper}
        >
          {/* Der Gradient wird als Maske für den Text verwendet */}
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{hours}</Text>
            <Text style={styles.colon}>:</Text>
            <Text style={styles.timeText}>{minutes}</Text>
            <Text style={styles.seconds}>{seconds}</Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  dateText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  gradientWrapper: {
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 72,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -2,
    lineHeight: 76,
  },
  colon: {
    fontSize: 60,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
    marginHorizontal: 2,
  },
  seconds: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
    marginLeft: 4,
  },
});
