import { TextStyle } from 'react-native';
import {
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora';

/** Font map passed to useFonts() in App.tsx. */
export const fontMap = {
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
};

export const fonts = {
  regular: 'Sora_400Regular',
  medium: 'Sora_500Medium',
  semibold: 'Sora_600SemiBold',
  bold: 'Sora_700Bold',
  extra: 'Sora_800ExtraBold',
};

/**
 * Kasya brand dark mode — near-black + logo orange (#FF4D0D), matching the app icon.
 * `ink` is the PRIMARY TEXT color (near-white on dark). Where `ink` is used as a
 * FILL (primary button, selected chips) the fg on top must be `bg`, not `onDark`.
 * Accent fills keep `onDark` white fg. Dark hero cards sit on `surfaceAlt`.
 */
export const colors = {
  ink: '#F3F4F6',
  inkSoft: '#C6C9D1',
  bg: '#0B0C0E',
  surface: '#15161B',
  surfaceAlt: '#1E2026',
  accent: '#FF4D0D',
  accentSoft: '#33170B',
  accentInk: '#FF8A54',
  line: '#24262C',
  /** stronger border for interactive outlines needing ≥3:1 non-text contrast */
  lineStrong: '#3D414B',
  muted: '#959AA4',
  success: '#2FBF8F',
  successSoft: '#123227',
  warn: '#F5A83C',
  warnSoft: '#2E2412',
  danger: '#FF6257',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255,255,255,0.66)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 44 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  lift: {
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
} as const;

/** Reusable text presets. Spread into a Text style and override color as needed. */
export const type: Record<string, TextStyle> = {
  display: { fontFamily: fonts.extra, fontSize: 34, lineHeight: 40, color: colors.ink, letterSpacing: -0.6 },
  h1: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, color: colors.ink, letterSpacing: -0.4 },
  h2: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, color: colors.ink, letterSpacing: -0.2 },
  title: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: colors.inkSoft },
  bodyMuted: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: colors.muted },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
};

export const confidenceColor: Record<string, string> = {
  high: colors.success,
  medium: colors.warn,
  low: colors.danger,
};
