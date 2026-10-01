// src/utils/rank.js
//
// Turns a student's raw platformData + the admin's configured thresholds
// into a single rank. Computed client-side, on demand, from data the page
// already has — so a rank is always current with the student's latest
// scrape and the admin's latest thresholds, with nothing to resync.
import { CONFIGURABLE_RANKS } from '../config/ranks';

/** Per-platform score, using the same fields the rest of the app reads. */
export const getPlatformScores = (platformData = {}) => ({
  leetcode: platformData?.leetcode?.totalSolved || 0,
  codeforces: platformData?.codeforces?.problemsSolved || 0,
  atcoder: platformData?.atcoder?.problemsSolved || 0,
  github: platformData?.github?.repositories || 0,
  hackerrank: platformData?.hackerrank?.problemsSolved || 0,
  hackerearth: platformData?.hackerearth?.problemsSolved || 0,
});

/**
 * thresholds: [{ rankKey, platform, minScore }]
 * Returns the highest tier where AT LEAST ONE platform the admin configured
 * a non-zero minimum for is met — hitting any single one of them is enough,
 * not all of them. A tier with nothing configured is unreachable rather than
 * free — "starter" is the fallback.
 */
export const computeRank = (scores, thresholds = []) => {
  const byRank = {};
  for (const t of thresholds) {
    if (!t || t.minScore <= 0) continue;
    (byRank[t.rankKey] ||= []).push(t);
  }

  for (let i = CONFIGURABLE_RANKS.length - 1; i >= 0; i--) {
    const tier = CONFIGURABLE_RANKS[i];
    const requirements = byRank[tier.key];
    if (!requirements || requirements.length === 0) continue;
    const meetsAny = requirements.some((r) => (scores[r.platform] || 0) >= r.minScore);
    if (meetsAny) return tier.key;
  }
  return 'starter';
};

/**
 * The next tier up and what's still missing — drives "X more to reach Y" UI.
 * Since only ONE configured platform needs to be met, progress is driven by
 * whichever platform is closest to its threshold (the easiest path up), not
 * by how many of them are satisfied.
 */
export const nextRankProgress = (scores, thresholds, currentKey) => {
  const order = ['starter', ...CONFIGURABLE_RANKS.map((r) => r.key)];
  const idx = order.indexOf(currentKey);
  if (idx === -1 || idx === order.length - 1) return null;

  const nextKey = order[idx + 1];
  const requirements = thresholds.filter((t) => t.rankKey === nextKey && t.minScore > 0);
  if (requirements.length === 0) return null; // next tier not configured yet

  const gaps = requirements
    .map((r) => {
      const have = scores[r.platform] || 0;
      return {
        platform: r.platform,
        have,
        need: r.minScore,
        remaining: Math.max(0, r.minScore - have),
        ratio: r.minScore > 0 ? Math.min(have / r.minScore, 1) : 0,
      };
    })
    .sort((a, b) => b.ratio - a.ratio); // closest-to-done first

  const percent = Math.round((gaps[0]?.ratio || 0) * 100);
  return { nextKey, gaps, percent };
};
