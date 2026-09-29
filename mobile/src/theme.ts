/** Design tokens aligned with frontend/tailwind.config.js (FlightWatcher web). */
export const colors = {
  primary: '#FF6B35',
  primary50: '#FFF5F2',
  primary100: '#FFE5DC',
  primary600: '#E55A2B',
  primary700: '#CC4F26',
  primary900: '#7A2E16',
  accent: '#FF3366',
  energy: '#00D4FF',
  white: '#FFFFFF',
  bg: '#FFFFFF',
  bgMuted: '#F8FAFC', // slate-50
  loginFrom: '#EFF6FF', // blue-50
  loginTo: '#E0E7FF', // indigo-100
  slate900: '#0F172A',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate200: '#E2E8F0',
  slate100: '#F1F5F9',
  border: '#E5E7EB',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  success: '#16A34A',
  successBg: '#F0FDF4',
  black: '#000000',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radius = {
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const
