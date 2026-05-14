import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Animated,
  Keyboard,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import GlassButton from './GlassButton';
import { COLORS, FONT_SIZE, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';

// Generiert eine zufällige Mathe-Aufgabe
// level: 'easy' (1-stellig), 'medium' (2-stellig), 'hard' (gemischt)
function generateChallenge() {
  const ops = ['+', '-', '×'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, answer;

  if (op === '+') {
    a = Math.floor(Math.random() * 50) + 10;
    b = Math.floor(Math.random() * 50) + 10;
    answer = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 50) + 30;
    b = Math.floor(Math.random() * 30) + 5;
    answer = a - b;
  } else {
    a = Math.floor(Math.random() * 9) + 2;
    b = Math.floor(Math.random() * 9) + 2;
    answer = a * b;
  }

  return { question: `${a} ${op} ${b}`, answer };
}

// Wach-Challenge: Der Nutzer muss eine Mathe-Aufgabe lösen um den Alarm auszuschalten
// onSolved: Callback wenn Aufgabe korrekt gelöst
// attempts: Wie viele Versuche werden angezeigt
export default function WakeChallenge({ onSolved }) {
  const [challenge] = useState(generateChallenge);
  const [input, setInput] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [solved, setSolved] = useState(false);

  // Shake-Animation bei falscher Antwort
  const shakeAnim = useRef(new Animated.Value(0)).current;
  // Erfolgs-Animation
  const successAnim = useRef(new Animated.Value(0)).current;

  function shake() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  function handleCheck() {
    const userAnswer = parseInt(input.trim(), 10);
    if (userAnswer === challenge.answer) {
      // Richtig!
      setSolved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Keyboard.dismiss();
      // Kurze Erfolgs-Animation dann Callback
      Animated.timing(successAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(onSolved, 500);
      });
    } else {
      // Falsch — schütteln und Zähler erhöhen
      setAttempts((a) => a + 1);
      setInput('');
      shake();
    }
  }

  if (solved) {
    return (
      <Animated.View
        style={[
          styles.solvedContainer,
          {
            opacity: successAnim,
            transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          },
        ]}
      >
        <Text style={styles.solvedIcon}>✓</Text>
        <Text style={styles.solvedText}>Aufgewacht!</Text>
      </Animated.View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🧠 Wach-Challenge</Text>
      <Text style={styles.subtitle}>Löse die Aufgabe um den Alarm auszuschalten</Text>

      {/* Aufgabe */}
      <Animated.View
        style={[styles.questionBox, { transform: [{ translateX: shakeAnim }] }]}
      >
        <Text style={styles.question}>{challenge.question} = ?</Text>
      </Animated.View>

      {/* Eingabefeld */}
      <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
        <TextInput
          style={[styles.input, attempts > 0 && styles.inputError]}
          value={input}
          onChangeText={setInput}
          keyboardType="number-pad"
          placeholder="Antwort eingeben..."
          placeholderTextColor="rgba(255,255,255,0.4)"
          maxLength={5}
          autoFocus
          onSubmitEditing={handleCheck}
          returnKeyType="done"
        />
      </Animated.View>

      {/* Fehler-Feedback */}
      {attempts > 0 && (
        <Text style={styles.errorText}>
          ✗ Falsch! {attempts > 1 ? `${attempts} Versuche` : '1 Versuch'}
        </Text>
      )}

      <GlassButton
        title="Bestätigen"
        icon="→"
        onPress={handleCheck}
        variant="glass"
        textStyle={{ color: '#FFFFFF' }}
        style={styles.btn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: SPACING.md,
    width: '100%',
    paddingHorizontal: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  questionBox: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xxl,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    ...SHADOWS.glow,
  },
  question: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: '#FFFFFF',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    minWidth: 160,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  errorText: {
    color: '#FF8080',
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  btn: {
    width: '80%',
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  // Erfolgs-Anzeige
  solvedContainer: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  solvedIcon: {
    fontSize: 80,
    color: '#FFFFFF',
  },
  solvedText: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
