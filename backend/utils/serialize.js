// backend/utils/serialize.js
//
// Turns normalised Postgres rows back into the exact JSON shape the React
// components already render (platformUrls / platformData / scrapingStatus maps,
// camelCase keys, totalSolved).
//
// Why bother, instead of shipping the clean relational shape to the client?
// Because it keeps Phase 3 to "swap the data source" instead of "rewrite every
// render". The DB stays properly normalised; the wire format stays compatible.
// When the frontend is settled, this is the one file to change.

/** The scraped platforms — these get a platform_stats row each. */
export const PLATFORMS = ['leetcode', 'github', 'codeforces', 'atcoder'];

/**
 * Profile URLs that are NOT scraped. They live in profiles.links, because a CV
 * link has no scrape status, metric or rank — see 005_profile_links.sql.
 * On the wire they are merged back into platformUrls, which is the single map
 * the forms and views already use.
 */
export const LINK_KEYS = ['hackerrank', 'linkedin', 'resume'];

/** The SQL that feeds serializeStudent(). Callers add WHERE / ORDER BY / LIMIT. */
export const STUDENT_SELECT = `
  select
    p.id, p.email, p.name, p.display_name, p.role, p.institution_id,
    p.is_admin, p.is_super_admin,
    p.phone_number, p.register_number, p.roll_number, p.department, p.year,
    p.college, p.tenth_percentage, p.twelfth_percentage,
    p.streak, p.last_activity_date, p.links, p.invited_at,
    p.created_at, p.updated_at, p.last_login_at, p.created_by,
    i.name as institution_name,
    coalesce(st.total_solved, 0) as total_solved,
    st.last_scraped_at,
    coalesce((
      select json_agg(json_build_object(
        'platform',        ps.platform,
        'username',        ps.username,
        'profile_url',     ps.profile_url,
        'status',          ps.status,
        'metric',          ps.metric,
        'rating',          ps.rating,
        'max_rating',      ps.max_rating,
        'rank',            ps.rank,
        'data',            ps.data,
        'error',           ps.error,
        'last_updated',    ps.last_updated,
        'last_attempt_at', ps.last_attempt_at
      ))
      from public.platform_stats ps where ps.user_id = p.id
    ), '[]'::json) as platforms
  from public.profiles p
  left join public.institutions  i  on i.id = p.institution_id
  left join public.student_totals st on st.user_id = p.id
`;

const iso = (v) => (v instanceof Date ? v.toISOString() : v || null);
const num = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * One profile row (from STUDENT_SELECT) -> the student object the API returns.
 *
 * There is no `includeSecrets` option any more, and no endpoint that can ask for
 * one. It used to gate tempPassword — a plaintext credential this function was
 * capable of emitting, guarded only by a default-false flag that any future
 * caller could have flipped. The columns are gone (006), so the flag protects
 * nothing and the whole idea of a "secrets" mode is retired with it.
 */
export const serializeStudent = (row) => {
  if (!row) return null;

  const platformUrls = {};
  const platformData = {};
  const scrapingStatus = {};
  let lastUpdated = null;

  // Every platform key is always present (null when absent) — the components
  // index into these maps directly and Firestore always seeded all four.
  for (const p of PLATFORMS) {
    platformData[p] = null;
  }

  for (const p of row.platforms || []) {
    if (p.profile_url) platformUrls[p.platform] = p.profile_url;
    scrapingStatus[p.platform] = p.status;
    // `data` holds the scraper's own payload verbatim, which is what the
    // components read (data.totalSolved, data.repositories, ...).
    platformData[p.platform] = p.data && Object.keys(p.data).length ? p.data : null;
    const t = iso(p.last_attempt_at);
    if (t && (!lastUpdated || t > lastUpdated)) lastUpdated = t;
  }
  scrapingStatus.lastUpdated = lastUpdated;

  // Stitch the non-scraped links back in, so the client still sees ONE
  // platformUrls map containing all seven keys — the storage split (typed rows
  // vs jsonb) is a server-side concern and stops at this line.
  for (const [k, v] of Object.entries(row.links || {})) {
    if (v) platformUrls[k] = v;
  }

  const out = {
    id: row.id,
    uid: row.id,
    email: row.email,
    name: row.name,
    displayName: row.display_name,
    role: row.role,
    isAdmin: row.is_admin,
    isSuperAdmin: row.is_super_admin,
    institutionId: row.institution_id,
    institutionName: row.institution_name || null,

    phoneNumber: row.phone_number,
    registerNumber: row.register_number,
    rollNumber: row.roll_number,
    department: row.department,
    year: row.year,
    college: row.college,
    tenthPercentage: num(row.tenth_percentage),
    twelfthPercentage: num(row.twelfth_percentage),

    platformUrls,
    platformData,
    scrapingStatus,

    // Now a real number summed from platform_stats, rather than Firestore's
    // write-once-as-0 field that every consumer displayed as 0.
    totalSolved: row.total_solved ?? 0,
    lastScrapedAt: iso(row.last_scraped_at),
    streak: row.streak ?? 0,
    lastActivityDate: iso(row.last_activity_date),

    // When the set-password email was last sent. Whether they've USED it is
    // auth.users.last_sign_in_at, reported by GET /api/students/access.
    invitedAt: iso(row.invited_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    lastLoginAt: iso(row.last_login_at),
    createdBy: row.created_by,
  };

  return out;
};

export const serializeStudents = (rows) => rows.map((r) => serializeStudent(r));

/** Institution row -> legacy institution object. adminEmail/adminUid are joined in. */
export const serializeInstitution = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    contactEmail: row.contact_email,
    // Derived by join, not stored on the institution — see 001_init.sql note 2.
    adminEmail: row.admin_email || null,
    adminUid: row.admin_id || null,
    adminName: row.admin_name || null,
    studentCount: row.student_count ?? 0,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    createdBy: row.created_by,
  };
};

/**
 * Map a scraper payload onto the typed columns.
 * Each platform's headline metric differs — this is the single place that
 * knows which field is which, mirroring the `boards` config both leaderboards
 * use (AdminLeaderboard.jsx / Leaderboard.jsx).
 */
export const metricFor = (platform, data) => {
  if (!data) return 0;
  switch (platform) {
    case 'leetcode':   return Number(data.totalSolved) || 0;
    case 'github':     return Number(data.repositories) || 0;   // repos, not problems
    case 'codeforces': return Number(data.problemsSolved) || 0;
    case 'atcoder':    return Number(data.problemsSolved) || 0;
    default:           return 0;
  }
};

export default { PLATFORMS, STUDENT_SELECT, serializeStudent, serializeStudents, serializeInstitution, metricFor };
