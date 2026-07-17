// backend/routes/dashboardRoutes.js
//
// The read-only admin surfaces: dashboard stats, leaderboards, scraping status.
//
// All three used to work by fetching every student document to the browser and
// reducing in JavaScript. Here they are aggregates the database does in one
// round trip, so the wire carries the answer instead of the raw data.
import express from 'express';
import { one, many } from '../config/db.js';
import { verifyAdmin, verifyToken, scopeFor, NO_INSTITUTION } from '../middleware/supabaseAuth.js';
import { PLATFORMS } from '../utils/serialize.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Every platform's headline metric, matching the `boards` config both
// leaderboards use. Kept here so the API can validate ?platform=.
const METRIC_LABEL = {
  leetcode: 'Problems Solved',
  github: 'Repositories',
  codeforces: 'Problems Solved',
  atcoder: 'Problems Solved',
};

// =============================================================================
// GET /api/dashboard/stats   (any admin)
// Replaces getDashboardStats(), which pulled every student to the client.
// =============================================================================
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const institutionId = scopeFor(req, req.query.institutionId);
    const scoped = institutionId !== null;
    const params = scoped ? [institutionId] : [];
    const where = scoped ? 'and p.institution_id = $1' : '';

    const stats = await one(
      `select
         count(*)::int as total_students,
         count(*) filter (where p.created_at > now() - interval '7 days')::int as new_this_week,
         count(*) filter (where p.last_login_at > now() - interval '7 days')::int as active_this_week,
         coalesce(sum(st.total_solved), 0)::int as total_solved_problems,
         coalesce(round(avg(st.total_solved))::int, 0) as avg_solved_per_student
       from public.profiles p
       left join public.student_totals st on st.user_id = p.id
       where p.role = 'student' ${where}`,
      params
    );

    // Per-platform scrape health, one row per platform.
    const platformRows = await many(
      `select ps.platform,
              count(*)::int as total,
              count(*) filter (where ps.status = 'completed')::int as completed,
              count(*) filter (where ps.status = 'pending')::int as pending,
              count(*) filter (where ps.status = 'failed')::int as failed
         from public.platform_stats ps
         join public.profiles p on p.id = ps.user_id
        where p.role = 'student' ${where}
        group by ps.platform`,
      params
    );
    const platforms = {};
    for (const p of PLATFORMS) {
      const r = platformRows.find((x) => x.platform === p);
      platforms[p] = r
        ? { total: r.total, completed: r.completed, pending: r.pending, failed: r.failed }
        : { total: 0, completed: 0, pending: 0, failed: 0 };
    }

    // Sign-ups per day for the last 7 days, zero-filled so the chart never has
    // gaps on quiet days (generate_series does the filling, not the client).
    const recentActivity = await many(
      `select to_char(d.day, 'YYYY-MM-DD') as date,
              count(p.id)::int as count
         from generate_series(current_date - interval '6 days', current_date, interval '1 day') as d(day)
         left join public.profiles p
           on p.created_at::date = d.day and p.role = 'student' ${scoped ? 'and p.institution_id = $1' : ''}
        group by d.day order by d.day asc`,
      params
    );

    const institutionCount = req.user.isSuperAdmin
      ? (await one('select count(*)::int as n from public.institutions where deleted_at is null')).n
      : 1;

    res.json({
      success: true,
      stats: {
        totalStudents: stats.total_students,
        newThisWeek: stats.new_this_week,
        activeThisWeek: stats.active_this_week,
        // A real number now. Firestore summed a field nothing ever wrote,
        // so this stat used to read 0 no matter how much students solved.
        totalSolvedProblems: stats.total_solved_problems,
        avgSolvedPerStudent: stats.avg_solved_per_student,
        totalInstitutions: institutionCount,
        platforms,
      },
      recentActivity,
      scopedTo: institutionId,
    });
  } catch (e) {
    logger.error('Dashboard stats failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// GET /api/dashboard/leaderboard?platform=leetcode&limit=50   (any admin)
// GET /api/dashboard/leaderboard/student  (student-facing, own institution)
//
// Sorted in SQL by the platform's own metric. Only 'completed' scrapes score,
// which is exactly Leaderboard.jsx:136's rule — a pending or failed scrape must
// not park someone at 0 above someone who simply hasn't been scraped yet.
// =============================================================================
const leaderboardQuery = async (platform, institutionId, limit) => {
  const scoped = institutionId !== null;
  const params = [platform];
  let where = `where p.role = 'student' and ps.platform = $1 and ps.status = 'completed'`;
  if (scoped) {
    params.push(institutionId);
    where += ` and p.institution_id = $${params.length}`;
  }
  params.push(limit);

  return many(
    `select p.id, p.name, p.email, p.display_name, p.roll_number, p.department, p.year,
            p.college, p.institution_id, i.name as institution_name,
            ps.username, ps.metric, ps.rating, ps.max_rating, ps.rank,
            ps.data, ps.last_updated,
            rank() over (order by ps.metric desc) as position
       from public.profiles p
       join public.platform_stats ps on ps.user_id = p.id
       left join public.institutions i on i.id = p.institution_id
       ${where}
       order by ps.metric desc, p.name asc
       limit $${params.length}`,
    params
  );
};

const serializeBoard = (rows) =>
  rows.map((r) => ({
    id: r.id,
    name: r.name,
    displayName: r.display_name,
    email: r.email,
    rollNumber: r.roll_number,
    department: r.department,
    year: r.year,
    college: r.college,
    institutionId: r.institution_id,
    institutionName: r.institution_name,
    position: Number(r.position),
    username: r.username,
    metric: r.metric,
    rating: r.rating,
    maxRating: r.max_rating,
    rank: r.rank,
    data: r.data,
    lastUpdated: r.last_updated ? new Date(r.last_updated).toISOString() : null,
  }));

router.get('/leaderboard', verifyAdmin, async (req, res) => {
  try {
    const platform = String(req.query.platform || 'leetcode').toLowerCase();
    if (!PLATFORMS.includes(platform)) {
      return res
        .status(400)
        .json({ success: false, error: `platform must be one of: ${PLATFORMS.join(', ')}` });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const institutionId = scopeFor(req, req.query.institutionId);
    const rows = await leaderboardQuery(platform, institutionId, limit);
    res.json({
      success: true,
      platform,
      metricLabel: METRIC_LABEL[platform],
      leaderboard: serializeBoard(rows),
      scopedTo: institutionId,
    });
  } catch (e) {
    logger.error('Leaderboard failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * Student-facing board. Note verifyToken, not verifyAdmin — and the scope comes
 * from the caller's OWN profile, never a query param. A student cannot widen it
 * to other institutions, and a student with no institution sees an empty board
 * rather than everyone's.
 */
router.get('/leaderboard/student', verifyToken, async (req, res) => {
  try {
    const platform = String(req.query.platform || 'leetcode').toLowerCase();
    if (!PLATFORMS.includes(platform)) {
      return res
        .status(400)
        .json({ success: false, error: `platform must be one of: ${PLATFORMS.join(', ')}` });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

    // Super-admins aside, everyone is pinned to their own institution.
    // NO_INSTITUTION is a valid uuid that matches nothing — the string sentinel
    // this used to carry made Postgres reject the whole query (22P02), so a
    // student with no institution got a 500 instead of an empty board.
    const institutionId = req.user.isSuperAdmin
      ? null
      : req.user.institutionId || NO_INSTITUTION;

    const rows = await leaderboardQuery(platform, institutionId, limit);
    res.json({
      success: true,
      platform,
      metricLabel: METRIC_LABEL[platform],
      leaderboard: serializeBoard(rows),
      me: req.user.uid,
    });
  } catch (e) {
    logger.error('Student leaderboard failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// GET /api/dashboard/scraping-status   (any admin)
// Replaces getAllScrapingStatus(). One row per (student, platform).
// =============================================================================
router.get('/scraping-status', verifyAdmin, async (req, res) => {
  try {
    const institutionId = scopeFor(req, req.query.institutionId);
    const scoped = institutionId !== null;
    const params = scoped ? [institutionId] : [];

    const rows = await many(
      `select p.id as user_id, p.name, p.email, p.roll_number,
              p.institution_id, i.name as institution_name,
              ps.platform, ps.username, ps.profile_url, ps.status, ps.metric,
              ps.data, ps.error, ps.last_updated, ps.last_attempt_at
         from public.profiles p
         join public.platform_stats ps on ps.user_id = p.id
         left join public.institutions i on i.id = p.institution_id
        where p.role = 'student' ${scoped ? 'and p.institution_id = $1' : ''}
        order by p.name asc, ps.platform asc`,
      params
    );

    // Group into one entry per student, with a per-platform map — the shape
    // ScrapingStatus.jsx already renders.
    const byStudent = new Map();
    for (const r of rows) {
      if (!byStudent.has(r.user_id)) {
        byStudent.set(r.user_id, {
          id: r.user_id,
          name: r.name,
          email: r.email,
          rollNumber: r.roll_number,
          institutionId: r.institution_id,
          institutionName: r.institution_name,
          platformUrls: {},
          scrapingStatus: { lastUpdated: null },
          platformData: {},
        });
      }
      const s = byStudent.get(r.user_id);
      s.platformUrls[r.platform] = r.profile_url;
      s.scrapingStatus[r.platform] = r.status;
      s.platformData[r.platform] = r.data || null;
      if (r.error) (s.errors ||= {})[r.platform] = r.error;
      const t = r.last_attempt_at ? new Date(r.last_attempt_at).toISOString() : null;
      if (t && (!s.scrapingStatus.lastUpdated || t > s.scrapingStatus.lastUpdated)) {
        s.scrapingStatus.lastUpdated = t;
      }
    }

    const summary = await one(
      `select count(*) filter (where ps.status = 'pending')::int     as pending,
              count(*) filter (where ps.status = 'in_progress')::int as in_progress,
              count(*) filter (where ps.status = 'completed')::int   as completed,
              count(*) filter (where ps.status = 'failed')::int      as failed
         from public.platform_stats ps
         join public.profiles p on p.id = ps.user_id
        where p.role = 'student' ${scoped ? 'and p.institution_id = $1' : ''}`,
      params
    );

    res.json({
      success: true,
      statuses: [...byStudent.values()],
      summary,
      scopedTo: institutionId,
    });
  } catch (e) {
    logger.error('Scraping status failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
