// src/components/ui/Sparkline.jsx
import { useId } from 'react';

/**
 * A small area chart, hand-built in SVG.
 *
 * No charting dependency on purpose: this draws one series, and recharts would
 * have cost ~100KB gzipped in the Vercel bundle to do it. The app already
 * hand-builds its radial progress rings the same way.
 *
 * How it stays responsive without distorting: the viewBox is a fixed 100x32 and
 * `preserveAspectRatio="none"` lets it stretch to any container. That alone
 * would smear the stroke into an oval, so every stroked element carries
 * `vectorEffect="non-scaling-stroke"` — the geometry stretches, the line weight
 * does not.
 *
 * Colour comes from `currentColor`, so a parent's text colour drives it and the
 * chart follows the theme with no props and no `dark:` variant.
 *
 * @param {number[]} data   Y values, oldest first. Fixed-length series expected.
 * @param {string[]} labels Optional x labels, same length as data.
 */
const Sparkline = ({ data = [], labels = [], className = '', showDot = true }) => {
  // useId, not a counter or Math.random: two sparklines on one page each need a
  // unique gradient id, and a duplicate id makes the second one silently adopt
  // the first one's fill.
  const gid = `spark-${useId().replace(/:/g, '')}`;

  if (!data.length) return null;

  const W = 100;
  const H = 32;
  const max = Math.max(...data);
  const min = Math.min(...data);

  // A flat series has no range to normalise against. Dividing by zero would put
  // every point at NaN and render nothing at all, so park a flat line mid-height
  // — which is also the honest picture of "no change".
  const span = max - min;
  const x = (i) => (data.length === 1 ? W / 2 : (i / (data.length - 1)) * W);
  const y = (v) => (span === 0 ? H / 2 : H - ((v - min) / span) * H);

  // Inset the line by a hair so a peak at max or a trough at min isn't clipped
  // in half by the viewBox edge.
  const PAD = 2;
  const yp = (v) => PAD + (y(v) / H) * (H - PAD * 2);

  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${yp(v)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;

  const lastX = x(data.length - 1);
  const lastY = yp(data[data.length - 1]);

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="relative min-h-0 flex-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={
            labels.length === data.length
              ? data.map((v, i) => `${labels[i]}: ${v}`).join(', ')
              : `Trend: ${data.join(', ')}`
          }
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={area} fill={`url(#${gid})`} />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* The end-point marker is an HTML element, NOT an SVG <circle>.
            preserveAspectRatio="none" scales x and y independently, which is
            what lets the chart fill any container — but it deforms geometry with
            it. A <circle> came out as a fat horizontal ellipse roughly 8x wider
            than tall; vectorEffect="non-scaling-stroke" doesn't help, since it
            preserves stroke WIDTH, not the shape of a filled path.
            Positioning it outside the SVG keeps it perfectly round at any size. */}
        {showDot && (
          <span
            className="pointer-events-none absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-surface"
            style={{ left: `${(lastX / W) * 100}%`, top: `${(lastY / H) * 100}%` }}
          />
        )}
      </div>

      {labels.length === data.length && (
        <div className="mt-2 flex shrink-0 justify-between text-[10px] font-medium text-fg-subtle">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
};

export default Sparkline;
