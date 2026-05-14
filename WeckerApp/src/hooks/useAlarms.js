import { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadAlarms,
  saveAlarms,
  upsertAlarm,
  deleteAlarm as deleteAlarmFromStorage,
} from '../utils/storage';
import {
  scheduleAlarmNotifications,
  cancelAlarmNotifications,
} from '../utils/notifications';

// Zentraler Hook: verwaltet alle Wecker und synchronisiert mit AsyncStorage + Notifications
export function useAlarms() {
  const [alarms, setAlarms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Wecker aus AsyncStorage laden
  const reloadAlarms = useCallback(async () => {
    const data = await loadAlarms();
    setAlarms(data);
    setLoading(false);
  }, []);

  // Beim ersten Laden
  useEffect(() => {
    reloadAlarms();
  }, []);

  // Wecker speichern oder aktualisieren
  const saveAlarm = useCallback(async (alarm) => {
    let notificationIds = alarm.notificationIds;

    // Notifications nur planen wenn der Wecker aktiv ist
    if (alarm.enabled) {
      notificationIds = await scheduleAlarmNotifications(alarm);
    } else {
      await cancelAlarmNotifications(alarm.notificationIds);
      notificationIds = [];
    }

    const updatedAlarm = { ...alarm, notificationIds };
    const updatedList = await upsertAlarm(updatedAlarm);
    setAlarms(updatedList);
    return updatedAlarm;
  }, []);

  // Wecker ein- oder ausschalten
  const toggleAlarm = useCallback(
    async (id) => {
      const alarm = alarms.find((a) => a.id === id);
      if (!alarm) return;
      await saveAlarm({ ...alarm, enabled: !alarm.enabled });
    },
    [alarms, saveAlarm]
  );

  // Wecker löschen
  const deleteAlarm = useCallback(async (id) => {
    const alarm = alarms.find((a) => a.id === id);
    if (alarm) {
      await cancelAlarmNotifications(alarm.notificationIds);
    }
    const updatedList = await deleteAlarmFromStorage(id);
    setAlarms(updatedList);
  }, [alarms]);

  return { alarms, loading, saveAlarm, toggleAlarm, deleteAlarm, reloadAlarms };
}
