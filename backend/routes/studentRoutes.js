// backend/routes/studentRoutes.js
//
// Every read and write for students. The browser no longer touches the database,
// so this file is the entire trust boundary for student data.
//
// The scoping rule, enforced on EVERY route below:
//   super-admin        -> all institutions, or one if they ask for it
//   institution admin  -> their own institution only; the client's value is
//                         ignored, not validated. There is no request body that
//                         can talk an admin into another institution's data.
// scopeFor() (middleware/supabaseAuth.js) is the only place that decides this.
import express from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { query, one, many, tx } from '../config/db.js';
import { verifyAdmin, verifyToken, scopeFor } from '../middleware/supabaseAuth.js';
import { sendSetPasswordEmail } from '../services/inviteService.js';
import {
  STUDENT_SELECT,
  serializeStudent,
  serializeStudents,
  PLATFORMS,
  LINK_KEYS,
} from '../utils/serialize.js';
import logger from '../utils/logger.js';

const router = express.Router();

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
const isUuid = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

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
const unusablePassword = () => crypto.randomBytes(32).toString('hex');

const normalizeUrl = (v) => {
  const u = String(v || '').trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

/**
 * The client sends ONE platformUrls map holding all seven keys. Storage splits
 * them: the four scraped platforms become platform_stats rows; the rest
 * (resume/linkedin/hackerrank) become profiles.links.
 *
 * Anything outside both lists is dropped rather than stored, so a client cannot
 * grow this column arbitrarily by inventing keys.
 */
const splitPlatformUrls = (platformUrls = {}) => {
  const scraped = {};
  const links = {};
  for (const [key, raw] of Object.entries(platformUrls || {})) {
    const url = normalizeUrl(raw);
    if (PLATFORMS.includes(key)) scraped[key] = url;
    else if (LINK_KEYS.includes(key)) links[key] = url;
  }
  return { scraped, links };
};

const numOrNull = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Builds the WHERE clause for a scoped student list.
 * Returns [sql, params]. A null institutionId means "all" and is only ever
 * produced for a super-admin.
 */
const scopedWhere = (institutionId, startIndex = 1) => {
  if (institutionId === null) return [`where p.role = 'student'`, []];
  return [`where p.role = 'student' and p.institution_id = $${startIndex}`, [institutionId]];
};

// =============================================================================
// GET /api/students   (any admin)  — replaces getAllStudents + 4 direct queries
// =============================================================================
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const institutionId = scopeFor(req, req.query.institutionId);
    const [where, params] = scopedWhere(institutionId);
    const rows = await many(`${STUDENT_SELECT} ${where} order by p.name asc`, params);
    res.json({ success: true, students: serializeStudents(rows), scopedTo: institutionId });
  } catch (e) {
    logger.error('List students failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// GET /api/students/access   (any admin)
//
// Replaces GET /api/students/passwords, which existed to display every
// student's password in plaintext. There are no passwords to display any more —
// none are stored, and none are knowable. What an admin actually needs is
// whether each student can get IN, so this reports:
//
//   invitedAt      when the set-password email was last sent
//   lastSignInAt   whether they've ever used it   (from auth.users)
//   accessState    invited | active | never_invited
//
// `lastSignInAt` is read from auth.users rather than mirrored into profiles: a
// copy would need maintaining on every login and would be wrong the moment that
// failed. Supabase owns that fact; we join to it.
// =============================================================================
const ACCESS_SELECT = `
  select p.id, p.name, p.email, p.role, p.institution_id, p.roll_number,
         p.department, p.invited_at, p.created_at,
         i.name as institution_name,
         au.last_sign_in_at
    from public.profiles p
    left join public.institutions i on i.id = p.institution_id
    join auth.users au on au.id = p.id
`;

const serializeAccess = (r) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  rollNumber: r.roll_number,
  department: r.department,
  institutionId: r.institution_id,
  institutionName: r.institution_name,
  invitedAt: r.invited_at ? new Date(r.invited_at).toISOString() : null,
  lastSignInAt: r.last_sign_in_at ? new Date(r.last_sign_in_at).toISOString() : null,
  createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  accessState: r.last_sign_in_at ? 'active' : r.invited_at ? 'invited' : 'never_invited',
});

