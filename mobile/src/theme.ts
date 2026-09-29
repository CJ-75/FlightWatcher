import { TextStyle, ViewStyle } from 'react-native'

/**
 * FlightWatcher — warm, airy palette (no cool gray).
 * White + soft peach surfaces, deep warm ink, orange brand.
 */
export const colors = {
  primary: '#FF6B35',
  primarySoft: '#FFF3EC',
  primaryMuted: '#FFDCC8',
  primaryDeep: '#E85A28',
  primaryInk: '#8B2E0E',
  accent: '#FF3D6B',
  white: '#FFFFFF',
  /** Soft peach wash — replaces gray canvas */
  canvas: '#FFF9F5',
  surface: '#FFFFFF',
  /** Warm near-black */
  ink: '#1A120E',
  inkSoft: '#4A3428',
  /** Warm brown muted (not slate) */
  muted: '#8A6A58',
  faint: '#C4A794',
  /** Soft peach hairlines */
  line: '#F0E0D4',
  lineStrong: '#E5CBB8',
  danger: '#D93025',
  dangerSoft: '#FFF0EE',
  success: '#0F8A5F',
  successSoft: '#E8F8F1',
  overlay: 'rgba(26, 18, 14, 0.4)',
  shadow: '#5C2E18',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const

export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  full: 999,
} as const

export const fonts = {
  regular: 'Sora_400Regular',
  medium: 'Sora_500Medium',
  semibold: 'Sora_600SemiBold',
  bold: 'Sora_700Bold',
  extrabold: 'Sora_800ExtraBold',
} as const

export const type = {
  hero: {
    fontFamily: fonts.extrabold,
    fontSize: 34,
    letterSpacing: -1.2,
    lineHeight: 44,
    color: colors.ink,
    includeFontPadding: false,
  } as TextStyle,
  title: {
    fontFamily: fonts.bold,
    fontSize: 24,
    letterSpacing: -0.6,
    lineHeight: 32,
    color: colors.ink,
    includeFontPadding: false,
  } as TextStyle,
  section: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 24,
    color: colors.ink,
    includeFontPadding: false,
  } as TextStyle,
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 24,
    color: colors.inkSoft,
    includeFontPadding: false,
  } as TextStyle,
  caption: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    includeFontPadding: false,
  } as TextStyle,
  price: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    letterSpacing: -1,
    lineHeight: 42,
    color: colors.primary,
    includeFontPadding: false,
  } as TextStyle,
  button: {
    fontFamily: fonts.bold,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 22,
    includeFontPadding: false,
  } as TextStyle,
}

export const shadow = {
  soft: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  } as ViewStyle,
  lift: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  } as ViewStyle,
  glow: {
    shadowColor: colors.primary,
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  } as ViewStyle,
}

/** @deprecated keep aliases for gradual migration */
export const colorsLegacy = {
  primary: colors.primary,
  primary50: colors.primarySoft,
  primary100: colors.primaryMuted,
  primary600: colors.primaryDeep,
  primary700: colors.primaryInk,
  primary900: colors.primaryInk,
  accent: colors.accent,
  white: colors.white,
  bg: colors.surface,
  bgMuted: colors.canvas,
  loginFrom: '#FFF7F3',
  loginTo: '#FFE8DC',
  slate900: colors.ink,
  slate700: colors.inkSoft,
  slate600: colors.inkSoft,
  slate500: colors.muted,
  slate400: colors.faint,
  slate200: colors.line,
  slate100: colors.canvas,
  border: colors.line,
  danger: colors.danger,
  dangerBg: colors.dangerSoft,
  success: colors.success,
  successBg: colors.successSoft,
  black: '#000000',
  energy: '#00D4FF',
} as const
