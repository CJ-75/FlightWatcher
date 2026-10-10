/** @type {import('tailwindcss').Config} */
/**
 * Design tokens aligned with mobile/src/theme.ts
 * Warm peach canvas, orange brand, deep warm ink (no cool gray).
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FFF3EC',
          100: '#FFDCC8',
          200: '#FFDCC8',
          500: '#FF6B35',
          600: '#E85A28',
          700: '#8B2E0E',
          900: '#8B2E0E',
        },
        accent: {
          500: '#FF3D6B',
        },
        canvas: '#FFF9F5',
        ink: {
          DEFAULT: '#1A120E',
          soft: '#4A3428',
        },
        muted: '#8A6A58',
        faint: '#C4A794',
        line: {
          DEFAULT: '#F0E0D4',
          strong: '#E5CBB8',
        },
        // Remap cool slate → warm ink scale so existing classes pick up the app look
        slate: {
          50: '#FFF9F5',
          100: '#FFF3EC',
          200: '#F0E0D4',
          300: '#E5CBB8',
          400: '#C4A794',
          500: '#8A6A58',
          600: '#4A3428',
          700: '#4A3428',
          800: '#1A120E',
          900: '#1A120E',
        },
        gray: {
          50: '#FFF9F5',
          100: '#FFF3EC',
          200: '#F0E0D4',
          300: '#E5CBB8',
          400: '#C4A794',
          500: '#8A6A58',
          600: '#4A3428',
          700: '#4A3428',
          800: '#1A120E',
          900: '#1A120E',
        },
        energy: {
          400: '#00D4FF',
        },
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.375rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        soft: '0 6px 18px rgba(92, 46, 24, 0.07)',
        lift: '0 12px 24px rgba(92, 46, 24, 0.12)',
        card: '0 6px 18px rgba(92, 46, 24, 0.07)',
        'card-hover': '0 12px 28px rgba(92, 46, 24, 0.12)',
        'glow-orange': '0 8px 20px rgba(255, 107, 53, 0.32)',
        'glow-rose': '0 8px 20px rgba(255, 61, 107, 0.28)',
      },
      fontFamily: {
        sans: [
          'Sora',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
      },
      letterSpacing: {
        tightest: '-0.06em',
      },
    },
  },
  plugins: [],
}
