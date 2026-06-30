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

/** Ink + coral on warm off-white — premium athletic, not template orange. */
export const colors = {
  ink: '#15161B',
  inkSoft: '#3A3D47',
  bg: '#FBFAF8',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F2EC',
  accent: '#FF5436',
  accentSoft: '#FFEAE3',
  accentInk: '#B3290F',
  line: '#ECEAE4',
  muted: '#6B6E76',
  success: '#0E7C5A',
  successSoft: '#E3F4EC',
  warn: '#B26A00',
  warnSoft: '#FBEFD9',
  danger: '#C0392B',
  onDark: '#FFFFFF',
  onDarkMuted: 'rgba(255,255,255,0.66)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 44 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const shadow = {
  card: {
    shadowColor: '#15161B',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  lift: {
    shadowColor: '#15161B',
    shadowOpacity: 0.12,
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
