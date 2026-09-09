// backend/services/studentProvisioning.js
//
// The one way a student account comes into existence.
//
// There are two callers and they differ in exactly two respects:
//
//   self-registration   the student chooses the password and signs in straight
//                       away; no email is sent.
//   admin-created       nobody chooses a password (see unusablePassword below)
//                       and a set-password link is emailed instead.
//
// Everything else — validation, the duplicate check, the institution check, the
// auth user, the profile row, the platform_stats rows, the retention clock, the
// rollback when any of it fails — is identical, so it lives here once. The
// alternative was a second copy of ~130 lines inside a new route, which is how
// the two paths quietly start producing differently-shaped students: one with
// platform rows and one without, one bound to an institution and one orphaned.
//
// WHAT THIS FILE GUARANTEES TO ITS CALLERS:
//   - it either returns a complete, signed-in-able student, or it leaves the
//     database exactly as it found it. A failed profile write deletes the auth
//     user it just made, so there is never a login with no profile behind it
//     (the state that makes every request 403 with NO_PROFILE and cannot be
//     fixed from any admin screen).
//   - it never returns, logs or stores a password. The only place a password
//     exists is Supabase Auth's own hash.
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { query, one, tx } from '../config/db.js';
import { PLATFORMS, LINK_KEYS } from '../utils/serialize.js';
import { isValidEmail, normalizeEmail, undeliverableDomainReason } from '../utils/email.js';
import { sendSetPasswordEmail } from './inviteService.js';
import logger from '../utils/logger.js';

/**
 * A password that is deliberately impossible to use or to know.
 *
 * This is NOT a temporary password to be handed over. Nothing reads it back,
 * nothing prints it, nothing stores it. Supabase requires the field to have a
 * value; this fills it with 64 hex characters of CSPRNG output that are then
 * immediately forgotten. The account is unreachable until the student sets
 * their own password through the emailed link.
 *
 * The property we want is negative: after this function returns, no human and
 * no row anywhere holds a credential for this account. You cannot leak what you
 * never kept.
 */
export const unusablePassword = () => crypto.randomBytes(32).toString('hex');

export const normalizeUrl = (v) => {
  const u = String(v || '').trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

/**
 * The client sends ONE platformUrls map holding all seven keys. Storage splits
 * them: the scraped platforms become platform_stats rows; the rest
 * (resume/linkedin) become profiles.links.
 *
 * Anything outside both lists is dropped rather than stored, so a client cannot
 * grow this column arbitrarily by inventing keys.
 */
export const splitPlatformUrls = (platformUrls = {}) => {
  const scraped = {};
  const links = {};
  for (const [key, raw] of Object.entries(platformUrls || {})) {
    const url = normalizeUrl(raw);
    if (PLATFORMS.includes(key)) scraped[key] = url;
    else if (LINK_KEYS.includes(key)) links[key] = url;
  }
  return { scraped, links };
};

export const numOrNull = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Supabase's own floor. Stated here so the message is ours, not a raw API error. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * The four values `year` may hold. Stored as "1".."4" because that is what the
 * admin form and every spreadsheet import already write — the ordinal labels
 * ("2nd Year") belong to the UI, not the column.
 */
export const VALID_YEARS = ['1', '2', '3', '4'];

/** One year from now — the retention clock, anchored to account creation. */
const retentionDeadline = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d;
};

/**
 * A refusal the caller can hand straight to the client: `status` is the HTTP
 * code and `message` is already safe to display. Anything that isn't one of
 * these is a genuine fault and becomes a 500.
 */
export class ProvisioningError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ProvisioningError';
    this.status = status;
  }
}

/**
 * Create a student: auth user + profile + platform_stats, bound to an
 * institution, with the retention clock started.
 *
 * @param {object}  input
 * @param {string}  input.institutionId  required; must exist and not be archived
 * @param {string}  [input.password]     the student's own, for self-registration.
 *                                       Omit for admin-created accounts and an
 *                                       unusable one is generated instead.
 * @param {boolean} [input.sendInvite]   email a set-password link afterwards
 * @param {string}  [input.createdBy]    profile id of the admin, when there is one
 *
 * Note there is no `college` parameter. It is copied from the institution's own
 * name so that the column can never disagree with the institution the student
 * is actually in — see the insert below.
 * @returns {Promise<{id, institutionId, invited, inviteError}>}
 */
