import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { COLORS, FONT_SIZE, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';

// Einstellungs-Screen
export default function SettingsScreen() {
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [volumeFade, setVolumeFade] = useState(false); // Lautstärke graduell erhöhen

  function handleToggle(setter, value) {
    Haptics.selectionAsync();
    setter(value);
  }

  // Alle Wecker und Notifications löschen (Reset)
  async function handleReset() {
    Alert.alert(
      'Alle Wecker löschen?',
      'Diese Aktion kann nicht rückgängig gemacht werden.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            await Notifications.cancelAllScheduledNotificationsAsync();
            await AsyncStorage.removeItem('@wecker_alarms');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert('Erledigt', 'Alle Wecker wurden gelöscht.');
          },
        },
      ]
    );
  }

  return (
    <LinearGradient colors={['#F0F4FF', '#E8EEFF']} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Einstellungen</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* App-Info Karte */}
          <View style={styles.infoCard}>
            <Text style={styles.appIcon}>⏰</Text>
            <Text style={styles.appName}>Wecker</Text>
            <Text style={styles.appVersion}>Version 1.0.0</Text>
            <LinearGradient
              colors={['#7C3AED', '#3B82F6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.divider}
            />
          </View>

          {/* Alarm-Verhalten */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alarm-Verhalten</Text>

            <SettingRow
              icon="📳"
              title="Vibration"
              subtitle="Gerät vibriert wenn Wecker klingelt"
              value={vibrationEnabled}
              onChange={(v) => handleToggle(setVibrationEnabled, v)}
            />

            <SettingRow
              icon="🔊"
              title="Lautstärke erhöhen"
              subtitle="Sound wird graduell lauter"
              value={volumeFade}
              onChange={(v) => handleToggle(setVolumeFade, v)}
            />
          </View>

          {/* Hinweise */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hinweise</Text>

            <View style={styles.noteCard}>
              <Text style={styles.noteIcon}>⚽</Text>
              <Text style={styles.noteText}>
                Für den Tor-Sound: Füge deine{' '}
                <Text style={styles.noteHighlight}>goal.mp3</Text> Datei in{' '}
                <Text style={styles.noteHighlight}>assets/sounds/</Text> ein und starte
                die App neu.
              </Text>
            </View>

            <View style={styles.noteCard}>
              <Text style={styles.noteIcon}>🔔</Text>
              <Text style={styles.noteText}>
                Damit Wecker im Hintergrund klingeln, müssen Benachrichtigungen und
                Batterie-Optimierungsausnahmen für diese App erlaubt sein.
              </Text>
            </View>

            <View style={styles.noteCard}>
              <Text style={styles.noteIcon}>⚡</Text>
              <Text style={styles.noteText}>
                Android 12+: Erlaube der App "Exakte Alarme" stellen zu dürfen unter
                Einstellungen → Apps → Wecker → Benachrichtigungen.
              </Text>
            </View>
          </View>

          {/* Gefährliche Aktionen */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datenverwaltung</Text>
            <TouchableOpacity style={styles.dangerBtn} onPress={handleReset}>
              <Text style={styles.dangerIcon}>🗑️</Text>
              <View>
                <Text style={styles.dangerTitle}>Alle Wecker löschen</Text>
                <Text style={styles.dangerSub}>Kann nicht rückgängig gemacht werden</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// Wiederverwendbare Einstellungs-Zeile mit Toggle
function SettingRow({ icon, title, subtitle, value, onChange }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingIcon}>{icon}</Text>
      <View style={styles.settingText}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#D1D5DB', true: COLORS.primaryLight }}
        thumbColor={value ? COLORS.primary : '#F3F4F6'}
      />
    </View>
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
  content: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  infoCard: {
    backgroundColor: COLORS.glass,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    ...SHADOWS.soft,
  },
  appIcon: { fontSize: 48 },
  appName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
  },
  appVersion: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  divider: {
    height: 3,
    width: 60,
    borderRadius: 2,
    marginTop: SPACING.md,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: SPACING.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    gap: SPACING.sm,
    ...SHADOWS.soft,
  },
  settingIcon: { fontSize: 24 },
  settingText: { flex: 1 },
  settingTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  settingSubtitle: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  noteCard: {
    flexDirection: 'row',
    gap: SPACING.sm,
    backgroundColor: 'rgba(124,58,237,0.05)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'rgba(124,58,237,0.15)',
    alignItems: 'flex-start',
  },
  noteIcon: { fontSize: 20, marginTop: 1 },
  noteText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  noteHighlight: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  dangerIcon: { fontSize: 22 },
  dangerTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.danger,
  },
  dangerSub: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
