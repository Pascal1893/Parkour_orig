import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Wie Notifications angezeigt werden sollen wenn die App im Vordergrund ist
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Berechtigung anfragen und Notification-Channel erstellen (Android)
export async function setupNotifications() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    alert('Ohne Benachrichtigungsberechtigung können Wecker nicht klingeln!');
    return false;
  }

  // Android braucht einen Notification Channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('alarm', {
      name: 'Wecker',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      lightColor: '#7C3AED',
      sound: 'default',
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true, // Wecker klingelt auch im Nicht-Stören-Modus
    });
  }

  return true;
}

// Alle Notifications für einen Wecker planen
// Pro ausgewähltem Wochentag wird eine separate Notification geplant
export async function scheduleAlarmNotifications(alarm) {
  // Zuerst alle alten Notifications für diesen Wecker löschen
  await cancelAlarmNotifications(alarm.notificationIds);

  const notificationIds = [];

  if (alarm.days.length === 0) {
    // Einmaliger Wecker: klingelt beim nächsten Auftreten dieser Uhrzeit
    const trigger = getNextOccurrence(alarm.hours, alarm.minutes);
    const id = await Notifications.scheduleNotificationAsync({
      content: buildNotificationContent(alarm),
      trigger,
    });
    notificationIds.push(id);
  } else {
    // Wöchentlicher Wecker: eine Notification pro ausgewähltem Tag
    // Wochentage: 0=So, 1=Mo, ..., 6=Sa
    // Expo nutzt: 1=So, 2=Mo, ..., 7=Sa
    for (const day of alarm.days) {
      const id = await Notifications.scheduleNotificationAsync({
        content: buildNotificationContent(alarm),
        trigger: {
          weekday: day + 1, // Umrechnung: unser 0=So → Expo 1=So
          hour: alarm.hours,
          minute: alarm.minutes,
          second: 0,
          repeats: true,
        },
      });
      notificationIds.push(id);
    }
  }

  return notificationIds;
}

// Snooze: Wecker in X Minuten nochmal klingeln lassen
export async function scheduleSnooze(alarm) {
  const snoozeDate = new Date(Date.now() + alarm.snoozeMinutes * 60 * 1000);
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      ...buildNotificationContent(alarm),
      title: `⏰ Snooze: ${alarm.label}`,
    },
    trigger: snoozeDate,
  });
  return id;
}

// Alle Notifications für einen Wecker abbrechen
export async function cancelAlarmNotifications(notificationIds = []) {
  for (const id of notificationIds) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (e) {
      // Notification existiert eventuell nicht mehr
    }
  }
}

// Notification-Inhalt zusammenbauen
function buildNotificationContent(alarm) {
  const timeStr = formatTime(alarm.hours, alarm.minutes);
  return {
    title: `⏰ ${alarm.label}`,
    body: `Es ist ${timeStr} — Zeit aufzustehen!`,
    sound: true,
    priority: 'max',
    channelId: 'alarm',
    // Diese Daten kommen zurück wenn der User die Notification tippt
    data: { alarmId: alarm.id, type: 'alarm' },
  };
}

// Nächsten Zeitpunkt für eine Uhrzeit berechnen (für einmalige Wecker)
function getNextOccurrence(hours, minutes) {
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);
  // Falls die Zeit heute schon vorbei ist, morgen planen
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

// Uhrzeit formatieren: "07:05"
export function formatTime(hours, minutes) {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
