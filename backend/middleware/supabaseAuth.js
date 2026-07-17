// backend/middleware/supabaseAuth.js
//
// Supabase replacement for authMiddleware.js. Same exported names, so routes
// only change their import line.
//
// KEY DIFFERENCE FROM THE FIREBASE VERSION — and it is a security fix, not a
// port. The old middleware trusted `decodedToken.admin`, a claim baked into the
// JWT. Claims go stale: demote an admin and their existing token still says
// admin:true until it expires (up to an hour), and revoking the role has no
// effect until then. Here the token proves IDENTITY ONLY. Every privilege
// decision reads the live `profiles` row, so a demotion takes effect on the
// very next request. That lookup is a primary-key hit — sub-millisecond.
import { supabaseAdmin } from '../config/supabase.js';
import { one } from '../config/db.js';
import logger from '../utils/logger.js';

const bearer = (req) => {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  const t = h.slice(7).trim();
  return t || null;
};

/**
 * Resolve a request to { uid, email, role, institutionId, ... }.
 * Returns null when the token is missing/invalid or has no profile.
 */
const resolveUser = async (req) => {
  const token = bearer(req);
  if (!token) return { error: 'NO_TOKEN' };

  // getUser() validates the signature AND that the user still exists / is not
  // banned — something local JWT verification alone cannot tell us.
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { error: /expired/i.test(error?.message || '') ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN' };
  }

  const profile = await one(
    `select id, email, name, display_name, role, institution_id, is_admin, is_super_admin
       from public.profiles where id = $1`,
    [data.user.id]
  );

  // An auth user with no profile is a broken account (half-created, or the
  // profile was deleted). Fail closed rather than guessing a role.
  if (!profile) return { error: 'NO_PROFILE' };

  return {
    user: {
      uid: profile.id,
      id: profile.id,
      email: profile.email,
      name: profile.name,
      displayName: profile.display_name,
      role: profile.role,
      institutionId: profile.institution_id,
      isAdmin: profile.is_admin,
      isSuperAdmin: profile.is_super_admin,
      // Compatibility with code that read Firebase custom claims:
      admin: profile.is_admin,
      superadmin: profile.is_super_admin,
    },
  };
};

const deny = (res, code) => {
  const map = {
    NO_TOKEN: [401, 'Unauthorized: No token provided'],
    TOKEN_EXPIRED: [401, 'Unauthorized: Token expired'],
    INVALID_TOKEN: [401, 'Unauthorized: Invalid token'],
    NO_PROFILE: [403, 'Forbidden: No profile for this account'],
  };
  const [status, error] = map[code] || [401, 'Unauthorized'];
  return res.status(status).json({ success: false, error, code });
};

/** Any authenticated user with a profile. */
export const verifyToken = async (req, res, next) => {
  try {
    const { user, error } = await resolveUser(req);
    if (error) return deny(res, error);
    req.user = user;
    next();
  } catch (e) {
    logger.error('verifyToken failed:', e.message);
    res.status(500).json({ success: false, error: 'Auth check failed' });
  }
};

/** Admin or super-admin. */
export const verifyAdmin = async (req, res, next) => {
  try {
    const { user, error } = await resolveUser(req);
    if (error) return deny(res, error);
    if (!user.isAdmin) {
      logger.warn(`Admin access denied: ${user.email} (role=${user.role})`);
      return res
        .status(403)
        .json({ success: false, error: 'Forbidden: Admin privileges required', code: 'NOT_ADMIN' });
    }
    req.user = user;
    next();
  } catch (e) {
    logger.error('verifyAdmin failed:', e.message);
    res.status(500).json({ success: false, error: 'Auth check failed' });
  }
};

/** Super-admin only. */
export const verifySuperAdmin = async (req, res, next) => {
  try {
    const { user, error } = await resolveUser(req);
    if (error) return deny(res, error);
    if (!user.isSuperAdmin) {
      logger.warn(`Super-admin access denied: ${user.email} (role=${user.role})`);
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Super-admin privileges required',
        code: 'NOT_SUPERADMIN',
      });
    }
    req.user = user;
    next();
  } catch (e) {
    logger.error('verifySuperAdmin failed:', e.message);
    res.status(500).json({ success: false, error: 'Auth check failed' });
  }
};

/** Attaches req.user when a valid token is present; never rejects. */
export const optionalAuth = async (req, _res, next) => {
  try {
    const { user } = await resolveUser(req);
    if (user) req.user = user;
  } catch { /* ignore — this path is best-effort by definition */ }
  next();
};

/** Restrict to specific roles, e.g. checkRole(['admin', 'superadmin']). */
export const checkRole = (allowedRoles) => async (req, res, next) => {
  try {
    const { user, error } = await resolveUser(req);
    if (error) return deny(res, error);
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: requires one of: ${allowedRoles.join(', ')}`,
        code: 'INSUFFICIENT_ROLE',
      });
    }
    req.user = user;
    next();
  } catch (e) {
    logger.error('checkRole failed:', e.message);
    res.status(500).json({ success: false, error: 'Auth check failed' });
  }
};

/**
 * The institution a request is allowed to touch.
 *   super-admin      -> the one they asked for, or null meaning "all"
 *   institution admin -> ALWAYS their own; the client's value is ignored
 * This is the server-side twin of useAdminScope's fail-closed rule, and the
 * single place that decides scope. Routes must not re-derive it.
 */
export const scopeFor = (req, requestedInstitutionId = null) => {
  if (req.user.isSuperAdmin) return requestedInstitutionId || null;
  return req.user.institutionId || '__no_institution__';
};

export const isAdmin = verifyAdmin;

export default { verifyToken, verifyAdmin, verifySuperAdmin, optionalAuth, checkRole, scopeFor, isAdmin };
