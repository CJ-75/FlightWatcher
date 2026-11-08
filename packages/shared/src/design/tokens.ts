/**
 * FlightWatcher design tokens — Parcours / Séjours (§8).
 * Single source for web CSS vars + Expo theme.
 */

export const fwColor = {
  light: {
    accent: '#FF6B35',
    accentSoft: '#FFE7DC',
    bgFrom: '#FFF9F5',
    bgTo: '#FFE9DD',
    surface: '#FFFFFF',
    ink: '#1D1B19',
    inkMuted: '#7A6F68',
    primary: '#1D1B19',
    primaryFg: '#F5EFEA',
    success: '#2E8B57',
    line: '#F0E0D4',
  },
  dark: {
    accent: '#FF7A4A',
    accentSoft: '#3A2419',
    bgFrom: '#14110F',
    bgTo: '#1A1512',
    surface: '#1F1A17',
    ink: '#F5EFEA',
    inkMuted: '#A89D95',
    primary: '#F5EFEA',
    primaryFg: '#1D1B19',
    success: '#4FB07A',
    line: '#3A2F28',
  },
} as const

export type FwColorScheme = keyof typeof fwColor

export const fwSpace = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 32,
  rowGap: 32,
  cardGap: 12,
  screenX: 20,
} as const

export const fwRadius = {
  sm: 12,
  card: 24,
  pill: 999,
} as const

export const fwType = {
  screenTitle: { size: 32, weight: 800 as const, family: 'sora' as const },
  kicker: {
    size: 12,
    weight: 700 as const,
    family: 'sora' as const,
    trackingEm: 0.08,
  },
  photoTitlePortrait: {
    size: 26,
    weight: 400 as const,
    family: 'serifItalic' as const,
  },
  photoTitleLandscape: {
    size: 36,
    weight: 400 as const,
    family: 'serifItalic' as const,
  },
  rowTitle: { size: 20, weight: 700 as const, family: 'sora' as const },
  body: { size: 15, weight: 400 as const, family: 'sora' as const },
  meta: { size: 13, weight: 500 as const, family: 'sora' as const },
  button: { size: 16, weight: 600 as const, family: 'sora' as const },
} as const

export const fwMotion = {
  pressScale: 0.98,
  pressMs: 120,
  fadeMs: 200,
} as const

/** CSS custom properties for :root / .dark */
export function fwCssVariables(scheme: FwColorScheme = 'light'): Record<string, string> {
  const c = fwColor[scheme]
  return {
    '--fw-accent': c.accent,
    '--fw-accent-soft': c.accentSoft,
    '--fw-bg-from': c.bgFrom,
    '--fw-bg-to': c.bgTo,
    '--fw-surface': c.surface,
    '--fw-ink': c.ink,
    '--fw-ink-muted': c.inkMuted,
    '--fw-primary': c.primary,
    '--fw-primary-fg': c.primaryFg,
    '--fw-success': c.success,
    '--fw-line': c.line,
    '--fw-space-screen-x': `${fwSpace.screenX}px`,
    '--fw-radius-card': `${fwRadius.card}px`,
    '--fw-radius-pill': `${fwRadius.pill}px`,
  }
}
