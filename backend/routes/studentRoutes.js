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
import { supabaseAdmin } from '../config/supabase.js';
import { query, one, many, tx } from '../config/db.js';
import {
  verifyAdmin,
  verifySuperAdmin,
  verifyToken,
  scopeFor,
  NO_INSTITUTION,
} from '../middleware/supabaseAuth.js';
import { registerLimiter } from '../middleware/rateLimiter.js';
import { sendSetPasswordEmail } from '../services/inviteService.js';
import {
  provisionStudent,
  splitPlatformUrls,
  normalizeUrl,
  numOrNull,
  ProvisioningError,
  MIN_PASSWORD_LENGTH,
  VALID_YEARS,
} from '../services/studentProvisioning.js';
import {
  STUDENT_SELECT,
  serializeStudent,
  serializeStudents,
  PLATFORMS,
} from '../utils/serialize.js';
import { isValidEmail, normalizeEmail, undeliverableDomainReason } from '../utils/email.js';
import { firstProfileUrlError } from '../utils/profileUrls.js';
import { canonicalDepartment } from '../utils/departments.js';
import logger from '../utils/logger.js';

const router = express.Router();
const isUuid = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

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
// Creates the Auth account + profile + platform rows, then emails a
// set-password link. No password is chosen here and none is returned — see
// services/studentProvisioning.js.
//
// Must be server-side: the client SDK's sign-up signs the CALLER in as the new
// student, destroying the admin's session (and, during bulk import, doing so
// once per row).
//
// The body of this route used to be ~130 lines of provisioning. It now shares
// provisionStudent() with public registration, so an admin-created student and
// a self-registered one are the same thing by construction rather than by two
// implementations agreeing.
// =============================================================================
router.post('/', verifyAdmin, async (req, res) => {
  try {
    // scopeFor() is what stops an institution admin creating students in
    // somebody else's college: the requested id is a hint for super-admins and
    // is ignored for everyone else.
    const institutionId = scopeFor(req, req.body?.institutionId);
    if (!institutionId || institutionId === NO_INSTITUTION) {
      return res.status(400).json({ success: false, error: 'An institution is required' });
    }

    const result = await provisionStudent({
      ...(req.body || {}),
      institutionId,
      // Admin-created accounts get an unusable password and an invite email;
      // the student chooses their own password from the link.
      password: null,
      sendInvite: true,
      createdBy: req.user.uid,
    });

    logger.info(
      `Student created: ${normalizeEmail(req.body?.email)} (institution ${institutionId}) ` +
        `invite=${result.invited ? 'sent' : 'FAILED'}`
    );
    return res.status(201).json({
      success: true,
      uid: result.id,
      id: result.id,
      institutionId: result.institutionId,
      invited: result.invited,
      inviteError: result.inviteError,
    });
  } catch (e) {
    if (e instanceof ProvisioningError) {
      return res.status(e.status).json({ success: false, error: e.message });
    }
    logger.error('Create student failed:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// POST /api/students/register   (PUBLIC — no token)
//
// Self-registration. The student picks their own password and can sign in
// immediately; there is no approval step, no verification email and no invite.
//
// This is the only unauthenticated write in the API, so everything that
// normally comes from an admin's session has to be either validated or refused
// here:
//
//   institutionId  must name a LIVE institution. It is an id, never a name:
//                  the client picks from GET /api/institutions/public, so every
//                  student at one college lands on the same institution row
//                  instead of eleven spellings of it.
//   college        is NOT taken from the body. It is copied from the chosen
//                  institution's name, so the free-text column can no longer
//                  disagree with the institution the student is actually in.
//   role           is not reachable at all — provisionStudent() hard-codes
//                  'student', so no request body can mint an admin.
//
// ON EMAIL ENUMERATION. A duplicate address answers "That email is already
// registered", which does confirm the address exists. The alternative — a
// uniform success response — silently drops a real student's registration and
// leaves them with an account they cannot access and no idea why. The mitigation
// is registerLimiter (5/hr/IP, failures included), which makes probing a list of
// any useful size take years while costing a genuine student nothing.
// =============================================================================
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const {
      institutionId,
      password,
      year,
      // A field no human sees and no browser fills. Anything in it came from a
      // bot walking the form, so the request is dropped.
      website: honeypot = '',
    } = req.body || {};

    if (String(honeypot).trim() !== '') {
      logger.warn(`Registration honeypot tripped from ${req.ip}`);
      // Deliberately indistinguishable from success: telling a bot which check
      // caught it is telling it what to change.
      return res.status(201).json({ success: true });
    }

    if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }
    if (!institutionId || !isUuid(institutionId)) {
      return res.status(400).json({ success: false, error: 'Please select your college' });
    }
    if (!year || !VALID_YEARS.includes(String(year))) {
      return res.status(400).json({ success: false, error: 'Please select your year of study' });
    }

    // Department must be ON the list. Strict here and NOT inside
    // provisionStudent() for the same reason as the profile links below: admin
    // create and bulk import share that function, and spreadsheets carry
    // department names nobody has standardised. The public form is the one
    // place we fully control, so it is the one place that refuses.
    const department = canonicalDepartment(req.body?.department);
    if (!department) {
      return res.status(400).json({ success: false, error: 'Please choose your department from the list' });
    }

    // Profile links, when supplied. Checked HERE rather than inside
    // provisionStudent() on purpose: the admin create and bulk-import paths go
    // through that same function, and spreadsheets full of hand-typed links
    // would start failing rows that have always been accepted. This is the
    // public form's own rule, so it is enforced on the public form's own route.
    const badUrl = firstProfileUrlError(req.body?.platformUrls);
    if (badUrl) {
      return res.status(400).json({ success: false, error: badUrl });
    }

    // Resolve the institution here rather than trusting a name from the body.
    // provisionStudent() checks it exists too; this second read is what supplies
    // the canonical college name, so the two are one lookup apart, not two
    // sources of truth.
    const inst = await one(
      'select id, name from public.institutions where id = $1 and deleted_at is null',
      [institutionId]
    );
    if (!inst) {
      return res.status(400).json({ success: false, error: 'Please select your college' });
    }

    await provisionStudent({
      name: req.body?.name,
      email: req.body?.email,
      password,
      phoneNumber: req.body?.phoneNumber,
      registerNumber: req.body?.registerNumber,
      rollNumber: req.body?.rollNumber,
      // The canonical spelling, so casing/spacing differences cannot create a
      // second variant of a department that is already on the list.
      department,
      year,
      // Server-supplied, not client-supplied. See the header note.
      college: inst.name,
      tenthPercentage: req.body?.tenthPercentage,
      twelfthPercentage: req.body?.twelfthPercentage,
      platformUrls: req.body?.platformUrls,
      institutionId: inst.id,
      // No email, no invite: the student already has the password they chose.
      sendInvite: false,
      createdBy: null,
    });

    logger.info(`Student self-registered at institution ${inst.id}`);
    // Nothing about the created row comes back. The client's next step is the
    // sign-in form, which needs no id, and an unauthenticated response is not
    // the place to start handing out profile data.
    return res.status(201).json({ success: true });
  } catch (e) {
    if (e instanceof ProvisioningError) {
      return res.status(e.status).json({ success: false, error: e.message });
    }
    logger.error('Student registration failed:', e);
    return res.status(500).json({ success: false, error: 'Could not create your account. Please try again.' });
  }
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
  // `college` is deliberately NOT editable. It is a copy of the institution's
  // name, maintained below whenever a student is moved, so that one college is
  // one string everywhere. Letting it be typed here would reintroduce exactly
  // the spelling drift that binding students to an institution removes.
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
      `select id, email from public.profiles
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
      let destName = '';
      if (dest) {
        const exists = await one(
          'select id, name from public.institutions where id = $1 and deleted_at is null',
          [dest]
        );
        if (!exists) return res.status(400).json({ success: false, error: 'Institution not found' });
        destName = exists.name;
      }
      params.push(dest || null);
      sets.push(`institution_id = $${params.length}`);
      // Move the college name with the student. Without this the two disagree
      // the moment anyone is transferred: institution_id says one college and
      // the column every filter and leaderboard groups on still says the old
      // one, which is invisible until someone asks why a student appears under
      // a college they left.
      params.push(destName);
      sets.push(`college = $${params.length}`);
    }

    // Email change. NOT in EDITABLE because it is not just a profile column —
    // it is the student's LOGIN, which lives in Supabase auth. Moving only the
    // profile copy is exactly the desync this used to avoid by refusing the edit:
    // the student would keep signing in with the old address while every screen
    // showed the new one. So we move the auth login too, and only then the
    // profile column, reverting the login if the profile write fails so the two
    // can never disagree.
    let emailRevert = null;
    if ('email' in (req.body || {})) {
      const newEmail = normalizeEmail(req.body.email);
      if (!isValidEmail(newEmail)) {
        return res.status(400).json({ success: false, error: 'A valid email is required' });
      }
      // Only act on a real change — re-saving the form with the same email is a
      // no-op, not an auth round-trip.
      if (newEmail !== normalizeEmail(target.email || '')) {
        const badDomain = await undeliverableDomainReason(newEmail);
        if (badDomain) return res.status(400).json({ success: false, error: badDomain });

        const clash = await one(
          'select id from public.profiles where lower(email) = $1 and id <> $2',
          [newEmail, req.params.id]
        );
        if (clash) {
          return res.status(400).json({ success: false, error: 'That email is already registered' });
        }

        // Move the login first (the source of truth). email_confirm keeps it
        // usable immediately — an admin-initiated change, on a domain we just
        // confirmed resolves, doesn't need the student to re-confirm.
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, {
          email: newEmail,
          email_confirm: true,
        });
        if (authErr) {
          // Usually: the address is already taken by an auth user (possibly one
          // with no profile row, which the check above can't see).
          return res
            .status(400)
            .json({ success: false, error: `Could not change login email: ${authErr.message}` });
        }
        emailRevert = target.email; // put the login back if the profile write fails
        params.push(newEmail);
        sets.push(`email = $${params.length}`);
      }
    }

    if (sets.length) {
      params.push(req.params.id);
      try {
        await query(
          `update public.profiles set ${sets.join(', ')} where id = $${params.length}`,
          params
        );
      } catch (e) {
        // The login already moved but the profile didn't — undo the login so the
        // two stay in agreement, then surface the original failure.
        if (emailRevert) {
          await supabaseAdmin.auth.admin
            .updateUserById(req.params.id, { email: emailRevert, email_confirm: true })
            .catch((revertErr) =>
              logger.error(`Could not revert login email after failed profile update: ${revertErr.message}`)
            );
        }
        throw e;
      }
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
// POST /api/students/:id/set-password   (SUPER-ADMIN only)
//
// Sets a student's password directly, for the cases a recovery link cannot
// reach: a student whose email has stopped working, or one standing next to you
// who needs access now.
//
// This is a WRITE, never a read. There is no endpoint anywhere that returns an
// existing password, because no readable copy of one exists — Supabase holds a
// hash and nothing else does. A super-admin can REPLACE a credential; they can
// never LEARN one, and nothing here changes that.
//
// Super-admin only, deliberately. Institution admins have send-invite, which is
// an offer the student can ignore; setting a password is taking the account
// over, and that is a narrower privilege than "any admin".
//
// The new password is not logged, not returned and not stored outside Supabase.
// =============================================================================
router.post('/:id/set-password', verifySuperAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid student id' });
    }
    const { password } = req.body || {};
    if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    // role = 'student' in the WHERE, not checked afterwards: this endpoint must
    // not be a way to take over an admin account.
    const target = await one(
      `select id, email from public.profiles where id = $1 and role = 'student'`,
      [req.params.id]
    );
    if (!target) return res.status(404).json({ success: false, error: 'Student not found' });

    const { error } = await supabaseAdmin.auth.admin.updateUserById(target.id, { password });
    if (error) throw error;

    // Kill every existing session so the old password stops working right away,
    // rather than lingering until its token expires. Same rule the institution
    // admin reset already follows.
    await supabaseAdmin.auth.admin.signOut(target.id, 'global').catch((e) => {
      logger.warn(`Could not revoke sessions for ${target.email}: ${e.message}`);
    });

    logger.info(`Student password set by ${req.user.email} for ${target.email}`);
    res.json({ success: true, email: target.email });
  } catch (e) {
    logger.error('Set student password failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// POST /api/students/:id/status   (any admin, institution-scoped)
// Body: { active: boolean }
//
// Switches an account off without destroying it. Deactivating BANS the Supabase
// login and revokes live sessions, so the student cannot sign in — but the
// profile, the platform rows and every scraped number survive and come back
// exactly as they were on reactivation.
//
// The ban is the load-bearing half. profiles.deactivated_at alone would be
// decoration: middleware/supabaseAuth.js resolves identity through
// supabaseAdmin.auth.getUser(), and an account that is only flagged in our own
// table would keep signing in perfectly. Banning is what supabase.auth.getUser()
// actually rejects.
//
// Scoped like every other write here: an institution admin can only reach their
// own students, and role = 'student' keeps admins out of it entirely.
// =============================================================================
router.post('/:id/status', verifyAdmin, async (req, res) => {
  try {
    if (!isUuid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid student id' });
    }
    if (typeof req.body?.active !== 'boolean') {
      return res.status(400).json({ success: false, error: '`active` must be true or false' });
    }
    const active = req.body.active;

    const institutionId = scopeFor(req, null);
    const params = institutionId === null ? [req.params.id] : [req.params.id, institutionId];
    const target = await one(
      `select id, email from public.profiles
        where id = $1 and role = 'student'
        ${institutionId === null ? '' : 'and institution_id = $2'}`,
      params
    );
    if (!target) return res.status(404).json({ success: false, error: 'Student not found' });

    // 'none' lifts a ban; a long duration is how Supabase expresses "indefinite".
    const { error } = await supabaseAdmin.auth.admin.updateUserById(target.id, {
      ban_duration: active ? 'none' : '876000h', // ~100 years
    });
    if (error) throw error;

    if (!active) {
      // Being banned stops the NEXT token check; an access token already in the
      // student's browser is valid until it expires. Revoking sessions makes the
      // deactivation take effect now rather than within the hour.
      await supabaseAdmin.auth.admin.signOut(target.id, 'global').catch((e) => {
        logger.warn(`Could not revoke sessions for ${target.email}: ${e.message}`);
      });
    }

    await query(
      `update public.profiles set deactivated_at = ${active ? 'null' : 'now()'} where id = $1`,
      [target.id]
    );

    logger.info(
      `Student ${active ? 'activated' : 'deactivated'}: ${target.email} by ${req.user.email}`
    );
    const row = await one(`${STUDENT_SELECT} where p.id = $1`, [target.id]);
    res.json({ success: true, student: serializeStudent(row) });
  } catch (e) {
    logger.error('Set student status failed:', e);
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
  // No `college`. It mirrors the institution the student was registered under,
  // and a student typing over it is precisely how one college becomes several
  // spellings on the same leaderboard. Moving a student to a different college
  // is a super-admin action (PATCH /api/students/:id with institutionId), which
  // updates both fields together.
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
