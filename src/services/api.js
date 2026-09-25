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

const request = async (method, path, { params, body, signal, auth = true, formData = false } = {}) => {
  const headers = { Accept: 'application/json' };
  const hasBody = body !== undefined;
  if (hasBody && !formData) headers['Content-Type'] = 'application/json';

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
      ...(hasBody ? { body: formData ? body : JSON.stringify(body) } : {}),
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
   * Returns { uid, institutionId, invited, inviteError }.
   * No password comes back — the account is created with an unusable one and the
   * student sets their own via the emailed link. `invited: false` means the
   * account exists but the email didn't send; re-send from the Access screen.
   */
  create: (data) => post('/api/students', data),

  /**
   * Public self-registration. auth:false — there is no session yet; this is the
   * request that creates the account the student will sign in with.
   *
   * Takes institutionId (chosen from institutionsApi.publicList) and a password
   * the student typed. Returns { success } and nothing else: no id, no token,
   * no profile. The next step is the sign-in form, which needs none of that.
   */
  register: (data) => request('POST', '/api/students/register', { body: data, auth: false }),

  update: async (id, data) => (await patch(`/api/students/${id}`, data)).student,

  remove: (id, secretCode) =>
    request('DELETE', `/api/students/${id}`, { body: { secretCode } }),

  /**
   * (Re)sends the set-password email. Covers "never got the invite" and "forgot
   * my password" alike.
   *
   * Note this does NOT change the student's current password — unlike the old
   * reset endpoint, which minted a new one and locked them out the instant an
   * admin clicked it. A recovery link is an offer; ignoring it changes nothing.
   */
  sendInvite: (id) => post(`/api/students/${id}/send-invite`),

  /**
   * Super-admin only. Sets a student's password directly, for when a recovery
   * link cannot reach them. There is no matching read — no endpoint anywhere
   * returns an existing password, because no readable copy of one exists.
   */
  setPassword: (id, password) => post(`/api/students/${id}/set-password`, { password }),

  /**
   * Switches an account on or off. Deactivating bans the login and ends live
   * sessions; nothing is deleted, and reactivating restores access with the
   * student's own password intact.
   */
  setStatus: async (id, active) =>
    (await post(`/api/students/${id}/status`, { active })).student,

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

  /**
   * The colleges a student can register under — { id, name } only, and no token
   * required. Institutions are created by the super-admin; this list is the
   * only way one reaches the registration form, so a student can pick a college
   * but never invent one.
   */
  publicList: async ({ signal } = {}) =>
    (await request('GET', '/api/institutions/public', { signal, auth: false })).institutions,

  uploadLogo: async (file, previousPublicId) => {
    const formData = new FormData();
    formData.append('logo', file);
    if (previousPublicId) formData.append('previousPublicId', previousPublicId);
    return request('POST', '/api/institutions/logo', {
      body: formData,
      formData: true,
    });
  },

  deleteLogo: async (publicId) =>
    request('DELETE', `/api/institutions/logo/${encodeURIComponent(publicId)}`),

  /** Creates the institution AND its admin login. Super-admin only. */
  create: (data) => post('/api/institutions', data),

  /** Pass adminPassword to reset the institution admin's password. */
  update: async (id, data) => (await patch(`/api/institutions/${id}`, data)).institution,

  remove: (id, secretCode) =>
    request('DELETE', `/api/institutions/${id}`, { body: { secretCode } }),
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

export const api = { studentsApi, institutionsApi, dashboardApi, request, BASE_URL };
export default api;