router.get('/access', verifyAdmin, async (req, res) => {
  try {
    const institutionId = scopeFor(req, req.query.institutionId);
    const scoped = institutionId !== null;
    const params = scoped ? [institutionId] : [];

    const students = await many(
      `${ACCESS_SELECT} where p.role = 'student' ${scoped ? 'and p.institution_id = $1' : ''} order by p.name asc`,
      params
    );

    // Institution admins. A super-admin sees every institution's; an institution
    // admin sees only their own. Their password is set by the super-admin and
    // isn't stored either, so this is a sign-in record, not a secret.
    const admins = await many(
      `${ACCESS_SELECT} where p.role = 'admin' ${scoped ? 'and p.institution_id = $1' : ''} order by p.name asc`,
      params
    );

    res.json({
      success: true,
      students: students.map(serializeAccess),
      admins: admins.map(serializeAccess),
      scopedTo: institutionId,
    });
  } catch (e) {
    logger.error('List access failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// GET /api/students/:id   (any admin)
// Rebuilds the /admin/students/:id page, which has never worked — the component
// calls db.collection() (v8 API) on a v9 modular instance and throws.
// =============================================================================
router.get('/:id', verifyAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid student id' });
    }
    const institutionId = scopeFor(req, null);
    // The scope is part of the WHERE, not a check after fetching: an
    // out-of-scope student is indistinguishable from one that does not exist.
    const params = institutionId === null ? [req.params.id] : [req.params.id, institutionId];
    const row = await one(
      `${STUDENT_SELECT}
       where p.id = $1 and p.role = 'student'
       ${institutionId === null ? '' : 'and p.institution_id = $2'}`,
      params
    );
    if (!row) return res.status(404).json({ success: false, error: 'Student not found' });
    res.json({ success: true, student: serializeStudent(row) });
  } catch (e) {
    logger.error('Get student failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// POST /api/students   (any admin)
// Creates the Auth account + profile + platform rows, and returns the temp
// password so the admin can hand it over.
//
// Must be server-side: the client SDK's sign-up signs the CALLER in as the new
// student, destroying the admin's session (and, during bulk import, doing so
// once per row).
// =============================================================================
router.post('/', verifyAdmin, async (req, res) => {
  const {
    name,
    email,
    phoneNumber = '',
    registerNumber = '',
    rollNumber = '',
    department = '',
    year = '',
    college = '',
    tenthPercentage = '',
    twelfthPercentage = '',
    platformUrls = {},
    institutionId: requestedInstitutionId,
  } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, error: 'Name is required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'A valid email is required' });
  }

  const institutionId = scopeFor(req, requestedInstitutionId);
  if (!institutionId || institutionId === '__no_institution__') {
    return res.status(400).json({ success: false, error: 'An institution is required' });
  }

  const inst = await one('select id from public.institutions where id = $1', [institutionId]);
  if (!inst) return res.status(400).json({ success: false, error: 'Institution not found' });

  const lower = String(email).toLowerCase().trim();
  const dupe = await one('select id from public.profiles where lower(email) = $1', [lower]);
  if (dupe) {
    return res.status(400).json({ success: false, error: 'That email is already registered' });
  }

  let authUser;

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: lower,
      // A password nobody will ever know — not the student, not the admin, not
      // us, not a log. It exists only because the account needs *something* in
      // the field; it is never transmitted and never usable. The student gets in
      // by setting their own via the emailed link.
      password: unusablePassword(),
      // The account is admin-provisioned, so the address is taken as verified —
      // and the set-password link we send doubles as proof they can read it.
      email_confirm: true,
      user_metadata: { name: String(name).trim() },
    });
    if (error) {
      if (/already/i.test(error.message)) {
        return res.status(400).json({ success: false, error: 'That email is already registered' });
      }
      throw error;
    }
    authUser = data.user;
  } catch (e) {
    logger.error('Student createUser failed:', e);
    return res.status(500).json({ success: false, error: e.message });
  }

  try {
    const { scraped, links } = splitPlatformUrls(platformUrls);

    // Profile + platform rows land together or not at all.
    await tx(async (c) => {
      await c.query(
        `insert into public.profiles
           (id, email, name, display_name, phone_number, register_number, roll_number,
            department, year, college, tenth_percentage, twelfth_percentage,
            role, institution_id, links, created_by)
         values ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,'student',$12,$13,$14)`,
        [
          authUser.id, lower, String(name).trim(),
          String(phoneNumber || '').trim(), String(registerNumber || '').trim(),
          String(rollNumber || '').trim(), department || '', String(year || ''),
          college || '', numOrNull(tenthPercentage), numOrNull(twelfthPercentage),
          institutionId, JSON.stringify(links), req.user.uid,
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
    return res.status(500).json({ success: false, error: error.message });
  }

  // The account exists and is correct; only the email might not have gone out.
  // So this is NOT inside the rollback above — failing to send is not a reason
  // to delete a student the admin just successfully created. Report it instead,
  // and let them re-send from the Access screen.
  let invited = false;
  let inviteError = null;
  try {
    await sendSetPasswordEmail({ email: lower, name: String(name).trim(), isNew: true });
    await query('update public.profiles set invited_at = now() where id = $1', [authUser.id]);
    invited = true;
  } catch (e) {
    inviteError = e.message;
    logger.error(`Student ${lower} created but the invite email failed: ${e.message}`);
  }

  logger.info(`Student created: ${lower} (institution ${institutionId}) invite=${invited ? 'sent' : 'FAILED'}`);
  return res.status(201).json({
    success: true,
    uid: authUser.id,
    id: authUser.id,
    institutionId,
    invited,
    inviteError,
  });
});

// =============================================================================
// PATCH /api/students/:id   (any admin)
// =============================================================================
const EDITABLE = {
  name: 'name',
  phoneNumber: 'phone_number',
  registerNumber: 'register_number',
  rollNumber: 'roll_number',
  department: 'department',
  year: 'year',
  college: 'college',
  tenthPercentage: 'tenth_percentage',
  twelfthPercentage: 'twelfth_percentage',
};

router.patch('/:id', verifyAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid student id' });
    }
    const institutionId = scopeFor(req, null);
    const scopeParams = institutionId === null ? [req.params.id] : [req.params.id, institutionId];
    const target = await one(
      `select id from public.profiles
        where id = $1 and role = 'student'
        ${institutionId === null ? '' : 'and institution_id = $2'}`,
      scopeParams
    );
    if (!target) return res.status(404).json({ success: false, error: 'Student not found' });

    // Allow-list, not a block-list. role, institution_id, is_admin and the
    // temp-password fields are simply not reachable from a request body — a
    // client cannot promote a student by adding a field we forgot to strip.
    const sets = [];
    const params = [];
    for (const [apiKey, column] of Object.entries(EDITABLE)) {
      if (!(apiKey in (req.body || {}))) continue;
      let v = req.body[apiKey];
      if (column.endsWith('percentage')) v = numOrNull(v);
      else v = String(v ?? '').trim();
      params.push(v);
      sets.push(`${column} = $${params.length}`);
    }

    // A super-admin may move a student between institutions. An institution
    // admin may not, and scopeFor() has already made the attempt a no-op.
    if (req.user.isSuperAdmin && 'institutionId' in (req.body || {})) {
      const dest = req.body.institutionId;
      if (dest && !isUuid(dest)) {
        return res.status(400).json({ success: false, error: 'Invalid institutionId' });
      }
      if (dest) {
        const exists = await one('select id from public.institutions where id = $1', [dest]);
        if (!exists) return res.status(400).json({ success: false, error: 'Institution not found' });
      }
      params.push(dest || null);
      sets.push(`institution_id = $${params.length}`);
    }

    if (sets.length) {
      params.push(req.params.id);
      await query(`update public.profiles set ${sets.join(', ')} where id = $${params.length}`, params);
    }

    // Platform URLs, when supplied. Upsert so re-saving a form does not
    // duplicate rows, and reset status to pending when the URL actually changes
    // (the old numbers belong to the old account).
    if (req.body?.platformUrls && typeof req.body.platformUrls === 'object') {
      const { links } = splitPlatformUrls(req.body.platformUrls);
      // Merge rather than replace: a form that only submits `resume` must not
      // wipe the linkedin URL it never sent.
      if (Object.keys(links).length) {
        await query(`update public.profiles set links = links || $2::jsonb where id = $1`, [
          req.params.id,
          JSON.stringify(links),
        ]);
      }

      await tx(async (c) => {
        for (const p of PLATFORMS) {
          if (!(p in req.body.platformUrls)) continue;
          const url = normalizeUrl(req.body.platformUrls[p]);
          if (!url) {
            await c.query('delete from public.platform_stats where user_id = $1 and platform = $2', [
              req.params.id, p,
            ]);
            continue;
          }
          await c.query(
            `insert into public.platform_stats (user_id, platform, profile_url, status)
             values ($1, $2, $3, 'pending')
             on conflict (user_id, platform) do update
               set profile_url = excluded.profile_url,
                   status = case when public.platform_stats.profile_url is distinct from excluded.profile_url
                                 then 'pending'::public.scrape_state
                                 else public.platform_stats.status end,
                   data   = case when public.platform_stats.profile_url is distinct from excluded.profile_url
                                 then '{}'::jsonb
                                 else public.platform_stats.data end,
                   metric = case when public.platform_stats.profile_url is distinct from excluded.profile_url
                                 then 0 else public.platform_stats.metric end`,
            [req.params.id, p, url]
          );
        }
      });
    }

    const row = await one(`${STUDENT_SELECT} where p.id = $1`, [req.params.id]);
    res.json({ success: true, student: serializeStudent(row) });
  } catch (e) {
    logger.error('Update student failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// DELETE /api/students/:id   (any admin)
// Deletes the Auth user; the profile and platform rows cascade.
// Firestore's version deleted the profile and LEFT the Auth login alive — an
// account that could still sign in with no profile behind it.
// =============================================================================
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid student id' });
    }
    const institutionId = scopeFor(req, null);
    const params = institutionId === null ? [req.params.id] : [req.params.id, institutionId];
    const target = await one(
      `select id, email from public.profiles
        where id = $1 and role = 'student'
        ${institutionId === null ? '' : 'and institution_id = $2'}`,
      params
    );
    if (!target) return res.status(404).json({ success: false, error: 'Student not found' });

    const { error } = await supabaseAdmin.auth.admin.deleteUser(target.id);
    if (error) throw error;
    // profiles.id references auth.users on delete cascade, so the profile and
    // its platform_stats are already gone. Belt and braces if that ever changes:
    await query('delete from public.profiles where id = $1', [target.id]).catch(() => {});

    logger.info(`Student deleted: ${target.email} by ${req.user.email}`);
    res.json({ success: true });
  } catch (e) {
    logger.error('Delete student failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// POST /api/students/:id/send-invite   (any admin)
//
// (Re)sends the set-password email. Covers both "they never got the first one"
// and "they forgot their password".
//
// This replaces POST /:id/reset-password, which MINTED a new password, stored it
// in plaintext and handed it back to the admin to relay. Three things are better
// here:
//   - The admin never learns the student's password, so they can't leak it and
//     can't be blamed for it.
//   - It does NOT invalidate the student's existing password. The old endpoint
//     locked people out the moment an admin clicked "reset" — the student's
//     working password stopped working without warning. A recovery link is an
//     offer, not a change: ignore it and nothing happens.
//   - The link is single-use and expires.
// =============================================================================
router.post('/:id/send-invite', verifyAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid student id' });
    }
    const institutionId = scopeFor(req, null);
    const params = institutionId === null ? [req.params.id] : [req.params.id, institutionId];
    const target = await one(
      `select id, email, name, invited_at from public.profiles
        where id = $1 and role = 'student'
        ${institutionId === null ? '' : 'and institution_id = $2'}`,
      params
    );
    if (!target) return res.status(404).json({ success: false, error: 'Student not found' });

    await sendSetPasswordEmail({
      email: target.email,
      name: target.name,
      // Word it as a welcome the first time and a reset afterwards.
      isNew: !target.invited_at,
    });
    await query('update public.profiles set invited_at = now() where id = $1', [target.id]);

    logger.info(`Set-password email sent to ${target.email} by ${req.user.email}`);
    res.json({ success: true, email: target.email });
  } catch (e) {
    logger.error('Send invite failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// POST /api/students/:id/rescrape   (any admin)
// Marks platforms pending so the next scraper run picks them up.
// =============================================================================
router.post('/:id/rescrape', verifyAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid student id' });
    }
    const institutionId = scopeFor(req, null);
    const params = institutionId === null ? [req.params.id] : [req.params.id, institutionId];
    const target = await one(
      `select id from public.profiles
        where id = $1 and role = 'student'
        ${institutionId === null ? '' : 'and institution_id = $2'}`,
      params
    );
    if (!target) return res.status(404).json({ success: false, error: 'Student not found' });

    const r = await query(
      `update public.platform_stats set status = 'pending' where user_id = $1 and profile_url <> ''`,
      [target.id]
    );
    res.json({ success: true, queued: r.rowCount });
  } catch (e) {
    logger.error('Rescrape failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// GET /api/students/me/profile   (any signed-in user)
// A student reading their OWN record. Note verifyToken, not verifyAdmin: this
// is the one student-facing read, and it is keyed to req.user.uid so it cannot
// be pointed at anyone else.
// =============================================================================
router.get('/me/profile', verifyToken, async (req, res) => {
  try {
    const row = await one(`${STUDENT_SELECT} where p.id = $1`, [req.user.uid]);
    if (!row) return res.status(404).json({ success: false, error: 'Profile not found' });
    res.json({ success: true, student: serializeStudent(row) });
  } catch (e) {
    logger.error('Get own profile failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// PATCH /api/students/me/profile   (any signed-in user)
// A student editing their OWN record. Replaces Profile.jsx writing straight to
// Firestore with updateDoc(doc(db,'users',uid), ...).
//
// Deliberately a SEPARATE allow-list from the admin PATCH, and a much smaller
// one: a student may edit their own contact details and links, and nothing else.
// Not their roll number, not their marks, not their institution, not their role.
// Everything is keyed to req.user.uid, so there is no id to tamper with.
// =============================================================================
const SELF_EDITABLE = {
  name: 'name',
  phoneNumber: 'phone_number',
  department: 'department',
  year: 'year',
  college: 'college',
};

router.patch('/me/profile', verifyToken, async (req, res) => {
  try {
    const sets = [];
    const params = [];
    for (const [apiKey, column] of Object.entries(SELF_EDITABLE)) {
      if (!(apiKey in (req.body || {}))) continue;
      params.push(String(req.body[apiKey] ?? '').trim());
      sets.push(`${column} = $${params.length}`);
    }

    // Students may set their own resume/linkedin/hackerrank links, but NOT the
    // scraped platform URLs — those decide their leaderboard numbers, so
    // changing them is an admin action.
    if (req.body?.platformUrls && typeof req.body.platformUrls === 'object') {
      const { links } = splitPlatformUrls(req.body.platformUrls);
      if (Object.keys(links).length) {
        params.push(JSON.stringify(links));
        sets.push(`links = links || $${params.length}::jsonb`);
      }
    }

    if (sets.length) {
      params.push(req.user.uid);
      await query(`update public.profiles set ${sets.join(', ')} where id = $${params.length}`, params);
    }

    const row = await one(`${STUDENT_SELECT} where p.id = $1`, [req.user.uid]);
    if (!row) return res.status(404).json({ success: false, error: 'Profile not found' });
    res.json({ success: true, student: serializeStudent(row) });
  } catch (e) {
    logger.error('Update own profile failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
