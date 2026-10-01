// src/components/RankBadge.jsx
//
// Visual face of the rank system. Two variants built on the same ladder
// (src/config/ranks.js) and the same computation (src/utils/rank.js), so a
// student's immersive dashboard banner and the admin's "view student" chip
// always agree on who is what rank.
import { motion } from 'framer-motion';
import { rankByKey, rankIndex, RANK_TIERS } from '../config/ranks';
import { nextRankProgress } from '../utils/rank';

/** Small badge: an icon + label, themed per rank. Used in compact headers. */
export const RankChip = ({ rankKey, size = 'md' }) => {
  const rank = rankByKey(rankKey);
  const Icon = rank.icon;
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px] gap-1' : 'px-3 py-1 text-xs gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold uppercase tracking-wide shadow-sm bg-gradient-to-r ${rank.gradient} ${rank.text} ${pad}`}
      style={{ boxShadow: `0 2px 10px ${rank.glow}` }}
    >
      <Icon size={size === 'sm' ? 12 : 14} />
      {rank.label}
    </span>
  );
};

/**
 * Full immersive banner for the student dashboard. Shows the earned rank with
 * a themed gradient + glow, and — unless already at the top — a progress
 * readout of what's still needed for the next tier.
 */
export const RankBanner = ({ rankKey, scores, thresholds = [] }) => {
  const rank = rankByKey(rankKey);
  const Icon = rank.icon;
  const idx = rankIndex(rankKey);
  const progress = nextRankProgress(scores, thresholds, rankKey);
  const nextRank = progress ? rankByKey(progress.nextKey) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${rank.gradient} p-6 shadow-xl`}
      style={{ boxShadow: `0 20px 60px -15px ${rank.glow}` }}
    >
      {/* Decorative sheen */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-black/10 blur-3xl" />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <motion.div
            initial={{ scale: 0.6, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.15 }}
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm ring-2 ring-white/30"
          >
            <Icon size={32} className={rank.text} strokeWidth={2.2} />
          </motion.div>
          <div>
            <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${rank.text} opacity-80`}>
              {rank.symbol} Tier · Rank {idx + 1} of {RANK_TIERS.length}
            </p>
            <h3 className={`text-2xl font-black tracking-tight ${rank.text}`}>{rank.label}</h3>
            <p className={`text-sm ${rank.text} opacity-85`}>{rank.tagline}</p>
          </div>
        </div>

        {progress && nextRank ? (
          <div className="sm:w-64">
            <div className={`mb-1.5 flex items-center justify-between text-xs font-semibold ${rank.text} opacity-90`}>
              <span>Next: {nextRank.label}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/20">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress.percent}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                className="h-full rounded-full bg-white/90"
              />
            </div>
            <p className={`mt-2 text-[10px] font-semibold uppercase tracking-wide ${rank.text} opacity-70`}>
              Reach any one:
            </p>
            <ul className={`mt-0.5 space-y-0.5 text-[11px] ${rank.text} opacity-85`}>
              {progress.gaps.slice(0, 2).map((g) => (
                <li key={g.platform} className="capitalize">
                  {g.remaining > 0 ? `${g.remaining} more on ${g.platform}` : `${g.platform} — done!`}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className={`rounded-xl bg-white/15 px-4 py-2 text-center text-xs font-bold uppercase tracking-wide ${rank.text}`}>
            {idx === RANK_TIERS.length - 1 ? 'Peak Rank Reached' : 'Next tier not configured yet'}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default RankBanner;
