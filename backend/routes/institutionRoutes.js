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

const institutionHasAdminPasswordColumn = async () => {
  try {
    const row = await one(`
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'institutions'
          and column_name = 'admin_password'
      ) as has_admin_password
    `);
    return !!row?.has_admin_password;
  } catch (e) {
    logger.warn('Could not detect institution admin_password column:', e.message);
    return false;
  }
};

const buildInstitutionSelect = (includeAdminPassword = false) => {
  const adminPasswordColumn = includeAdminPassword ? 'i.admin_password,' : '';
  return `
    select
      i.id, i.name, i.code, i.address, i.contact_email, ${adminPasswordColumn}
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
};

// =============================================================================
// GET /api/institutions/public   (PUBLIC — no token)
//
// The list behind the college dropdown on the registration form. Registration
// submits an institution_id chosen from THIS list, never a typed college name,
// which is the whole reason it exists: one canonical row per college instead of
// eleven spellings of the same one, and no way for a student to invent a
// college that no super-admin has onboarded.
//
// Deliberately not the admin list. That one carries the institution's admin
// email, its address, its contact address and its student count — none of which
// an anonymous visitor has any business reading. This returns the two fields a
// dropdown renders and nothing else, so widening the admin query later cannot
// quietly widen this one.
//
// Archived institutions are excluded by INSTITUTION_SELECT's own
// , so a college that has been removed stops being
// a destination for new students the moment it is archived.
// =============================================================================
router.get('/public', async (_req, res) => {
  try {
    const rows = await many(
      `select i.id, i.name from public.institutions i
        where i.deleted_at is null order by i.name asc`
    );
    res.json({ success: true, institutions: rows.map((r) => ({ id: r.id, name: r.name })) });
  } catch (e) {
    logger.error('List public institutions failed:', e);
    res.status(500).json({ success: false, error: 'Could not load colleges.' });
  }
});

// =============================================================================
// GET /api/institutions   (any admin)
// Super-admins see every institution; an institution admin sees only their own.
// =============================================================================
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const includeAdminPassword = await institutionHasAdminPasswordColumn();
    const selectSql = buildInstitutionSelect(includeAdminPassword);
    const rows = req.user.isSuperAdmin
      ? await many(`${selectSql} order by i.name asc`)
      : await many(`${selectSql} and i.id = $1 order by i.name asc`, [
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

  const includeAdminPassword = await institutionHasAdminPasswordColumn();

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
        const restoreFields = [
          'deleted_at = null',
          'name = $1',
          'address = $2',
          'contact_email = $3',
          'updated_at = now()',
        ];
        const restoreValues = [
          String(name).trim(),
          String(address || '').trim(),
          String(contactEmail || '').trim(),
        ];
        if (includeAdminPassword) {
          restoreFields.splice(4, 0, 'admin_password = $4');
          restoreValues.push(adminPassword);
        }
        const restored = await c.query(
          `update public.institutions
              set ${restoreFields.join(', ')}
            where id = $${restoreValues.length + 1}
          returning id`,
          [...restoreValues, archived.id]
        );
        id = restored.rows[0].id;
      } else {
        const insertFields = ['name', 'code', 'address', 'contact_email', 'created_by'];
        const insertValues = [
          String(name).trim(),
          trimmedCode,
          String(address || '').trim(),
          String(contactEmail || '').trim(),
          req.user.uid,
        ];
        if (includeAdminPassword) {
          insertFields.splice(4, 0, 'admin_password');
          insertValues.splice(4, 0, adminPassword);
        }
        const inst = await c.query(
          `insert into public.institutions (${insertFields.join(', ')})
           values (${insertValues.map((_, idx) => `$${idx + 1}`).join(', ')}) returning id`,
          insertValues
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

    const includeAdminPassword = await institutionHasAdminPasswordColumn();
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

      if (includeAdminPassword) {
        await query(
          `update public.institutions set admin_password = $1, updated_at = now() where id = $2`,
          [adminPassword, id]
        );
      } else {
        logger.warn(
          `Admin auth password was updated for ${admin.email}, but the institutions.admin_password column is not present in this database.`
        );
      }

      // Kill every existing session so the old password stops working right
      // away, rather than lingering until its token expires.
      await supabaseAdmin.auth.admin.signOut(admin.id, 'global').catch((e) => {
        logger.warn(`Could not revoke sessions for ${admin.email}: ${e.message}`);
      });
      logger.info(`Institution admin password reset: ${admin.email}`);
    }

    // `and`, not `where` — buildInstitutionSelect() already carries its own
    // `where i.deleted_at is null`.
    const row = await one(`${buildInstitutionSelect(includeAdminPassword)} and i.id = $1`, [id]);
    res.json({ success: true, institution: serializeInstitution(row) });
  } catch (e) {
    logger.error('Update institution failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// DELETE /api/institutions/:id   (super-admin only)
//
// Permanent deletion is required for institutional cleanup. The institution,
// its admin accounts and every student under that institution are deleted.
// A secret code is required before the request is processed.
// =============================================================================
router.delete('/:id', verifySuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { secretCode } = req.body || {};
    const REQUIRED_SECRET = 'yoGi2290#!';

    if (!isUuid(id)) return res.status(400).json({ success: false, error: 'Invalid institution id' });
    if (String(secretCode ?? '').trim() !== REQUIRED_SECRET) {
      return res.status(403).json({ success: false, error: 'Incorrect secret code' });
    }

    const inst = await one(
      'select id, name, code from public.institutions where id = $1',
      [id]
    );
    if (!inst) return res.status(404).json({ success: false, error: 'Institution not found' });

    const admins = await many(
      `select id, email from public.profiles where institution_id = $1 and role = 'admin'`,
      [id]
    );
    const students = await many(
      `select id, email from public.profiles where institution_id = $1 and role = 'student'`,
      [id]
    );

    // Delete Auth accounts first so the profile rows can be removed cleanly.
    for (const a of admins) {
      await supabaseAdmin.auth.admin.deleteUser(a.id).catch((e) => {
        logger.warn(`Could not delete admin auth user ${a.email}: ${e.message}`);
      });
    }
    for (const s of students) {
      await supabaseAdmin.auth.admin.deleteUser(s.id).catch((e) => {
        logger.warn(`Could not delete student auth user ${s.email}: ${e.message}`);
      });
    }

    await query('delete from public.profiles where institution_id = $1', [id]);
    await query('delete from public.institutions where id = $1', [id]);

    logger.warn(
      `Institution permanently deleted: ${inst.name} (${id}) code=${inst.code} — ` +
        `${students.length} student(s), ${admins.length} admin login(s) removed.`
    );
    res.json({
      success: true,
      deleted: true,
      deletedStudents: students.length,
      removedAdmins: admins.length,
      code: inst.code,
      name: inst.name,
    });
  } catch (e) {
    logger.error('Permanent institution delete failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
