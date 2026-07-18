// backend/routes/institutionRoutes.js
//
// Institution management. Creating an institution also provisions its admin
// login with a password the super-admin chooses, so that admin can sign in
// immediately with their registered id + password.
//
// Note there is no admin_uid / admin_email column on institutions. Firestore
// stored the admin's uid on the institution AND institution_id on the admin's
// profile — two copies of one fact that had to be updated together, and would
// silently disagree if either write failed. Here the admin is derived by join:
//   profiles where institution_id = $1 and role = 'admin'
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { query, one, many, tx } from '../config/db.js';
import { verifyAdmin, verifySuperAdmin, NO_INSTITUTION } from '../middleware/supabaseAuth.js';
import { serializeInstitution } from '../utils/serialize.js';
import { isValidEmail, normalizeEmail, undeliverableDomainReason } from '../utils/email.js';
import logger from '../utils/logger.js';

const router = express.Router();

const isUuid = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

// The admin + student count come from joins, so they can never drift from the
// profiles table the way a denormalised copy would.
// The `where i.deleted_at is null` is part of the SELECT, not bolted on by each
// caller — an archived institution must never appear in a list, and making that
// opt-out rather than opt-in is how one gets forgotten. Callers append `and ...`.
const INSTITUTION_SELECT = `
  select
    i.id, i.name, i.code, i.address, i.contact_email,
    i.created_at, i.updated_at, i.created_by,
    a.id    as admin_id,
    a.email as admin_email,
    a.name  as admin_name,
    (select count(*) from public.profiles s
      where s.institution_id = i.id and s.role = 'student') as student_count
  from public.institutions i
  left join lateral (
    select p.id, p.email, p.name from public.profiles p
     where p.institution_id = i.id and p.role = 'admin'
     order by p.created_at asc limit 1
  ) a on true
  where i.deleted_at is null
`;

