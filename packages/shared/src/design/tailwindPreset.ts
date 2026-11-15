import { fwColor } from './tokens'

/** Tailwind color map from WayPop design tokens (light). No violet. */
const c = fwColor.light

export const fwTailwindColors = {
  accent: {
    DEFAULT: c.accent,
    soft: c.accentSoft,
  },
  ink: {
    DEFAULT: c.ink,
    muted: c.inkMuted,
  },
  cream: c.bgFrom,
  canvas: c.bgFrom,
  sand: c.bgTo,
  surface: c.surface,
  line: {
    DEFAULT: c.line,
    strong: '#E5D5C8',
  },
  primary: {
    50: c.accentSoft,
    100: '#FFD4C2',
    500: c.accent,
    600: '#E85A28',
    700: '#C4471A',
  },
  peach: {
    soft: '#FFD4A8',
    mist: c.bgTo,
    blush: c.accentSoft,
    deep: '#F5B87A',
  },
} as const
