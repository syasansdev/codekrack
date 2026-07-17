// src/services/api.js
//
// The ONLY place in the app that talks to the backend.
//
// Every call goes through request(), which is the single point that:
//   - attaches the Supabase access token
//   - turns a non-2xx into a thrown ApiError (React Query needs a rejection to
//     know a query failed; a resolved promise holding {error} looks like success)
//   - unwraps the { success, ... } envelope the API returns
//
// No component should ever call fetch() directly. If a screen needs data that
// isn't here, add it here.
import { getAccessToken } from '../lib/supabase';

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

/** An HTTP-shaped error, so callers can branch on status without parsing strings. */
export class ApiError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
  get isAuthError() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
}

const buildUrl = (path, params) => {
  const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      // Drop null/undefined/'' so we never send ?institutionId=null and have the
      // server read the literal string "null".
      if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
};

const request = async (method, path, { params, body, signal, auth = true } = {}) => {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = await getAccessToken();
    if (!token) {
      // Fail here rather than sending an anonymous request and getting a 401 —
      // the cause ("you are signed out") is clearer than the symptom.
      throw new ApiError('Not signed in', { status: 401, code: 'NO_SESSION' });
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(buildUrl(path, params), {
      method,
      headers,
      signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e; // React Query cancellation — not an error
    throw new ApiError(`Cannot reach the server. Is the backend running on ${BASE_URL}?`, {
      status: 0,
      code: 'NETWORK',
    });
  }

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!res.ok) {
    throw new ApiError(payload?.error || `Request failed (${res.status})`, {
      status: res.status,
      code: payload?.code,
      body: payload,
    });
  }

  return payload;
};

const get = (path, opts) => request('GET', path, opts);
const post = (path, body, opts) => request('POST', path, { ...opts, body: body ?? {} });
const patch = (path, body, opts) => request('PATCH', path, { ...opts, body: body ?? {} });
const del = (path, opts) => request('DELETE', path, opts);

// =============================================================================
// Students
// =============================================================================
export const studentsApi = {
  /** Scoped list. institutionId is a hint for super-admins; the server decides. */
  list: async ({ institutionId, signal } = {}) =>
    (await get('/api/students', { params: { institutionId }, signal })).students,

  detail: async (id, { signal } = {}) => (await get(`/api/students/${id}`, { signal })).student,

  /**
   * Who can actually get in. Returns { students, admins }, each carrying
   * invitedAt / lastSignInAt / accessState.
   *
   * Replaces `passwords`, which returned every student's plaintext password.
   * No password is stored any more, so there is nothing of that kind to fetch.
   */
  access: async ({ institutionId, signal } = {}) => {
    const r = await get('/api/students/access', { params: { institutionId }, signal });
    return { students: r.students, admins: r.admins };
  },

  /**
   * Returns { uid, institutionId, invited, inviteError }.
   * No password comes back — the account is created with an unusable one and the
   * student sets their own via the emailed link. `invited: false` means the
   * account exists but the email didn't send; re-send from the Access screen.
   */
  create: (data) => post('/api/students', data),

  update: async (id, data) => (await patch(`/api/students/${id}`, data)).student,

  remove: (id) => del(`/api/students/${id}`),

  /**
   * (Re)sends the set-password email. Covers "never got the invite" and "forgot
   * my password" alike.
   *
   * Note this does NOT change the student's current password — unlike the old
   * reset endpoint, which minted a new one and locked them out the instant an
   * admin clicked it. A recovery link is an offer; ignoring it changes nothing.
   */
  sendInvite: (id) => post(`/api/students/${id}/send-invite`),

  /** Marks the student's platforms pending for the next scraper run. */
  rescrape: (id) => post(`/api/students/${id}/rescrape`),

  /** The signed-in student's own record. */
  me: async ({ signal } = {}) => (await get('/api/students/me/profile', { signal })).student,

  /**
   * The signed-in student editing their own record. A much narrower allow-list
   * than the admin update — contact details and resume/linkedin links only.
   */
  updateMe: async (data) => (await patch('/api/students/me/profile', data)).student,
};

// =============================================================================
// Institutions
// =============================================================================
export const institutionsApi = {
  list: async ({ signal } = {}) => (await get('/api/institutions', { signal })).institutions,

  /** Creates the institution AND its admin login. Super-admin only. */
  create: (data) => post('/api/institutions', data),

  /** Pass adminPassword to reset the institution admin's password. */
  update: async (id, data) => (await patch(`/api/institutions/${id}`, data)).institution,

  remove: (id) => del(`/api/institutions/${id}`),
};

// =============================================================================
// Dashboard / leaderboard / scraping
// =============================================================================
export const dashboardApi = {
  stats: ({ institutionId, signal } = {}) =>
    get('/api/dashboard/stats', { params: { institutionId }, signal }),

  leaderboard: ({ platform = 'leetcode', institutionId, limit, signal } = {}) =>
    get('/api/dashboard/leaderboard', { params: { platform, institutionId, limit }, signal }),

  /** Student-facing board — scoped to the caller's own institution by the server. */
  studentLeaderboard: ({ platform = 'leetcode', limit, signal } = {}) =>
    get('/api/dashboard/leaderboard/student', { params: { platform, limit }, signal }),

  scrapingStatus: ({ institutionId, signal } = {}) =>
    get('/api/dashboard/scraping-status', { params: { institutionId }, signal }),
};

// =============================================================================
// Contests & the email scheduler
//
// These endpoints used to be called with a bare fetch() straight from five
// components, with no Authorization header — because the routes had no auth at
// all (SEC-01). They do now, so the calls belong here like everything else: one
// place that attaches the token, one place that shapes errors.
//
// Note the split in who may call what. /upcoming-contests is verifyToken because
// the student Header renders a contest calendar; everything else is verifyAdmin.
// =============================================================================
export const contestsApi = {
  /** Any signed-in user — the student Header shows these. */
  upcoming: async ({ signal } = {}) => {
    const r = await get('/api/email/upcoming-contests', { signal });
    return r.contests || r.data || [];
  },

  /** Admin only. */
  weekly: ({ signal } = {}) => get('/api/email/weekly-contests', { signal }),

  schedulerStatus: ({ signal } = {}) => get('/api/email/scheduler/status', { signal }),

  /** Admin only. Rate limited to 5/hr per admin — it emails every student. */
  sendNotifications: () => post('/api/email/send-contest-notifications'),

  startScheduler: () => post('/api/email/scheduler/start'),
  stopScheduler: () => post('/api/email/scheduler/stop'),

  /** Admin only. Rate limited — fires the weekly send immediately. */
  triggerScheduler: () => post('/api/email/scheduler/trigger'),
};

export const api = { studentsApi, institutionsApi, dashboardApi, contestsApi, request, BASE_URL };
export default api;
