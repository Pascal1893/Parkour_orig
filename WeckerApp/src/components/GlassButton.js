import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS, BORDER_RADIUS, FONT_SIZE, SHADOWS } from '../constants/theme';

// Glassmorphism-Button mit Drück-Animation und Glow-Effekt
// variant: 'primary' (Gradient) | 'glass' (transparent) | 'danger' (rot)
export default function GlassButton({
  onPress,
  title,
  icon,
  variant = 'primary',
  style,
  textStyle,
  disabled = false,
  size = 'md', // 'sm' | 'md' | 'lg'
}) {
  // Animations-Wert für den Drück-Effekt (Scale)
  const scaleAnim = useRef(new Animated.Value(1)).current;
  // Animations-Wert für den Glow-Effekt (Opacity)
  const glowAnim = useRef(new Animated.Value(0)).current;

  function handlePressIn() {
    // Haptisches Feedback beim Drücken
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Button wird kleiner und Glow erscheint
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.94,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }),
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function handlePressOut() {
    // Button federt zurück
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 200,
        friction: 8,
      }),
      Animated.timing(glowAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }

  const sizeStyles = {
    sm: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: BORDER_RADIUS.md },
    md: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: BORDER_RADIUS.lg },
    lg: { paddingVertical: 18, paddingHorizontal: 36, borderRadius: BORDER_RADIUS.xl },
  };

  const fontSizes = { sm: FONT_SIZE.sm, md: FONT_SIZE.md, lg: FONT_SIZE.lg };

  // Glow-Farbe je nach Variante
  const glowColors = {
    primary: 'rgba(124, 58, 237, 0.4)',
    glass: 'rgba(124, 58, 237, 0.2)',
    danger: 'rgba(239, 68, 68, 0.4)',
  };

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { transform: [{ scale: scaleAnim }] },
        style,
      ]}
    >
      {/* Glow-Ring hinter dem Button */}
      <Animated.View
        style={[
          styles.glow,
          sizeStyles[size],
          {
            backgroundColor: glowColors[variant],
            opacity: glowAnim,
          },
        ]}
      />

      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
      >
        {variant === 'primary' ? (
          // Gradient-Button
          <LinearGradient
            colors={disabled ? ['#C4C4C4', '#A0A0A0'] : COLORS.primary === '#7C3AED' ? ['#7C3AED', '#3B82F6'] : ['#7C3AED', '#3B82F6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, sizeStyles[size]]}
          >
            {icon && <Text style={styles.icon}>{icon}</Text>}
            <Text style={[styles.textPrimary, { fontSize: fontSizes[size] }, textStyle]}>
              {title}
            </Text>
          </LinearGradient>
        ) : variant === 'danger' ? (
          // Roter Danger-Button
          <View style={[styles.button, styles.dangerButton, sizeStyles[size]]}>
            {icon && <Text style={styles.icon}>{icon}</Text>}
            <Text style={[styles.textPrimary, { fontSize: fontSizes[size] }, textStyle]}>
              {title}
            </Text>
          </View>
        ) : (
          // Glassmorphism-Button
          <View style={[styles.button, styles.glassButton, sizeStyles[size]]}>
            {icon && <Text style={[styles.icon, { color: COLORS.primary }]}>{icon}</Text>}
            <Text style={[styles.textGlass, { fontSize: fontSizes[size] }, textStyle]}>
              {title}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: -4,
    borderRadius: BORDER_RADIUS.lg,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOWS.medium,
  },
  glassButton: {
    backgroundColor: COLORS.glass,
    borderWidth: 1.5,
    borderColor: COLORS.glassBorder,
  },
  dangerButton: {
    backgroundColor: COLORS.danger,
  },
  textPrimary: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  textGlass: {
    color: COLORS.primary,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  icon: {
    fontSize: 18,
    color: '#FFFFFF',
  },
});
