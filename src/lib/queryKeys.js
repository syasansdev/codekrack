// src/lib/queryKeys.js
//
// Every React Query key in the app, in one place.
//
// Keys are hierarchical, so invalidation can be broad or surgical:
//   queryKeys.students.all          -> ['students']            invalidates every student query
//   queryKeys.students.list(instId) -> ['students','list',id]  invalidates one scoped list
//
// invalidateQueries(['students']) matches every key that STARTS with ['students'],
// which is why the prefixes matter: they are the vocabulary the SSE handler uses
// to turn "platform_stats changed" into the right refetches.
//
// The institutionId in a key is not authorization — the server decides scope
// regardless of what we ask for. It is here so that a super-admin switching
// between institutions gets separate cache entries instead of one entry that
// flip-flops.

export const queryKeys = {
  // --- current user ---------------------------------------------------------
  me: {
    all: ['me'],
    profile: () => ['me', 'profile'],
  },

  // --- students -------------------------------------------------------------
  students: {
    all: ['students'],
    lists: () => ['students', 'list'],
    list: (institutionId = null) => ['students', 'list', institutionId ?? 'all'],
    details: () => ['students', 'detail'],
    detail: (id) => ['students', 'detail', id],
    access: (institutionId = null) => ['students', 'access', institutionId ?? 'all'],
  },

  // --- institutions ---------------------------------------------------------
  institutions: {
    all: ['institutions'],
    lists: () => ['institutions', 'list'],
    list: () => ['institutions', 'list'],
  },

  // --- dashboard ------------------------------------------------------------
  dashboard: {
    all: ['dashboard'],
    stats: (institutionId = null) => ['dashboard', 'stats', institutionId ?? 'all'],
  },

  // --- leaderboard (SSE-backed) --------------------------------------------
  leaderboard: {
    all: ['leaderboard'],
    admin: (platform, institutionId = null) => [
      'leaderboard', 'admin', platform, institutionId ?? 'all',
    ],
    student: (platform) => ['leaderboard', 'student', platform],
  },

  // --- scraping status (SSE-backed) ----------------------------------------
  scraping: {
    all: ['scraping'],
    status: (institutionId = null) => ['scraping', 'status', institutionId ?? 'all'],
  },
};

/**
 * Maps an SSE topic to the query prefixes it makes stale.
 *
 * The server names WHAT CHANGED in the database ('platform_stats'); the client
 * decides WHICH SCREENS care. Keeping the translation here means the backend
 * never needs to know how the frontend is organised, and a new screen just adds
 * a prefix rather than requiring a server change.
 *
 * Per the agreed design, only the two realtime surfaces react to SSE. Everything
 * else is invalidated by the mutation that caused it, which needs no round trip
 * through Postgres to find out about its own write.
 */
export const TOPIC_INVALIDATIONS = {
  // The scraper writes here — the one change no mutation of ours can announce.
  platform_stats: [queryKeys.leaderboard.all, queryKeys.scraping.all],
  // Kept minimal on purpose. Student/institution edits already invalidate
  // locally via their mutations.
  profiles: [],
  institutions: [],
};

export default queryKeys;
