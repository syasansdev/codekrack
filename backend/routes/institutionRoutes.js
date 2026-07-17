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
import { verifyAdmin, verifySuperAdmin } from '../middleware/supabaseAuth.js';
import { serializeInstitution } from '../utils/serialize.js';
import logger from '../utils/logger.js';

const router = express.Router();

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
const isUuid = (v) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

// The admin + student count come from joins, so they can never drift from the
// profiles table the way a denormalised copy would.
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
`;

// =============================================================================
// GET /api/institutions   (any admin)
// Super-admins see every institution; an institution admin sees only their own.
// =============================================================================
router.get('/', verifyAdmin, async (req, res) => {
  try {
    const rows = req.user.isSuperAdmin
      ? await many(`${INSTITUTION_SELECT} order by i.name asc`)
      : await many(`${INSTITUTION_SELECT} where i.id = $1 order by i.name asc`, [
          req.user.institutionId || '00000000-0000-0000-0000-000000000000',
        ]);
    res.json({ success: true, institutions: rows.map(serializeInstitution) });
  } catch (e) {
    logger.error('List institutions failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// POST /api/institutions   (super-admin only)
// Body: { name, code?, address?, contactEmail?, adminEmail, adminPassword, adminName? }
// Creates the institution AND its admin's Auth account + profile.
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
  if (!isValidEmail(adminEmail)) {
    return res.status(400).json({ success: false, error: 'A valid admin email is required' });
  }
  if (!adminPassword || String(adminPassword).length < 8) {
    return res
      .status(400)
      .json({ success: false, error: 'Admin password must be at least 8 characters' });
  }

  const lower = String(adminEmail).toLowerCase().trim();
  const dupe = await one('select id from public.profiles where lower(email) = $1', [lower]);
  if (dupe) {
    return res.status(400).json({ success: false, error: 'That admin email is already registered' });
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
      const inst = await c.query(
        `insert into public.institutions (name, code, address, contact_email, created_by)
         values ($1, $2, $3, $4, $5) returning id`,
        [
          String(name).trim(),
          String(code || '').trim(),
          String(address || '').trim(),
          String(contactEmail || '').trim(),
          req.user.uid,
        ]
      );
      const id = inst.rows[0].id;
      await c.query(
        `insert into public.profiles (id, email, name, display_name, role, institution_id)
         values ($1, $2, $3, $3, 'admin', $4)`,
        [authUser.id, lower, adminName || `${name} Admin`, id]
      );
      return id;
    });

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

    const inst = await one('select id from public.institutions where id = $1', [id]);
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

    const row = await one(`${INSTITUTION_SELECT} where i.id = $1`, [id]);
    res.json({ success: true, institution: serializeInstitution(row) });
  } catch (e) {
    logger.error('Update institution failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// =============================================================================
// DELETE /api/institutions/:id   (super-admin only)
// Removes the institution and its admin login. Student records are KEPT but
// unlinked (institution_id -> null), so data is never silently destroyed.
// The FK is `on delete set null`, so the unlink is the database's job.
// =============================================================================
router.delete('/:id', verifySuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: 'Invalid institution id' });

    const inst = await one('select id, name from public.institutions where id = $1', [id]);
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

    // Students survive: profiles.institution_id is ON DELETE SET NULL, so this
    // unlinks them in one statement instead of a client-side batch loop.
    await query('delete from public.institutions where id = $1', [id]);

    logger.info(
      `Institution deleted: ${inst.name} (${id}) — ${studentCount} student(s) unlinked, ${admins.length} admin login(s) removed`
    );
    res.json({ success: true, unlinkedStudents: studentCount, removedAdmins: admins.length });
  } catch (e) {
    logger.error('Delete institution failed:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
