import { TextStyle, ViewStyle } from 'react-native'

/** FlightWatcher brand tokens (aligned with web primary orange). */
export const colors = {
  primary: '#FF6B35',
  primarySoft: '#FFF0EA',
  primaryMuted: '#FFE0D4',
  primaryDeep: '#E55A2B',
  primaryInk: '#9A3412',
  accent: '#FF3366',
  white: '#FFFFFF',
  canvas: '#F7F5F3',
  surface: '#FFFFFF',
  ink: '#0C1222',
  inkSoft: '#3D4659',
  muted: '#6B7285',
  faint: '#9AA1B2',
  line: '#E8E4DF',
  lineStrong: '#D4CFC8',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  success: '#059669',
  overlay: 'rgba(12, 18, 34, 0.45)',
  shadow: '#0C1222',
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
  sm: 10,
  md: 14,
  lg: 20,
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
    lineHeight: 40,
    color: colors.ink,
  } as TextStyle,
  title: {
    fontFamily: fonts.bold,
    fontSize: 24,
    letterSpacing: -0.6,
    lineHeight: 30,
    color: colors.ink,
  } as TextStyle,
  section: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    letterSpacing: -0.2,
    color: colors.ink,
  } as TextStyle,
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
  } as TextStyle,
  caption: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  } as TextStyle,
  price: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    letterSpacing: -1,
    color: colors.primary,
  } as TextStyle,
  button: {
    fontFamily: fonts.bold,
    fontSize: 16,
    letterSpacing: -0.2,
  } as TextStyle,
}

export const shadow = {
  soft: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  } as ViewStyle,
  lift: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  } as ViewStyle,
  glow: {
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 16,
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
  successBg: '#ECFDF5',
  black: '#000000',
  energy: '#00D4FF',
} as const
