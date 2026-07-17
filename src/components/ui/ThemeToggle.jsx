// src/components/ui/ThemeToggle.jsx
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * One-click light/dark toggle.
 *
 * Deliberately a two-state button rather than a light -> dark -> system cycle:
 * a cycle makes one of every three clicks appear to do nothing (when "system"
 * already matches what you're looking at), which reads as a broken button.
 * "Follow my OS" is still reachable via useSystemTheme() from the context —
 * it belongs in settings, not on a control people hit in passing.
 *
 * The icon shows the CURRENT theme, and the label says what the click will do,
 * so the two never contradict each other for a screen-reader user.
 */
const ThemeToggle = ({ className = '' }) => {
  const { isDark, toggleTheme } = useTheme();
  const next = isDark ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`relative inline-flex h-9 w-9 items-center justify-center rounded-xl
                  border border-edge bg-surface-2 text-fg-muted
                  transition-colors duration-200
                  hover:border-edge-strong hover:text-fg
                  focus-visible:outline-none ${className}`}
    >
      {/* Both icons occupy the same cell so the button never reflows mid-swap. */}
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={isDark ? 'moon' : 'sun'}
          initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {isDark ? <Moon size={17} strokeWidth={2} /> : <Sun size={17} strokeWidth={2} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
};

export default ThemeToggle;
