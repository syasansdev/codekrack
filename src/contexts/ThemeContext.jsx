// src/contexts/ThemeContext.jsx
//
// Theme state for the app. Three-valued on purpose:
//
//   preference : 'light' | 'dark' | null   <- what the USER chose (null = follow OS)
//   theme      : 'light' | 'dark'          <- what is actually ON SCREEN right now
//
// Collapsing these into one boolean is the usual mistake. If "system" isn't a
// distinct state, a visitor whose OS is dark gets 'dark' written to storage on
// first paint, and the app stops following their OS forever after — they never
// asked for that, and there's no way back to "just match my system".
//
// The class is put on <html> by the inline script in index.html BEFORE first
// paint. This provider does not own that first application; it owns every
// change afterwards. See index.html for why that split has to exist.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

// Duplicated in index.html's bootstrap script, which cannot import from here.
// Change both together.
const STORAGE_KEY = 'codekrack-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

// Matches --canvas in index.css. Drives the mobile browser chrome so the
// address bar doesn't stay brand-blue over a near-black page.
const CHROME_COLOR = { light: '#2547eb', dark: '#080b14' };

const ThemeContext = createContext(null);

const prefersDark = () => {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
};

const readStored = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    // Private mode / storage blocked. Treat as "no preference" rather than
    // throwing — the app must still render.
    return null;
  }
};

export const ThemeProvider = ({ children }) => {
  const [preference, setPreference] = useState(readStored);
  const [systemDark, setSystemDark] = useState(prefersDark);

  // Follow the OS while preference is null. Without this listener "system"
  // would only be read once at boot, so switching your OS to dark at sunset
  // would do nothing until a reload.
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia(DARK_QUERY);
    } catch {
      return undefined;
    }
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Keep tabs in step. The app is explicitly multi-tab (admins keep the
  // leaderboard open beside the student list), and a theme that flips in one
  // tab while the others stay light looks broken. `storage` only fires in the
  // OTHER tabs, so there's no feedback loop with the tab that made the change.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== STORAGE_KEY) return;
      setPreference(e.newValue === 'dark' || e.newValue === 'light' ? e.newValue : null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const theme = preference ?? (systemDark ? 'dark' : 'light');

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? CHROME_COLOR.dark : CHROME_COLOR.light);
  }, [theme]);

  const setTheme = useCallback((next) => {
    setPreference(next);
    try {
      if (next === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable — the theme still applies for this session, it
      // just won't survive a reload. Better than crashing on a click.
    }
  }, []);

  // Toggles from what is ON SCREEN, not from the preference. On "system",
  // toggling has to mean "give me the opposite of what I'm looking at" —
  // flipping the preference instead would make the first click a no-op
  // whenever the OS already matched.
  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme, setTheme]
  );

  const value = useMemo(
    () => ({
      theme,
      preference,
      isDark: theme === 'dark',
      setTheme,
      toggleTheme,
      useSystemTheme: () => setTheme(null),
    }),
    [theme, preference, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a <ThemeProvider>');
  return ctx;
};

export default ThemeContext;
