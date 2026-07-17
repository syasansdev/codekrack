/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // 'class', not the default 'media'. The app has a real theme toggle, and
  // 'media' would hard-wire the theme to the OS and make that toggle inert.
  // The `dark` class is put on <html> by the inline script in index.html
  // BEFORE first paint (see there for why), and thereafter by ThemeContext.
  darkMode: "class",
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

        // ── Semantic tokens (theme-aware) ─────────────────────────────────
        // These resolve through CSS variables defined in index.css under
        // :root and .dark, so `bg-surface` is already correct in BOTH themes
        // and needs no `dark:` variant at the call site.
        //
        // That is the whole point at this scale. The app carries ~1,100 colour
        // utilities across ~35 files; `dark:` variants would double every one
        // of them and leave the next person to keep two values in sync by hand.
        //
        // Named by ROLE, not by lightness — because the relationship inverts
        // between themes. In light, the page is grey and cards are white, so a
        // card is LIGHTER than its page. In dark, the page is near-black and
        // cards sit ABOVE it. `canvas`/`surface` holds in both; `gray-50`/
        // `white` cannot.
        //
        // Deliberately NOT remapping `white` and `gray` to these vars, even
        // though it would make the retrofit nearly free: `bg-white` is a
        // surface that must flip, but `text-white` on a brand button must stay
        // white in both themes. Both come from the same Tailwind token, so
        // remapping cannot tell them apart — it would invert the label on
        // every primary button in the app.
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)', // cards, panels, sidebar
          2: 'rgb(var(--surface-2) / <alpha-value>)', // table heads, stat tiles, inputs
          3: 'rgb(var(--surface-3) / <alpha-value>)', // hover / pressed
        },
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)', // headings, primary copy
          muted: 'rgb(var(--fg-muted) / <alpha-value>)', // secondary copy, labels
          subtle: 'rgb(var(--fg-subtle) / <alpha-value>)', // captions, placeholders
        },
        edge: {
          DEFAULT: 'rgb(var(--edge) / <alpha-value>)', // hairlines, dividers
          strong: 'rgb(var(--edge-strong) / <alpha-value>)', // input borders, focus
        },
        // Low-chroma fills for badges/pills. A literal bg-brand-50 is correct
        // on white and blinding on near-black, so these flip to a deep,
        // desaturated wash in dark rather than staying pale.
        tint: {
          brand: 'rgb(var(--tint-brand) / <alpha-value>)',
          accent: 'rgb(var(--tint-accent) / <alpha-value>)',
          success: 'rgb(var(--tint-success) / <alpha-value>)',
          warn: 'rgb(var(--tint-warn) / <alpha-value>)',
          danger: 'rgb(var(--tint-danger) / <alpha-value>)',
        },
        // Readable text/icon colour to pair with each tint above.
        on: {
          brand: 'rgb(var(--on-brand) / <alpha-value>)',
          accent: 'rgb(var(--on-accent) / <alpha-value>)',
          success: 'rgb(var(--on-success) / <alpha-value>)',
          warn: 'rgb(var(--on-warn) / <alpha-value>)',
          danger: 'rgb(var(--on-danger) / <alpha-value>)',
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
        // Driven by CSS vars so elevation survives the theme flip. A soft grey
        // shadow tuned for white is effectively invisible on a near-black
        // canvas — which is why bolted-on dark modes read as flat. In dark,
        // --shadow goes to true black at much higher alpha, and the hairline
        // border does more of the work of separating a card from the page.
        elite:
          '0 1px 2px rgb(var(--shadow) / var(--shadow-a1)), 0 8px 24px -6px rgb(var(--shadow) / var(--shadow-a2))',
        'elite-lg':
          '0 2px 4px rgb(var(--shadow) / var(--shadow-a1)), 0 24px 48px -12px rgb(var(--shadow) / var(--shadow-a3))',
        // Brand glows are chromatic, so they carry across both themes as-is.
        'glow-blue': '0 0 0 1px rgba(37,71,235,0.14), 0 10px 34px -8px rgba(37,71,235,0.45)',
        'glow-orange': '0 0 0 1px rgba(255,106,19,0.18), 0 10px 34px -8px rgba(255,106,19,0.45)',
      },
      backgroundImage: {
        // Saturated brand gradients: identical in both themes on purpose —
        // they carry the brand and always sit under white text.
        'brand-gradient': 'linear-gradient(135deg, #1d35d8 0%, #3b66f6 48%, #ff6a13 100%)',
        'accent-gradient': 'linear-gradient(135deg, #ff8a4c 0%, #f04e06 100%)',
        // These two are *surface washes*, so they must follow the theme.
        // Hardcoded #eef4ff -> #ffffff would be a white slab in dark mode.
        'brand-gradient-soft':
          'linear-gradient(135deg, rgb(var(--wash-a)) 0%, rgb(var(--surface)) 50%, rgb(var(--wash-b)) 100%)',
        'brand-mesh':
          'radial-gradient(1100px circle at 0% 0%, rgb(var(--mesh-a) / var(--mesh-o)), transparent 45%), radial-gradient(900px circle at 100% 10%, rgb(var(--mesh-b) / var(--mesh-o)), transparent 45%)',
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
