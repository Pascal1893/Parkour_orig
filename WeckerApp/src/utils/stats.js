import AsyncStorage from '@react-native-async-storage/async-storage';

const STATS_KEY = '@wecker_stats';

// Standard-Statistiken für neuen Nutzer
function defaultStats() {
  return {
    currentStreak: 0,   // Aktuelle Serie (Tage hintereinander pünktlich)
    bestStreak: 0,       // Beste Serie aller Zeiten
    totalDismissals: 0,  // Gesamte Alarme die geklingelt haben
    onTimeDismissals: 0, // Davon ohne Snooze dismissed
    // Letzte 7 Tage: { date: 'YYYY-MM-DD', onTime: bool }
    weekHistory: [],
  };
}

export async function loadStats() {
  try {
    const json = await AsyncStorage.getItem(STATS_KEY);
    return json ? { ...defaultStats(), ...JSON.parse(json) } : defaultStats();
  } catch {
    return defaultStats();
  }
}

// Wird aufgerufen wenn Alarm dismissed wird
// onTime: true = direkt dismissed (kein Snooze), false = gesnoozed
export async function recordDismissal(onTime) {
  const stats = await loadStats();
  const today = getTodayStr();

  // Nicht zwei Mal am selben Tag zählen
  const alreadyToday = stats.weekHistory.find((d) => d.date === today);
  if (!alreadyToday) {
    stats.weekHistory.push({ date: today, onTime });
    // Nur die letzten 7 Einträge behalten
    if (stats.weekHistory.length > 7) {
      stats.weekHistory = stats.weekHistory.slice(-7);
    }
  }

  stats.totalDismissals += 1;
  if (onTime) {
    stats.onTimeDismissals += 1;
    stats.currentStreak += 1;
    if (stats.currentStreak > stats.bestStreak) {
      stats.bestStreak = stats.currentStreak;
    }
  } else {
    // Bei Snooze: Streak zurücksetzen
    stats.currentStreak = 0;
  }

  await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
  return stats;
}

// Heutiges Datum als String: "2026-05-14"
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Wie viele Stunden/Minuten Schlaf bis zum Alarm
export function calcSleepDuration(alarmHours, alarmMinutes) {
  const now = new Date();
  const alarm = new Date();
  alarm.setHours(alarmHours, alarmMinutes, 0, 0);
  // Falls Uhrzeit heute schon vorbei: morgen
  if (alarm <= now) alarm.setDate(alarm.getDate() + 1);
  const diffMs = alarm - now;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes };
}
