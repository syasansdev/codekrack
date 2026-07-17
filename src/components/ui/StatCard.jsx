// src/components/ui/StatCard.jsx
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * The headline metric tile.
 *
 * (There was a StatCard.jsx at src/components/StatCard.jsx. It was exported and
 * imported by nothing — every screen inlined its own card markup instead, which
 * is why no two stat rows in the app looked alike. That file is deleted; this
 * replaces it and is actually wired up.)
 */

const EASE_OUT_EXPO = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Counts up to `value` on mount.
 *
 * rAF, not setInterval: a 60fps interval fights the compositor and drifts under
 * load. rAF also pauses in a background tab, so a dashboard left open in another
 * tab doesn't burn frames animating numbers nobody is looking at.
 */
const useCountUp = (value, duration = 900) => {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (typeof value !== 'number' || Number.isNaN(value)) return undefined;

    // Someone who asked for reduced motion gets the number, not the show.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setShown(value);
      from.current = value;
      return undefined;
    }

    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    let raf;

    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      setShown(Math.round(origin + delta * EASE_OUT_EXPO(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return shown;
};

/**
 * @param {string}  label     e.g. "Total students"
 * @param {number}  value     the metric
 * @param {node}    icon      a lucide icon element
 * @param {string}  tone      brand | accent | success | warn | danger
 * @param {string}  hint      small caption under the value
 * @param {number}  delta     signed change; renders a +/- pill when present
 * @param {node}    children  optional slot (a <Sparkline/>) under the value
 * @param {boolean} loading   skeleton instead of a misleading 0
 */
const StatCard = ({
  label,
  value,
  icon,
  tone = 'brand',
  hint,
  delta,
  children,
  loading = false,
  className = '',
}) => {
  const shown = useCountUp(loading ? 0 : Number(value) || 0);

  // Static class strings, not `bg-tint-${tone}`. Tailwind scans source as plain
  // text and never sees an interpolated class, so the composed name would be
  // purged and the tile would render with no fill at all — the same failure the
  // old dashboard's `bg-white-100` had.
  const TONE = {
    brand: { fill: 'bg-tint-brand', ink: 'text-on-brand' },
    accent: { fill: 'bg-tint-accent', ink: 'text-on-accent' },
    success: { fill: 'bg-tint-success', ink: 'text-on-success' },
    warn: { fill: 'bg-tint-warn', ink: 'text-on-warn' },
    danger: { fill: 'bg-tint-danger', ink: 'text-on-danger' },
  }[tone] ?? { fill: 'bg-tint-brand', ink: 'text-on-brand' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`group relative overflow-hidden rounded-2xl border border-edge bg-surface p-5
                  shadow-elite transition-shadow duration-300 hover:shadow-elite-lg ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            {label}
          </p>

          {loading ? (
            <div className="mt-2 h-9 w-24 animate-pulse rounded-lg bg-surface-3" />
          ) : (
            <p className="mt-1 font-display text-3xl font-bold tracking-tightest text-fg tabular-nums">
              {shown.toLocaleString()}
            </p>
          )}

          {hint && !loading && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
        </div>

        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONE.fill} ${TONE.ink}`}>
          {icon}
        </span>
      </div>

      {typeof delta === 'number' && !loading && (
        <span
          className={`mt-3 ${delta > 0 ? 'badge-success' : delta < 0 ? 'badge-danger' : 'badge-neutral'}`}
        >
          {delta > 0 ? '↑' : delta < 0 ? '↓' : '–'} {Math.abs(delta).toLocaleString()} this week
        </span>
      )}

      {children && <div className={`mt-4 ${TONE.ink}`}>{children}</div>}
    </motion.div>
  );
};

export default StatCard;