// =============================================================================
// GET /api/institutions   (any admin)
// Super-admins see every institution; an institution admin sees only their own.
// =============================================================================
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const rows = req.user.isSuperAdmin
      ? await many(`${INSTITUTION_SELECT} order by i.name asc`)
      : await many(`${INSTITUTION_SELECT} and i.id = $1 order by i.name asc`, [
          req.user.institutionId || NO_INSTITUTION,
        ]);
    res.json({ success: true, institutions: rows.map(serializeInstitution) });
  } catch (e) {
    logger.error('List institutions failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// POST /api/institutions   (super-admin only)
// Body: { name, code, address?, contactEmail?, adminEmail, adminPassword, adminName? }
// Creates the institution AND its admin's Auth account + profile.
//
// RESTORE-ON-RE-ADD. If `code` matches an ARCHIVED institution, this restores
// that row instead of inserting a new one — same uuid, so its students are
// simply back. Nothing is re-mapped, because a soft delete never unmapped them.
//
// Matching on `code` and not on `name`: the code is unique (institutions_code_key
// spans archived rows too, see 007) and deliberately typed, while names are free
// text and not unique. Adopting several hundred students because someone typed a
// similar name is not a mistake worth risking.
// =============================================================================
router.post('/', verifySuperAdmin, async (req, res) => {
  const {
    name,
    code = '',
    address = '',
    contactEmail = '',
    adminEmail,
    adminPassword,
    adminName,
  } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, error: 'Institution name is required' });
  }
  // The code is now the institution's identity, not a nicety: it is what a
  // re-add matches to reclaim its students. An institution created without one
  // could never be restored, and would fail silently years later.
  if (!code || !String(code).trim()) {
    return res.status(400).json({
      success: false,
      error: 'Institution code is required — it identifies the institution if it is ever removed and re-added',
    });
  }
  // Normalise before validating (trailing space / mixed case), same as students.
  const lower = normalizeEmail(adminEmail);
  if (!isValidEmail(lower)) {
    return res.status(400).json({ success: false, error: 'A valid admin email is required' });
  }
  if (!adminPassword || String(adminPassword).length < 8) {
    return res
      .status(400)
      .json({ success: false, error: 'Admin password must be at least 8 characters' });
  }

  const trimmedCode = String(code).trim();

  // Is this code taken by a LIVE institution? Then it's a genuine duplicate, and
  // catching it here beats surfacing a raw unique-violation from Postgres.
  const liveDupe = await one(
    'select id, name from public.institutions where lower(code) = lower($1) and deleted_at is null',
    [trimmedCode]
  );
  if (liveDupe) {
    return res.status(400).json({
      success: false,
      error: `Code "${trimmedCode}" is already used by "${liveDupe.name}"`,
    });
  }

  // Is it an ARCHIVED one? Then this is a re-add, and we restore rather than
  // insert. Its students never lost institution_id, so they return with it.
  const archived = await one(
    `select id, name, (select count(*)::int from public.profiles s
                        where s.institution_id = i.id and s.role = 'student') as student_count
       from public.institutions i
      where lower(i.code) = lower($1) and i.deleted_at is not null`,
    [trimmedCode]
  );

  const dupe = await one('select id from public.profiles where lower(email) = $1', [lower]);
  if (dupe) {
    return res.status(400).json({ success: false, error: 'That admin email is already registered' });
  }

  // The admin login is created here and its password set directly, so this admin
  // never receives an invite — but they DO receive password resets and, later,
  // any admin-facing mail. Catching a dead domain now (this is exactly how
  // "sjceadmin@edu.com" would slip in) beats a silent bounce later.
  const badDomain = await undeliverableDomainReason(lower);
  if (badDomain) {
    return res.status(400).json({ success: false, error: badDomain });
  }

  let authUser;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: lower,
      password: adminPassword,
      email_confirm: true, // the super-admin set this password deliberately
      user_metadata: { name: adminName || `${name} Admin` },
    });
    if (error) {
      if (/already/i.test(error.message)) {
        return res
          .status(400)
          .json({ success: false, error: 'That admin email is already registered' });
      }
      if (/password/i.test(error.message)) {
        return res.status(400).json({ success: false, error: error.message });
      }
      throw error;
    }
    authUser = data.user;
  } catch (e) {
    logger.error('Institution admin createUser failed:', e);
    return res.status(500).json({ success: false, error: e.message });
  }

  try {
    // Institution + its admin's profile commit together. If the profile insert
    // fails, the institution is not left behind with no way to administer it.
    const instId = await tx(async (c) => {
      let id;

      if (archived) {
        // RESTORE. Clearing deleted_at brings back the same uuid, and every
        // student still pointing at it comes back with it — no re-mapping, no
        // guessing. The other fields are refreshed from what was just typed, so
        // a rename during re-add is honoured.
        const restored = await c.query(
          `update public.institutions
              set deleted_at = null,
                  name = $1,
                  address = $2,
                  contact_email = $3,
                  updated_at = now()
            where id = $4
        returning id`,
          [
            String(name).trim(),
            String(address || '').trim(),
            String(contactEmail || '').trim(),
            archived.id,
          ]
        );
        id = restored.rows[0].id;
      } else {
        const inst = await c.query(
          `insert into public.institutions (name, code, address, contact_email, created_by)
           values ($1, $2, $3, $4, $5) returning id`,
          [
            String(name).trim(),
            trimmedCode,
            String(address || '').trim(),
            String(contactEmail || '').trim(),
            req.user.uid,
          ]
        );
        id = inst.rows[0].id;
      }

      await c.query(
        `insert into public.profiles (id, email, name, display_name, role, institution_id)
         values ($1, $2, $3, $3, 'admin', $4)`,
        [authUser.id, lower, adminName || `${name} Admin`, id]
      );
      return id;
    });

    if (archived) {
      logger.info(
        `Institution RESTORED from archive: ${name} (${instId}) code=${trimmedCode} — ` +
          `${archived.student_count} student(s) reclaimed, admin=${lower}`
      );
      return res.status(201).json({
        success: true,
        id: instId,
        adminUid: authUser.id,
        adminEmail: lower,
        // The UI tells the super-admin this was a restore rather than a create,
        // and how many students came back with it. Silently adopting hundreds of
        // students would be alarming to discover later.
        restored: true,
        reclaimedStudents: archived.student_count,
      });
    }

    logger.info(`Institution created: ${name} (${instId}) admin=${lower}`);
    res.status(201).json({ success: true, id: instId, adminUid: authUser.id, adminEmail: lower });
  } catch (error) {
    // Roll back the Auth user so a failed create leaves no orphan login.
    await supabaseAdmin.auth.admin.deleteUser(authUser.id).catch(() => {});
    logger.error('Error creating institution:', error);
    if (error.code === '23505') {
      return res
        .status(400)
        .json({ success: false, error: 'An institution with that code already exists' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// PATCH /api/institutions/:id   (super-admin only)
// Body: { name?, code?, address?, contactEmail?, adminPassword? }
// adminPassword resets the institution admin's login password.
// =============================================================================
const EDITABLE = {
  name: 'name',
  code: 'code',
  address: 'address',
  contactEmail: 'contact_email',
};

router.patch('/:id', verifySuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: 'Invalid institution id' });

    const inst = await one(
      'select id from public.institutions where id = $1 and deleted_at is null',
      [id]
    );
    if (!inst) return res.status(404).json({ success: false, error: 'Institution not found' });

    const { adminPassword } = req.body || {};

    // Allow-list: created_by / created_at / id are unreachable from the body.
    const sets = [];
    const params = [];
    for (const [apiKey, column] of Object.entries(EDITABLE)) {
      if (!(apiKey in (req.body || {}))) continue;
      params.push(String(req.body[apiKey] ?? '').trim());
      sets.push(`${column} = $${params.length}`);
    }
    if (sets.length) {
      params.push(id);
      try {
        await query(
          `update public.institutions set ${sets.join(', ')} where id = $${params.length}`,
          params
        );
      } catch (e) {
        if (e.code === '23505') {
          return res
            .status(400)
            .json({ success: false, error: 'An institution with that code already exists' });
        }
        if (e.code === '23514') {
          return res.status(400).json({ success: false, error: 'Institution name cannot be blank' });
        }
        throw e;
      }
    }

    if (adminPassword) {
      if (String(adminPassword).length < 8) {
        return res
          .status(400)
          .json({ success: false, error: 'Admin password must be at least 8 characters' });
      }
      const admin = await one(
        `select id, email from public.profiles
          where institution_id = $1 and role = 'admin' order by created_at asc limit 1`,
        [id]
      );
      if (!admin) {
        return res
          .status(400)
          .json({ success: false, error: 'This institution has no admin account' });
      }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(admin.id, {
        password: adminPassword,
      });
      if (error) throw error;

      // Kill every existing session so the old password stops working right
      // away, rather than lingering until its token expires.
      await supabaseAdmin.auth.admin.signOut(admin.id, 'global').catch((e) => {
        logger.warn(`Could not revoke sessions for ${admin.email}: ${e.message}`);
      });
      logger.info(`Institution admin password reset: ${admin.email}`);
    }

    // `and`, not `where` — INSTITUTION_SELECT already carries its own
    // `where i.deleted_at is null`.
    const row = await one(`${INSTITUTION_SELECT} and i.id = $1`, [id]);
    res.json({ success: true, institution: serializeInstitution(row) });
  } catch (e) {
    logger.error('Update institution failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// DELETE /api/institutions/:id   (super-admin only)
//
// ARCHIVES the institution. It disappears from every list and count, and its
// admin login is removed, but the ROW STAYS and its students are not touched.
//
// This used to be a real `delete from institutions`, and because
// profiles.institution_id is `on delete set null` (001_init.sql:94) the database
// nulled every student's link on the way out. The rows survived; the
// relationship did not, and nothing on a profile records which institution it
// was in — so re-adding the college could never get its students back. That is
// how all 3 students on this database ended up orphaned.
//
// Archiving keeps the FK from ever firing, so there is nothing to re-map: the
// students are still pointed at this row, just hidden along with it. Re-adding
// the same CODE restores it (see POST) and they reappear.
//
// The admin's LOGIN is still deleted, deliberately: archiving must actually
// revoke access. A restore mints a new admin account, which is also the moment
// to reconsider who administers it.
// =============================================================================
router.delete('/:id', verifySuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: 'Invalid institution id' });

    const inst = await one(
      'select id, name, code from public.institutions where id = $1 and deleted_at is null',
      [id]
    );
    if (!inst) return res.status(404).json({ success: false, error: 'Institution not found' });

    const admins = await many(
      `select id, email from public.profiles where institution_id = $1 and role = 'admin'`,
      [id]
    );
    const studentCount = (
      await one(
        `select count(*)::int as n from public.profiles
          where institution_id = $1 and role = 'student'`,
        [id]
      )
    ).n;

    // Delete admin logins first. Their profiles cascade from auth.users.
    for (const a of admins) {
      await supabaseAdmin.auth.admin.deleteUser(a.id).catch((e) => {
        logger.warn(`Could not delete admin ${a.email}: ${e.message}`);
      });
    }

    // The archive. One column, and the students keep their institution_id.
    await query('update public.institutions set deleted_at = now() where id = $1', [id]);

    logger.info(
      `Institution archived: ${inst.name} (${id}) code=${inst.code} — ` +
        `${studentCount} student(s) retained their link, ${admins.length} admin login(s) removed. ` +
        `Re-adding code "${inst.code}" restores it.`
    );
    res.json({
      success: true,
      archived: true,
      // Named `retainedStudents`, not `unlinkedStudents`: the old key described
      // the old destructive behaviour, and the UI reports this number to a human.
      retainedStudents: studentCount,
      removedAdmins: admins.length,
      code: inst.code,
    });
  } catch (e) {
    logger.error('Archive institution failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
