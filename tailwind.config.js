/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── CodeKrack brand palette ───────────────────────────────────────
        // `blue` and `orange` intentionally OVERRIDE Tailwind's defaults, so
        // every existing bg-blue-600 / text-orange-500 across the app picks up
        // the brand colours automatically. Use `brand-*` / `accent-*` in new code.
        blue: {
          50: '#eef4ff',
          100: '#dbe6fe',
          200: '#bfd3fe',
          300: '#93b4fd',
          400: '#608cfa',
          500: '#3b66f6',
          600: '#2547eb',
          700: '#1d35d8',
          800: '#1e2eaf',
          900: '#1e2d8a',
          950: '#141b4d',
        },
        orange: {
          50: '#fff8f1',
          100: '#feecdc',
          200: '#fcd9bd',
          300: '#fdba8c',
          400: '#ff8a4c',
          500: '#ff6a13',
          600: '#f04e06',
          700: '#c73a06',
          800: '#9c300d',
          900: '#7e2a0e',
          950: '#441306',
        },
        // Semantic aliases
        brand: {
          50: '#eef4ff',
          100: '#dbe6fe',
          200: '#bfd3fe',
          300: '#93b4fd',
          400: '#608cfa',
          500: '#3b66f6',
          600: '#2547eb',
          700: '#1d35d8',
          800: '#1e2eaf',
          900: '#1e2d8a',
          950: '#141b4d',
        },
        accent: {
          50: '#fff8f1',
          100: '#feecdc',
          200: '#fcd9bd',
          300: '#fdba8c',
          400: '#ff8a4c',
          500: '#ff6a13',
          600: '#f04e06',
          700: '#c73a06',
          800: '#9c300d',
          900: '#7e2a0e',
          950: '#441306',
        },
        // Back-compat: index.css used bg-primary-*
        primary: {
          50: '#eef4ff',
          100: '#dbe6fe',
          200: '#bfd3fe',
          300: '#93b4fd',
          400: '#608cfa',
          500: '#3b66f6',
          600: '#2547eb',
          700: '#1d35d8',
          800: '#1e2eaf',
          900: '#1e2d8a',
          950: '#141b4d',
        },
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5dae3',
          300: '#b1bacb',
          400: '#8695ae',
          500: '#667694',
          600: '#515f7a',
          700: '#434e63',
          800: '#3a4353',
          900: '#343b47',
          950: '#0e1220',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
      boxShadow: {
        elite: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -6px rgba(16,24,40,0.10)',
        'elite-lg': '0 2px 4px rgba(16,24,40,0.04), 0 24px 48px -12px rgba(16,24,40,0.18)',
        'glow-blue': '0 0 0 1px rgba(37,71,235,0.14), 0 10px 34px -8px rgba(37,71,235,0.45)',
        'glow-orange': '0 0 0 1px rgba(255,106,19,0.18), 0 10px 34px -8px rgba(255,106,19,0.45)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #1d35d8 0%, #3b66f6 48%, #ff6a13 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, #eef4ff 0%, #ffffff 50%, #fff8f1 100%)',
        'accent-gradient': 'linear-gradient(135deg, #ff8a4c 0%, #f04e06 100%)',
        'brand-mesh':
          'radial-gradient(1100px circle at 0% 0%, rgba(59,102,246,0.14), transparent 45%), radial-gradient(900px circle at 100% 10%, rgba(255,106,19,0.12), transparent 45%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [],
}
