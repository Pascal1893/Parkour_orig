// Globale Design-Konstanten für die gesamte App
export const COLORS = {
  // Hauptfarben
  background: '#F0F4FF',    // Sehr helles Blau-Weiß
  surface: '#FFFFFF',        // Reines Weiß für Cards
  primary: '#7C3AED',        // Lila als Hauptakzent
  primaryLight: '#A78BFA',   // Helles Lila
  secondary: '#3B82F6',      // Blau als zweiter Akzent
  secondaryLight: '#93C5FD', // Helles Blau

  // Text
  textPrimary: '#1A1A2E',    // Fast Schwarz
  textSecondary: '#6B7280',  // Grau
  textLight: '#A0AEC0',      // Helles Grau

  // Glassmorphism
  glass: 'rgba(255, 255, 255, 0.75)',
  glassBorder: 'rgba(255, 255, 255, 0.9)',
  glassShadow: 'rgba(124, 58, 237, 0.15)',

  // Status
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',

  // Tab Bar
  tabActive: '#7C3AED',
  tabInactive: '#A0AEC0',
  tabBackground: 'rgba(255, 255, 255, 0.95)',
};

export const GRADIENTS = {
  // Haupt-Gradient für Buttons und Akzente
  primary: ['#7C3AED', '#3B82F6'],
  primarySoft: ['#A78BFA', '#93C5FD'],
  // Hintergrund-Gradient für Screens
  background: ['#F0F4FF', '#E8EEFF'],
  // Alarm klingelt - warmer Gradient
  alarm: ['#7C3AED', '#EC4899'],
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BORDER_RADIUS = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  full: 9999,
};

export const FONT_SIZE = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 32,
  giant: 56,
};

export const SHADOWS = {
  soft: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  medium: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  glow: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
};
