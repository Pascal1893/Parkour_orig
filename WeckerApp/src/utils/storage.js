import AsyncStorage from '@react-native-async-storage/async-storage';

const ALARMS_KEY = '@wecker_alarms';

// Alle Wecker aus dem lokalen Speicher laden
export async function loadAlarms() {
  try {
    const json = await AsyncStorage.getItem(ALARMS_KEY);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('Fehler beim Laden der Wecker:', e);
    return [];
  }
}

// Alle Wecker speichern (ersetzt die gesamte Liste)
export async function saveAlarms(alarms) {
  try {
    await AsyncStorage.setItem(ALARMS_KEY, JSON.stringify(alarms));
  } catch (e) {
    console.error('Fehler beim Speichern der Wecker:', e);
  }
}

// Einen einzelnen Wecker hinzufügen oder aktualisieren
export async function upsertAlarm(alarm) {
  const alarms = await loadAlarms();
  const index = alarms.findIndex((a) => a.id === alarm.id);
  if (index >= 0) {
    alarms[index] = alarm;
  } else {
    alarms.push(alarm);
  }
  await saveAlarms(alarms);
  return alarms;
}

// Einen Wecker anhand seiner ID löschen
export async function deleteAlarm(id) {
  const alarms = await loadAlarms();
  const updated = alarms.filter((a) => a.id !== id);
  await saveAlarms(updated);
  return updated;
}

// Einen neuen Wecker mit Standard-Werten erstellen
export function createNewAlarm() {
  const now = new Date();
  return {
    id: `alarm_${Date.now()}`,
    label: 'Wecker',
    // Stunden und Minuten separat speichern
    hours: now.getHours(),
    minutes: now.getMinutes(),
    // Wochentage: 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
    // Standard: kein Wochentag ausgewählt (einmaliger Wecker)
    days: [],
    enabled: true,
    sound: {
      type: 'builtin',   // 'builtin' oder 'custom'
      name: 'Tor-Sound',
      uri: null,          // Bei custom Sounds: Pfad zur Datei
    },
    snoozeMinutes: 5,
    // IDs der geplanten Notifications (eine pro Wochentag)
    notificationIds: [],
  };
}
