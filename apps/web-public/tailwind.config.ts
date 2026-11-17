import type { Config } from 'tailwindcss'

/**
 * Colors mirror packages/shared fwColor.light / fwTailwindColors
 * (accent #FF6B35, ink #1D1B19, cream #FFF9F5) — no violet.
 */
const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/shared/src/web/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#FF6B35',
          soft: '#FFE7DC',
        },
        ink: {
          DEFAULT: '#1D1B19',
          muted: '#7A6F68',
          soft: '#7A6F68',
        },
        cream: '#FFF9F5',
        canvas: '#FFF9F5',
        sand: '#FFE9DD',
        surface: '#FFFFFF',
        muted: '#7A6F68',
        line: {
          DEFAULT: '#F0E0D4',
          strong: '#E5D5C8',
        },
        brand: {
          50: '#FFE7DC',
          100: '#FFD4A8',
          500: '#FF6B35',
          600: '#E85A28',
          700: '#C4471A',
        },
        primary: {
          50: '#FFE7DC',
          100: '#FFD4C2',
          500: '#FF6B35',
          600: '#E85A28',
          700: '#C4471A',
        },
        peach: {
          soft: '#FFD4A8',
          mist: '#FFE9DD',
          blush: '#FFE7DC',
          deep: '#F5B87A',
        },
        sky: {
          soft: '#FFF0E8',
          ink: '#1D1B19',
        },
        lav: {
          soft: '#FFE7DC',
          mist: '#FFE9DD',
        },
        night: {
          DEFAULT: '#1D1B19',
          fg: '#F5EFEA',
        },
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
        '4xl': '2rem',
        pill: '9999px',
      },
      boxShadow: {
        soft: '0 12px 40px rgba(29,27,25,0.06)',
        lift: '0 22px 55px rgba(29,27,25,0.1)',
        brand: '0 12px 28px rgba(255,107,53,0.28)',
        rail: '0 20px 40px rgba(18,16,14,0.18)',
      },
      fontFamily: {
        sans: ['var(--font-sora)', 'Sora', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        pop: '72rem',
      },
      letterSpacing: {
        brand: '0.02em',
      },
    },
  },
  plugins: [],
}

export default config
