// backend/routes/rankRoutes.js
//
// Admin-configurable rank tiers (Contender/Climber/Challenger/Master/
// Grandmaster). A super-admin — and only a super-admin, see verifySuperAdmin
// below — sets a minimum score per platform for each tier; a student earns
// the tier by meeting ANY ONE of the platform minimums configured for it (see
// src/utils/rank.js computeRank — the exact mirror of this). "starter" is the
// implicit floor everyone has and is never stored.
//
// Two scopes share the same table (016/017):
//   institution_id = NULL   -> global default, applies to every institution
//   institution_id = <uuid> -> that institution's own override
// A rank+platform cell set at the institution level always wins over the
// global one; where the institution has nothing set, the global value (if
// any) applies. Reading "effective" thresholds (what a student is actually
// judged against) merges the two; reading "raw" is what the super-admin edits
// — one scope at a time, with no merge, so edits are exact rather than a
// resolved blend.
import express from 'express';
import { many, tx } from '../config/db.js';
import { verifyToken, verifySuperAdmin, scopeFor, NO_INSTITUTION } from '../middleware/supabaseAuth.js';
import logger from '../utils/logger.js';

const router = express.Router();

const RANK_KEYS = ['contender', 'climber', 'challenger', 'master', 'grandmaster'];
const PLATFORMS = ['leetcode', 'codeforces', 'atcoder', 'github', 'hackerrank', 'hackerearth'];

const serialize = (row) => ({
  rankKey: row.rank_key,
  platform: row.platform,
  minScore: row.min_score,
});

// =============================================================================
// GET /api/ranks/thresholds
//
// Default (no `mode`): EFFECTIVE thresholds for one institution — global rows
// with that institution's own overrides layered on top, one entry per
// (rank, platform). Any signed-in user can read this; it's what renders a
// student's own badge and what an admin's "view student" modal reads.
//
// mode=raw: the UNMERGED rows for exactly one scope, super-admin only — what
// the Rank Tiers editor loads. Pass institutionId for one college, or
// global=true for the "All institutions" defaults.
// =============================================================================
router.get('/thresholds', verifyToken, async (req, res) => {
  try {
    if (req.query.mode === 'raw') {
      if (!req.user.isSuperAdmin) {
        return res.status(403).json({ success: false, error: 'Forbidden: super-admin privileges required' });
      }
      const rows =
        req.query.global === 'true'
          ? await many(
              `select rank_key, platform, min_score
                 from public.rank_tier_thresholds
                where institution_id is null
                order by rank_key, platform`
            )
          : await many(
              `select rank_key, platform, min_score
                 from public.rank_tier_thresholds
                where institution_id = $1
                order by rank_key, platform`,
              [req.query.institutionId || NO_INSTITUTION]
            );
      return res.json({ success: true, thresholds: rows.map(serialize) });
    }

    const institutionId = scopeFor(req, req.query.institutionId);
    const globalRows = await many(
      `select rank_key, platform, min_score
         from public.rank_tier_thresholds
        where institution_id is null`
    );
    const institutionRows =
      institutionId && institutionId !== NO_INSTITUTION
        ? await many(
            `select rank_key, platform, min_score
               from public.rank_tier_thresholds
              where institution_id = $1`,
            [institutionId]
          )
        : [];

    // Institution-specific rows win: inserted after, so they overwrite the
    // global entry for the same (rank, platform) key in the map.
    const merged = new Map();
    for (const row of globalRows) merged.set(`${row.rank_key}|${row.platform}`, row);
    for (const row of institutionRows) merged.set(`${row.rank_key}|${row.platform}`, row);

    res.json({ success: true, thresholds: [...merged.values()].map(serialize) });
  } catch (e) {
    logger.error('List rank thresholds failed:', e);
    res.status(500).json({ success: false, error: 'Could not load rank thresholds.' });
  }
});

// =============================================================================
// PUT /api/ranks/thresholds   (super-admin only)
// Body: { institutionId: <uuid> | null, thresholds: [{ rankKey, platform, minScore }] }
// institutionId: null means "the global/All-institutions default". Replaces
// the full raw set for that one scope in a transaction.
// =============================================================================
router.put('/thresholds', verifySuperAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    if (!Object.prototype.hasOwnProperty.call(body, 'institutionId')) {
      return res
        .status(400)
        .json({ success: false, error: 'institutionId is required (use null for the global default).' });
    }
    const institutionId = body.institutionId === undefined ? null : body.institutionId;
    const isGlobal = institutionId === null;

    const incoming = Array.isArray(body.thresholds) ? body.thresholds : [];
    const rows = [];
    for (const entry of incoming) {
      const rankKey = String(entry?.rankKey || '');
      const platform = String(entry?.platform || '');
      const minScore = Number(entry?.minScore);
      if (!RANK_KEYS.includes(rankKey)) {
        return res.status(400).json({ success: false, error: `Invalid rank: ${rankKey}` });
      }
      if (!PLATFORMS.includes(platform)) {
        return res.status(400).json({ success: false, error: `Invalid platform: ${platform}` });
      }
      if (!Number.isFinite(minScore) || minScore < 0) {
        return res.status(400).json({ success: false, error: `Invalid score for ${rankKey}/${platform}` });
      }
      rows.push({ rankKey, platform, minScore: Math.round(minScore) });
    }

    await tx(async (client) => {
      if (isGlobal) {
        await client.query('delete from public.rank_tier_thresholds where institution_id is null');
        for (const row of rows) {
          await client.query(
            `insert into public.rank_tier_thresholds (institution_id, rank_key, platform, min_score)
             values (null, $1, $2, $3)`,
            [row.rankKey, row.platform, row.minScore]
          );
        }
      } else {
        await client.query('delete from public.rank_tier_thresholds where institution_id = $1', [
          institutionId,
        ]);
        for (const row of rows) {
          await client.query(
            `insert into public.rank_tier_thresholds (institution_id, rank_key, platform, min_score)
             values ($1, $2, $3, $4)`,
            [institutionId, row.rankKey, row.platform, row.minScore]
          );
        }
      }
    });

    const saved = isGlobal
      ? await many(
          `select rank_key, platform, min_score from public.rank_tier_thresholds
            where institution_id is null order by rank_key, platform`
        )
      : await many(
          `select rank_key, platform, min_score from public.rank_tier_thresholds
            where institution_id = $1 order by rank_key, platform`,
          [institutionId]
        );
    res.json({ success: true, thresholds: saved.map(serialize) });
  } catch (e) {
    logger.error('Update rank thresholds failed:', e);
    res.status(500).json({ success: false, error: 'Could not save rank thresholds.' });
  }
});

export default router;
