import type { Config } from 'tailwindcss'

/** Next-only visual system — does not alter SPA tokens. */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FFF4EE',
          100: '#FFE0D1',
          500: '#FF5A1F',
          600: '#D63D0A',
          700: '#A32E08',
        },
        canvas: '#F7F3EF',
        sand: '#EFE6DC',
        ink: {
          DEFAULT: '#12100E',
          soft: '#3D3530',
        },
        muted: '#6F655E',
        line: {
          DEFAULT: '#E8DDD4',
          strong: '#D4C4B6',
        },
        surface: '#FFFCFA',
        night: {
          DEFAULT: '#161311',
          fg: '#F6F0EA',
        },
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 1px 0 rgba(18,16,14,0.04), 0 12px 32px rgba(18,16,14,0.06)',
        rail: '0 20px 40px rgba(18,16,14,0.18)',
      },
      fontFamily: {
        sans: ['var(--font-sora)', 'Sora', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        pop: '72rem',
      },
      letterSpacing: {
        brand: '0.18em',
      },
    },
  },
  plugins: [],
}

export default config
