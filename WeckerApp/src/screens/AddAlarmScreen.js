import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { useAlarms } from '../hooks/useAlarms';
import { createNewAlarm } from '../utils/storage';
import DaySelector from '../components/DaySelector';
import GlassButton from '../components/GlassButton';
import { COLORS, FONT_SIZE, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';

// Vorinstallierte Sounds
const BUILTIN_SOUNDS = [
  { name: 'Tor-Sound ⚽', uri: null, type: 'builtin' },
  { name: 'Standard Wecker', uri: 'default', type: 'builtin' },
];

const SNOOZE_OPTIONS = [1, 5, 10, 15, 20];

// Screen zum Erstellen und Bearbeiten eines Weckers
export default function AddAlarmScreen({ navigation, route }) {
  // Wenn ein bestehender Wecker übergeben wird: Bearbeiten-Modus
  const existingAlarm = route?.params?.alarm;
  const isEditing = !!existingAlarm;

  // Alarm-State initialisieren
  const [alarm, setAlarm] = useState(existingAlarm || createNewAlarm());
  // Für den Time Picker: Date-Objekt erstellen
  const [pickerDate, setPickerDate] = useState(() => {
    const d = new Date();
    d.setHours(existingAlarm?.hours ?? new Date().getHours());
    d.setMinutes(existingAlarm?.minutes ?? new Date().getMinutes());
    d.setSeconds(0);
    return d;
  });
  const [showTimePicker, setShowTimePicker] = useState(false);

  const { saveAlarm } = useAlarms();

  // Einblende-Animation für den Screen
  const slideAnim = useRef(new Animated.Value(50)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  // Zeit aus dem Picker übernehmen
  function onTimeChange(event, selectedDate) {
    setShowTimePicker(false);
    if (selectedDate) {
      setPickerDate(selectedDate);
      setAlarm((a) => ({
        ...a,
        hours: selectedDate.getHours(),
        minutes: selectedDate.getMinutes(),
      }));
    }
  }

  // Eigenen Sound aus der Medienbibliothek auswählen
  async function pickCustomSound() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*', // Nur Audio-Dateien
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const file = result.assets[0];
        setAlarm((a) => ({
          ...a,
          sound: {
            type: 'custom',
            name: file.name.replace(/\.[^/.]+$/, ''), // Dateiname ohne Extension
            uri: file.uri,
          },
        }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      Alert.alert('Fehler', 'Sound konnte nicht geladen werden.');
    }
  }

  // Wecker speichern
  async function handleSave() {
    if (!alarm.label.trim()) {
      Alert.alert('Kein Name', 'Bitte gib dem Wecker einen Namen.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveAlarm({ ...alarm, enabled: true });
    navigation.goBack();
  }

  // Uhrzeit für die Anzeige formatieren
  const timeStr = `${String(alarm.hours).padStart(2, '0')}:${String(alarm.minutes).padStart(2, '0')}`;

  return (
    <LinearGradient colors={['#F0F4FF', '#E8EEFF']} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

        {/* Header mit Zurück-Button */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Zurück</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Wecker bearbeiten' : 'Neuer Wecker'}
          </Text>
          <View style={{ width: 80 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={{
              opacity: opacityAnim,
              transform: [{ translateY: slideAnim }],
              gap: SPACING.lg,
            }}
          >
            {/* Uhrzeit-Auswahl */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Uhrzeit</Text>
              <TouchableOpacity
                onPress={() => setShowTimePicker(true)}
                style={styles.timeDisplay}
              >
                <LinearGradient
                  colors={['#7C3AED', '#3B82F6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.timeGradient}
                >
                  <Text style={styles.timeText}>{timeStr}</Text>
                  <Text style={styles.timeHint}>Antippen zum Ändern</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Native Android Time Picker */}
              {showTimePicker && (
                <DateTimePicker
                  value={pickerDate}
                  mode="time"
                  is24Hour={true}
                  display="spinner"
                  onChange={onTimeChange}
                  locale="de-DE"
                />
              )}
            </View>

            {/* Wecker-Name */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={alarm.label}
                onChangeText={(text) => setAlarm((a) => ({ ...a, label: text }))}
                placeholder="z.B. Schule, Training..."
                placeholderTextColor={COLORS.textLight}
                maxLength={30}
              />
            </View>

            {/* Wochentage */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Wochentage</Text>
              <Text style={styles.sectionHint}>
                Kein Tag ausgewählt = einmaliger Wecker
              </Text>
              <DaySelector
                selectedDays={alarm.days}
                onChange={(days) => setAlarm((a) => ({ ...a, days }))}
              />
            </View>

            {/* Sound-Auswahl */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Klingelton</Text>

              {/* Vorinstallierte Sounds */}
              {BUILTIN_SOUNDS.map((sound) => (
                <TouchableOpacity
                  key={sound.name}
                  style={[
                    styles.soundOption,
                    alarm.sound?.name === sound.name && styles.soundOptionSelected,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAlarm((a) => ({ ...a, sound }));
                  }}
                >
                  <Text
                    style={[
                      styles.soundOptionText,
                      alarm.sound?.name === sound.name && styles.soundOptionTextSelected,
                    ]}
                  >
                    {sound.name}
                  </Text>
                  {alarm.sound?.name === sound.name && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}

              {/* Eigenen Sound auswählen */}
              <TouchableOpacity style={styles.customSoundBtn} onPress={pickCustomSound}>
                <Text style={styles.customSoundIcon}>🎵</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customSoundTitle}>Eigenen Sound wählen</Text>
                  {alarm.sound?.type === 'custom' && (
                    <Text style={styles.customSoundName}>{alarm.sound.name}</Text>
                  )}
                </View>
                <Text style={styles.customSoundArrow}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Snooze-Dauer */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Snooze-Dauer</Text>
              <View style={styles.snoozeRow}>
                {SNOOZE_OPTIONS.map((min) => (
                  <TouchableOpacity
                    key={min}
                    style={[
                      styles.snoozeOption,
                      alarm.snoozeMinutes === min && styles.snoozeOptionSelected,
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setAlarm((a) => ({ ...a, snoozeMinutes: min }));
                    }}
                  >
                    <Text
                      style={[
                        styles.snoozeText,
                        alarm.snoozeMinutes === min && styles.snoozeTextSelected,
                      ]}
                    >
                      {min} Min
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Speichern-Button */}
            <GlassButton
              title={isEditing ? 'Änderungen speichern' : 'Wecker erstellen'}
              icon={isEditing ? '✓' : '+'}
              onPress={handleSave}
              size="lg"
              style={styles.saveBtn}
            />

            <View style={{ height: SPACING.xl }} />
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(124,58,237,0.08)',
  },
  backBtn: {
    padding: SPACING.sm,
    width: 80,
  },
  backText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  content: {
    padding: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.glass,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    gap: SPACING.sm,
    ...SHADOWS.soft,
  },
  sectionLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textLight,
    marginTop: -SPACING.xs,
  },
  timeDisplay: {
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  timeGradient: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
  },
  timeText: {
    fontSize: 64,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -2,
  },
  timeHint: {
    fontSize: FONT_SIZE.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.15)',
    fontWeight: '500',
  },
  soundOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.1)',
  },
  soundOptionSelected: {
    backgroundColor: 'rgba(124,58,237,0.1)',
    borderColor: COLORS.primary,
  },
  soundOptionText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  soundOptionTextSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  checkmark: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: FONT_SIZE.lg,
  },
  customSoundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(124,58,237,0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.2)',
    borderStyle: 'dashed',
    gap: SPACING.sm,
  },
  customSoundIcon: { fontSize: 20 },
  customSoundTitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.primary,
    fontWeight: '600',
  },
  customSoundName: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  customSoundArrow: {
    fontSize: 22,
    color: COLORS.primaryLight,
    fontWeight: '300',
  },
  snoozeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  snoozeOption: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.15)',
  },
  snoozeOptionSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  snoozeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  snoozeTextSelected: {
    color: '#FFFFFF',
  },
  saveBtn: {
    marginTop: SPACING.sm,
  },
});
