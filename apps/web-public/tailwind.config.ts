import type { Config } from 'tailwindcss'
import { fwColor, fwRadius } from '../../packages/shared/src/design/tokens'

const light = fwColor.light

/** Preset mirrored from frontend/tailwind.config.js + shared tokens — pixel parity target. */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FFF3EC',
          100: '#FFDCC8',
          200: '#FFDCC8',
          500: light.accent,
          600: '#E85A28',
          700: '#8B2E0E',
          900: '#8B2E0E',
        },
        canvas: light.bgFrom,
        ink: {
          DEFAULT: light.ink,
          soft: '#4A3428',
        },
        muted: light.inkMuted,
        line: {
          DEFAULT: light.line,
          strong: '#E5CBB8',
        },
        surface: light.surface,
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.375rem',
        '3xl': '1.75rem',
        card: `${fwRadius.card}px`,
        pill: `${fwRadius.pill}px`,
      },
      boxShadow: {
        soft: '0 6px 18px rgba(92, 46, 24, 0.07)',
        lift: '0 12px 24px rgba(92, 46, 24, 0.12)',
        'glow-orange': '0 8px 20px rgba(255, 107, 53, 0.32)',
      },
      fontFamily: {
        sans: ['var(--font-sora)', 'Sora', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
