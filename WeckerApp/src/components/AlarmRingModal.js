import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import GlassButton from './GlassButton';
import { formatTime } from '../utils/notifications';
import { COLORS, FONT_SIZE, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';

const { width } = Dimensions.get('window');
const WAVE_COUNT = 4; // Anzahl der Puls-Wellen

// Vollbild-Modal das erscheint wenn der Wecker klingelt (App im Vordergrund)
// Zeigt pulsierende Wellen-Animation und Snooze/Dismiss-Buttons
export default function AlarmRingModal({ visible, alarm, onSnooze, onDismiss }) {
  // Animations-Werte für jede einzelne Puls-Welle
  const waveAnims = useRef(
    Array.from({ length: WAVE_COUNT }, () => new Animated.Value(0))
  ).current;

  // Animation für den Uhr-Icon in der Mitte
  const clockBounce = useRef(new Animated.Value(1)).current;
  // Sound-Objekt
  const soundRef = useRef(null);

  useEffect(() => {
    if (visible) {
      startWaveAnimation();
      startClockBounce();
      playAlarmSound();
      // Haptisches Feedback alle 1.5 Sekunden
      const hapticInterval = setInterval(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 1500);
      return () => {
        clearInterval(hapticInterval);
        stopSound();
      };
    } else {
      stopSound();
    }
  }, [visible]);

  // Pulsierende Wellen staggered starten (jede Welle mit Verzögerung)
  function startWaveAnimation() {
    waveAnims.forEach((anim, i) => {
      anim.setValue(0);
      Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration: 2000,
          delay: i * 500, // Jede Welle 500ms versetzt
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        })
      ).start();
    });
  }

  // Uhr-Icon wackelt leicht
  function startClockBounce() {
    Animated.loop(
      Animated.sequence([
        Animated.timing(clockBounce, {
          toValue: 1.1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(clockBounce, {
          toValue: 0.95,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(clockBounce, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        // Pause zwischen Bounces
        Animated.delay(800),
      ])
    ).start();
  }

  async function playAlarmSound() {
    try {
      // Audio-Modus für Alarm setzen (auch wenn Gerät stumm)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      let soundSource;
      if (alarm?.sound?.type === 'custom' && alarm?.sound?.uri) {
        // Eigenen Sound aus der Medienbibliothek abspielen
        soundSource = { uri: alarm.sound.uri };
      } else {
        // Tor-Sound (muss als assets/sounds/goal.mp3 vorhanden sein)
        soundSource = require('../../assets/sounds/goal.mp3');
      }

      const { sound } = await Audio.Sound.createAsync(soundSource, {
        isLooping: true,
        volume: 1.0,
      });
      soundRef.current = sound;
      await sound.playAsync();
    } catch (e) {
      console.warn('Sound konnte nicht abgespielt werden:', e.message);
      // App funktioniert auch ohne Sound
    }
  }

  async function stopSound() {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) {}
      soundRef.current = null;
    }
    // Alle Wellen-Animationen stoppen
    waveAnims.forEach((anim) => anim.stopAnimation());
    clockBounce.stopAnimation();
  }

  function handleSnooze() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    stopSound();
    onSnooze();
  }

  function handleDismiss() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    stopSound();
    onDismiss();
  }

  if (!alarm) return null;

  const timeStr = formatTime(alarm.hours, alarm.minutes);

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <LinearGradient
        colors={['#3B0080', '#7C3AED', '#3B82F6']}
        style={styles.container}
      >
        {/* Pulsierende Wellen im Hintergrund */}
        {waveAnims.map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              styles.wave,
              {
                opacity: anim.interpolate({
                  inputRange: [0, 0.3, 1],
                  outputRange: [0.8, 0.4, 0],
                }),
                transform: [
                  {
                    scale: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.2, 2.5],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}

        {/* Uhr-Icon in der Mitte */}
        <Animated.Text
          style={[styles.clockIcon, { transform: [{ scale: clockBounce }] }]}
        >
          ⏰
        </Animated.Text>

        {/* Uhrzeit */}
        <Text style={styles.timeText}>{timeStr}</Text>

        {/* Wecker-Label */}
        <Text style={styles.labelText}>{alarm.label}</Text>

        {/* Snooze Info */}
        <View style={styles.snoozeInfo}>
          <Text style={styles.snoozeInfoText}>
            💤 Snooze = {alarm.snoozeMinutes} Minuten
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttons}>
          <GlassButton
            title={`Snooze (${alarm.snoozeMinutes} Min)`}
            icon="💤"
            variant="glass"
            onPress={handleSnooze}
            style={styles.snoozeBtn}
            textStyle={{ color: '#FFFFFF' }}
            size="lg"
          />
          <GlassButton
            title="Ausschalten"
            icon="✓"
            variant="primary"
            onPress={handleDismiss}
            size="lg"
          />
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  wave: {
    position: 'absolute',
    width: width,
    height: width,
    borderRadius: width / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  clockIcon: {
    fontSize: 80,
    marginBottom: SPACING.sm,
  },
  timeText: {
    fontSize: 88,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -3,
    lineHeight: 92,
  },
  labelText: {
    fontSize: FONT_SIZE.xl,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  snoozeInfo: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    marginVertical: SPACING.md,
  },
  snoozeInfoText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
  },
  buttons: {
    gap: SPACING.md,
    width: '80%',
    marginTop: SPACING.xl,
  },
  snoozeBtn: {
    // Glassmorphism-Effekt für Snooze auf dunklem Hintergrund
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});