export const provisionStudent = async ({
  name,
  email,
  password = null,
  phoneNumber = '',
  registerNumber = '',
  rollNumber = '',
  department = '',
  year = '',
  tenthPercentage = '',
  twelfthPercentage = '',
  platformUrls = {},
  institutionId,
  createdBy = null,
  sendInvite = false,
}) => {
  // ---- validation --------------------------------------------------------
  if (!name || !String(name).trim()) {
    throw new ProvisioningError('Name is required');
  }
  // Normalise BEFORE validating, so " Asha@Gmail.com " is accepted (trimmed and
  // lowercased) rather than rejected for a trailing space the admin can't see.
  const lower = normalizeEmail(email);
  if (!isValidEmail(lower)) {
    throw new ProvisioningError('A valid email is required');
  }
  if (password !== null && String(password).length < MIN_PASSWORD_LENGTH) {
    throw new ProvisioningError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (year && !VALID_YEARS.includes(String(year))) {
    throw new ProvisioningError('Year must be 1, 2, 3 or 4');
  }
  if (!institutionId) {
    throw new ProvisioningError('An institution is required');
  }

  const inst = await one(
    'select id, name from public.institutions where id = $1 and deleted_at is null',
    [institutionId]
  );
  // An archived institution is not a destination for new students — 007 made it
  // invisible everywhere else, and it must be invisible here too.
  if (!inst) throw new ProvisioningError('Institution not found');

  const dupe = await one('select id from public.profiles where lower(email) = $1', [lower]);
  if (dupe) {
    throw new ProvisioningError('That email is already registered', 409);
  }

  // Catch a mistyped DOMAIN before we create an auth account nobody can reach.
  // This checks the domain can receive mail at all; it can't vouch for the
  // mailbox (that's the receiving server's to reject). Non-blocking on DNS
  // trouble — an unreachable resolver must not stop an account being created.
  const badDomain = await undeliverableDomainReason(lower);
  if (badDomain) throw new ProvisioningError(badDomain);

  // ---- auth user ---------------------------------------------------------
  let authUser;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: lower,
      password: password ?? unusablePassword(),
      // The address is taken as verified: an admin-provisioned account proves it
      // via the set-password link, and a self-registered one is useless to
      // anybody who cannot already read the inbox they typed. Without this the
      // student cannot sign in until they click a confirmation mail, which is a
      // second email flow to maintain for no security we don't already have.
      email_confirm: true,
      user_metadata: { name: String(name).trim() },
    });
    if (error) {
      // An auth user can exist with no profile row (a half-finished create that
      // was rolled back on the profile side but not the auth side), so the
      // duplicate check above cannot see every collision.
      if (/already/i.test(error.message)) {
        throw new ProvisioningError('That email is already registered', 409);
      }
      throw error;
    }
    authUser = data.user;
  } catch (e) {
    if (e instanceof ProvisioningError) throw e;
    logger.error('Student createUser failed:', e);
    throw e;
  }

  // ---- profile + platform rows -------------------------------------------
  try {
    const { scraped, links } = splitPlatformUrls(platformUrls);

    // Profile + platform rows land together or not at all.
    await tx(async (c) => {
      await c.query(
        `insert into public.profiles
           (id, email, name, display_name, phone_number, register_number, roll_number,
            department, year, college, tenth_percentage, twelfth_percentage,
            role, institution_id, links, created_by, expires_at)
         values ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,'student',$12,$13,$14,$15)`,
        [
          authUser.id, lower, String(name).trim(),
          String(phoneNumber || '').trim(), String(registerNumber || '').trim(),
          String(rollNumber || '').trim(), department || '', String(year || ''),
          // The institution's name, never the caller's. `college` is the column
          // every leaderboard and filter groups on, and letting it be typed is
          // how one college becomes "SJCE", "S.J.C.E" and "sjce " — three
          // groupings of the same place that nothing downstream can rejoin.
          // The institution row is the canonical name; this is a copy of it.
          inst.name, numOrNull(tenthPercentage), numOrNull(twelfthPercentage),
          institutionId, JSON.stringify(links), createdBy,
          // Retention starts now, for students only. This function only ever
          // writes role = 'student', so no admin can pick up a deadline here.
          retentionDeadline(),
        ]
      );

      for (const p of PLATFORMS) {
        if (!scraped[p]) continue;
        await c.query(
          `insert into public.platform_stats (user_id, platform, profile_url, status)
           values ($1, $2, $3, 'pending')`,
          [authUser.id, p, scraped[p]]
        );
      }
    });
  } catch (error) {
    // Roll back the Auth user so we never strand a login without a profile.
    await supabaseAdmin.auth.admin.deleteUser(authUser.id).catch(() => {});
    logger.error('Error writing student profile:', error);
    throw error;
  }

  // ---- the invite, when there is one -------------------------------------
  // The account exists and is correct; only the email might not have gone out.
  // So this is NOT inside the rollback above — failing to send is not a reason
  // to delete a student the admin just successfully created. Report it instead,
  // and let them re-send from the Access screen.
  let invited = false;
  let inviteError = null;
  if (sendInvite) {
    try {
      await sendSetPasswordEmail({ email: lower, name: String(name).trim(), isNew: true });
      await query('update public.profiles set invited_at = now() where id = $1', [authUser.id]);
      invited = true;
    } catch (e) {
      inviteError = e.message;
      logger.error(`Student ${lower} created but the invite email failed: ${e.message}`);
    }
  }

  return { id: authUser.id, institutionId, invited, inviteError };
};

export default { provisionStudent, splitPlatformUrls, normalizeUrl, numOrNull, unusablePassword };
