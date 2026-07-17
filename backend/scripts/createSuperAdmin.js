// backend/scripts/createSuperAdmin.js
//
// Bootstraps the one global super-admin. This is the only account that cannot
// be created through the UI (nothing exists yet to authorise it), so it is
// created here, from a machine that holds the service_role key.
//
//   cd backend
//   node scripts/createSuperAdmin.js <email> <password> [name]
//
// Safe to re-run: if the account already exists it is promoted and its password
// reset, rather than erroring out.
import 'dotenv/config';
import { supabaseAdmin } from '../config/supabase.js';
import { one, query, closePool } from '../config/db.js';

const [, , email, password, ...nameParts] = process.argv;
const name = nameParts.join(' ') || 'Super Admin';

const die = (msg) => {
  console.error('✗ ' + msg);
  process.exit(1);
};

if (!email || !password) {
  die(
    'Usage: node scripts/createSuperAdmin.js <email> <password> [name]\n' +
      '  e.g. node scripts/createSuperAdmin.js super@syasans.com "StrongPass#123" "Syasans Super Admin"'
  );
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) die(`"${email}" is not a valid email`);
if (password.length < 8) die('Password must be at least 8 characters');

const run = async () => {
  const lower = email.toLowerCase().trim();

  // Is there already an auth user with this email?
  //
  // Looked up in SQL rather than with auth.admin.listUsers({perPage:1000}),
  // which this used to do and which has two failure modes:
  //
  //  1. It is PAGINATED. Past 1000 accounts it silently stops finding people —
  //     so this would decide the address was free, try to create it, and fail
  //     with a confusing "already registered" from a different layer.
  //  2. It is ALL-OR-NOTHING. GoTrue scans every row into Go structs whose token
  //     fields are plain strings, so a single row with a NULL confirmation_token
  //     (which is what you get if anything ever INSERTs into auth.users by raw
  //     SQL) makes the endpoint 500 for every caller — "Database error finding
  //     users". One bad row breaks the whole listing.
  //
  // A targeted query has neither problem.
  const existingAuth = await one('select id from auth.users where lower(email) = $1', [lower]);
  let authUser = existingAuth ? { id: existingAuth.id } : null;

  if (authUser) {
    console.log(`• Auth user already exists (${lower}) — resetting password`);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
    });
    if (error) die('Could not update user: ' + error.message);
  } else {
    // email_confirm: true — we are provisioning this account deliberately, so it
    // must be usable immediately without a confirmation-email round trip.
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: lower,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error) die('Could not create user: ' + error.message);
    authUser = data.user;
    console.log(`• Auth user created (${lower})`);
  }

  // The profile carries the privilege — there are no custom claims to set,
  // because the middleware reads this row on every request instead of trusting
  // the token. institution_id stays null: a super-admin is global, and the DB's
  // superadmin_has_no_institution check enforces it.
  const existing = await one('select id, role from public.profiles where id = $1', [authUser.id]);
  if (existing) {
    await query(
      `update public.profiles
          set role = 'superadmin', institution_id = null,
              name = $2, display_name = $2, email = $3
        where id = $1`,
      [authUser.id, name, lower]
    );
    console.log(`• Profile promoted: ${existing.role} -> superadmin`);
  } else {
    await query(
      `insert into public.profiles (id, email, name, display_name, role, institution_id)
       values ($1, $2, $3, $3, 'superadmin', null)`,
      [authUser.id, lower, name]
    );
    console.log('• Profile created with role=superadmin');
  }

  const check = await one(
    'select role, is_admin, is_super_admin, institution_id from public.profiles where id = $1',
    [authUser.id]
  );

  console.log('\n✓ Super-admin ready');
  console.log(`  email          ${lower}`);
  console.log(`  uid            ${authUser.id}`);
  console.log(`  role           ${check.role}`);
  console.log(`  is_admin       ${check.is_admin}   (generated from role)`);
  console.log(`  is_super_admin ${check.is_super_admin}   (generated from role)`);
  console.log(`  institution_id ${check.institution_id ?? 'null (global)'}`);
  console.log('\n  Sign in at /admin/signin with the email + password above.');

  await closePool();
};

run().catch((e) => {
  console.error('✗ ' + e.message);
  process.exit(1);
});
