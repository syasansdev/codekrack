// backend/routes/rankRoutes.js
//
// Admin-configurable rank tiers (Contender/Climber/Challenger/Master/
// Grandmaster). An institution admin sets a minimum score per platform for
// each tier; "starter" is the implicit floor everyone has and is never
// stored. Thresholds are read by both students (to render their own badge)
// and admins (to edit them), so GET is behind verifyToken, not verifyAdmin.
import express from 'express';
import { many, tx } from '../config/db.js';
import { verifyToken, verifyAdmin, scopeFor, NO_INSTITUTION } from '../middleware/supabaseAuth.js';
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
// Any signed-in user. Students get their own institution's thresholds (the
// server decides, same as every other scoped read); a super-admin may pass
// institutionId to look at a specific one.
// =============================================================================
router.get('/thresholds', verifyToken, async (req, res) => {
  try {
    const institutionId = scopeFor(req, req.query.institutionId);
    if (!institutionId) {
      // Super-admin with no institution picked yet — nothing to show.
      return res.json({ success: true, thresholds: [] });
    }
    const rows = await many(
      `select rank_key, platform, min_score
         from public.rank_tier_thresholds
        where institution_id = $1
        order by rank_key, platform`,
      [institutionId]
    );
    res.json({ success: true, thresholds: rows.map(serialize) });
  } catch (e) {
    logger.error('List rank thresholds failed:', e);
    res.status(500).json({ success: false, error: 'Could not load rank thresholds.' });
  }
});

// =============================================================================
// PUT /api/ranks/thresholds   (admin)
// Body: { institutionId? (super-admin only), thresholds: [{ rankKey, platform, minScore }] }
// Replaces the full set for the institution in one transaction — simpler and
// safer than diffing, and the admin screen always submits the whole grid.
// =============================================================================
router.put('/thresholds', verifyAdmin, async (req, res) => {
  try {
    const institutionId = scopeFor(req, req.body?.institutionId);
    if (!institutionId || institutionId === NO_INSTITUTION) {
      return res.status(400).json({ success: false, error: 'No institution to configure.' });
    }

    const incoming = Array.isArray(req.body?.thresholds) ? req.body.thresholds : [];
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
    });

    const saved = await many(
      `select rank_key, platform, min_score
         from public.rank_tier_thresholds
        where institution_id = $1
        order by rank_key, platform`,
      [institutionId]
    );
    res.json({ success: true, thresholds: saved.map(serialize) });
  } catch (e) {
    logger.error('Update rank thresholds failed:', e);
    res.status(500).json({ success: false, error: 'Could not save rank thresholds.' });
  }
});

export default router;
