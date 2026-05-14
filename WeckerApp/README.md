# ⏰ Wecker App

Moderne React Native Expo Wecker-App für Android — futuristisch, clean, minimalistisch.

## Schnellstart

```bash
cd WeckerApp
npm install
npx expo start
```

Dann QR-Code mit der **Expo Go** App scannen (Android) oder `a` drücken für den Android-Emulator.

## Vor dem Start: Tor-Sound hinzufügen

1. Lege deine `goal.mp3` Datei in `assets/sounds/goal.mp3`
2. App neu starten

Ohne die Datei erscheint eine Warnung in der Konsole — die App läuft aber trotzdem.

## Features

- **Mehrere Wecker** erstellen, bearbeiten, löschen
- **Wochentage** pro Wecker auswählen (Mo–So)
- **Eigene Sounds** aus der Medienbibliothek laden
- **Snooze** mit konfigurierbarer Dauer (1–20 Min)
- **Push Notifications** klingeln auch wenn App im Hintergrund
- **Glassmorphism-Design** mit Lila/Blau-Akzenten
- **Pulsierende Wellen-Animation** wenn Alarm klingelt
- **Haptisches Feedback** auf allen Buttons

## Ordnerstruktur

```
WeckerApp/
├── App.js                    # Navigation & App-Entry
├── app.json                  # Expo-Konfiguration & Android-Permissions
├── babel.config.js           # Babel (Reanimated-Plugin)
├── package.json              # Alle Abhängigkeiten
├── assets/
│   └── sounds/
│       └── goal.mp3          # ← HIER deine goal.mp3 einfügen!
└── src/
    ├── constants/
    │   └── theme.js          # Farben, Abstände, Schatten
    ├── utils/
    │   ├── storage.js        # AsyncStorage-Wrapper
    │   └── notifications.js  # Expo Notifications
    ├── hooks/
    │   └── useAlarms.js      # Zentraler Alarm-State
    ├── screens/
    │   ├── AlarmListScreen.js   # Hauptscreen mit Digitaluhr
    │   ├── AddAlarmScreen.js    # Wecker erstellen/bearbeiten
    │   └── SettingsScreen.js    # Einstellungen
    └── components/
        ├── AlarmCard.js         # Wecker-Karte in der Liste
        ├── AlarmRingModal.js    # Vollbild-Modal beim Klingeln
        ├── GlassButton.js       # Glassmorphism-Button
        ├── DaySelector.js       # Wochentag-Auswahl
        └── DigitalClock.js      # Animierte Digitaluhr
```

## Android-Hinweise

- **Android 12+**: Unter Einstellungen → Apps → Wecker → "Exakte Alarme erlauben" aktivieren
- **Batterie-Optimierung**: Für zuverlässige Hintergrund-Alarme sollte die App von der Batterieoptimierung ausgenommen werden
- **Nicht-Stören-Modus**: Die App ist so konfiguriert, dass Alarme auch im DND-Modus klingeln

## Pakete

| Paket | Zweck |
|-------|-------|
| `expo-notifications` | Lokale Push-Notifications für Alarme |
| `expo-av` | Sound-Wiedergabe |
| `expo-document-picker` | Eigene Sounds aus der Medienbibliothek |
| `expo-haptics` | Haptisches Feedback |
| `expo-linear-gradient` | Gradient-Effekte |
| `react-native-reanimated` | Smooth Animationen |
| `@react-native-async-storage/async-storage` | Wecker dauerhaft speichern |
| `@react-native-community/datetimepicker` | Zeit-Auswahl |
