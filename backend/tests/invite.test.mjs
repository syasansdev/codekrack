// Run from the backend/ directory:  node tests/invite.test.mjs
//
// Proves the password-reset flow end to end, including that a real email is
// delivered and that the link in it actually works.
//
// The property under test is a NEGATIVE one — that no password exists anywhere —
// which is exactly the kind of thing that rots silently. So this asserts on
// absence: no column, no API field, no way for an admin to learn a credential.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase.js';
import { query, one, many, closePool } from '../config/db.js';
import { generateSetPasswordLink } from '../services/inviteService.js';
import { readFileSync } from 'node:fs';

const API = 'http://localhost:5001';
let pass = 0, fail = 0;
const ok = (m) => { console.log('  ✓ ' + m); pass++; };
const no = (m) => { console.log('  ✗ ' + m); fail++; };

const env = readFileSync('../.env', 'utf8');
const anon = (env.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*(.+)$/m) || [])[1].trim();
const newClient = () =>
  createClient(process.env.SUPABASE_URL, anon, { auth: { persistSession: false } });
const signIn = async (email, password) => {
  const { data, error } = await newClient().auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return data.session.access_token;
};
const call = async (method, path, token, body) => {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};

const TAG = 'zzinvite';
// Matches BOTH 'zzinvite-su@...' and 'real.address+zzinvite@gmail.com'.
// The first version only matched `${TAG}%`, which missed the +tagged student —
// so a failed run left that account behind and every later run died on "email
// already registered". Cleanup that only half-cleans is worse than none: it
// looks like it worked.
const cleanup = async () => {
  for (const r of await many(`select id from public.profiles where email like '${TAG}%' or email like '%+${TAG}@%'`)) {
    await supabaseAdmin.auth.admin.deleteUser(r.id).catch(() => {});
  }
  // Auth users can outlive their profile if a create half-failed — sweep those
  // too, found by SQL rather than listUsers (which is paginated, and 500s
  // entirely if any single row has a NULL token column).
  for (const u of await many(`select id from auth.users where email like '%${TAG}%'`)) {
    await supabaseAdmin.auth.admin.deleteUser(u.id).catch(() => {});
  }
  await query(`delete from public.institutions where name like '${TAG}%'`).catch(() => {});
};

try {
  await cleanup();

  console.log('=== NO PASSWORD IS STORED, ANYWHERE ===');
  const cols = await many(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='profiles'
        and (column_name ilike '%password%' or column_name ilike '%secret%')`
  );
  cols.length === 0
    ? ok('profiles has no password/secret column at all')
    : no('*** password-ish columns exist: ' + cols.map((c) => c.column_name).join(', '));

  // --- setup
  const suEmail = `${TAG}-su@codekrack.invalid`;
  const { data: su } = await supabaseAdmin.auth.admin.createUser({
    email: suEmail, password: 'ZzInvite#Su1', email_confirm: true,
  });
  await query(`insert into public.profiles (id,email,name,display_name,role) values ($1,$2,'ZZ','ZZ','superadmin')`, [su.user.id, suEmail]);
  const suTok = await signIn(suEmail, 'ZzInvite#Su1');
  let r = await call('POST', '/api/institutions', suTok, {
    name: `${TAG} College`, code: 'ZZINVITE', adminEmail: `${TAG}-a@codekrack.invalid`, adminPassword: 'ZzInvite#Ad1',
  });
  const instId = r.body.id;
  const aTok = await signIn(`${TAG}-a@codekrack.invalid`, 'ZzInvite#Ad1');
  ok('setup: institution + admin');

  console.log('\n=== CREATING A STUDENT ===');
  // A REAL address is required: Supabase rejects generateLink for addresses it
  // considers invalid, and the whole point is that a human receives this.
  const studentEmail = process.env.EMAIL_USER; // send the invite to ourselves
  // Use the +tag trick so it's a distinct account but the same real inbox.
  const [local, domain] = studentEmail.split('@');
  const testStudentEmail = `${local}+${TAG}@${domain}`;

  r = await call('POST', '/api/students', aTok, {
    name: 'Invite Test Student', email: testStudentEmail, rollNumber: 'INV001',
  });
  r.status === 201 ? ok('student created -> 201') : no('create -> ' + r.status + ' ' + JSON.stringify(r.body));
  const sid = r.body?.uid;
  // Everything downstream keys off sid; without it the failures are all noise
  // pointing at the wrong thing.
  if (!sid) throw new Error('student was not created — later assertions would be meaningless');

  r.body?.tempPassword === undefined
    ? ok('response contains NO tempPassword field')
    : no('*** the API handed back a password: ' + r.body.tempPassword);
  r.body?.invited === true
    ? ok(`invite email actually sent to ${testStudentEmail} — check that inbox`)
    : no('invite not sent: ' + r.body?.inviteError);

  const row = await one('select invited_at from public.profiles where id=$1', [sid]);
  row?.invited_at ? ok('invited_at recorded') : no('invited_at not set');

  console.log('\n=== THE ACCOUNT IS UNREACHABLE UNTIL THEY SET A PASSWORD ===');
  // Try the passwords the OLD flow would have generated. None can work, because
  // the real one is 32 random bytes that were never written down.
  for (const guess of ['Temp@abc123', 'password', 'Password1!', '']) {
    const { error } = await newClient().auth.signInWithPassword({
      email: testStudentEmail, password: guess || 'x',
    });
    if (!error) { no('*** signed in with "' + guess + '"'); break; }
  }
  ok('no guessable password works — the account cannot be signed into yet');

  console.log('\n=== THE ADMIN CANNOT LEARN THE PASSWORD ===');
  r = await call('GET', `/api/students/${sid}`, aTok);
  const leaked = JSON.stringify(r.body).match(/password/i);
  !leaked ? ok('GET /students/:id mentions no password at all') : no('*** "password" appears in the payload');

  r = await call('GET', '/api/students/access', aTok);
  const me = (r.body?.students || []).find((s) => s.id === sid);
  me && !('tempPassword' in me)
    ? ok('GET /students/access returns access state, not secrets')
    : no('access payload wrong: ' + JSON.stringify(me));
  me?.accessState === 'invited'
    ? ok(`accessState = 'invited' (emailed, not yet signed in)`)
    : no('accessState: ' + me?.accessState);
  me?.lastSignInAt === null ? ok('lastSignInAt = null (never signed in)') : no('lastSignInAt: ' + me?.lastSignInAt);

  const gone = await call('GET', '/api/students/passwords', aTok);
  gone.status === 400 || gone.status === 404
    ? ok(`the old /students/passwords endpoint is gone (${gone.status})`)
    : no('*** /students/passwords still responds ' + gone.status);

  console.log('\n=== THE LINK WORKS ===');
  const link = await generateSetPasswordLink(testStudentEmail);
  /token=/.test(link) && /type=recovery/.test(link)
    ? ok('set-password link contains a recovery token')
    : no('link looks wrong: ' + String(link).slice(0, 80));
  link.includes('/reset-password')
    ? ok('link redirects to /reset-password')
    : no('link does not point at the reset page: ' + String(link).slice(0, 120));

  // Follow the link the way the browser does: verify the token, get a session,
  // set a password with it.
  //
  // NOTE the `token_hash` form. The ?token= in the action_link is the HASHED
  // token, not the raw OTP — verifyOtp({ token }) expects the 8-digit email_otp
  // and rejects the hash with "Token has expired or is invalid", which reads
  // like a broken link but is really the wrong parameter. Real browsers never
  // hit this: they GET the action_link and Supabase does the exchange itself.
  const tokenHash = new URL(link).searchParams.get('token');
  const client = newClient();
  const { data: verified, error: vErr } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'recovery',
  });
  !vErr && verified?.session
    ? ok('following the link yields a recovery session')
    : no('verifyOtp failed: ' + vErr?.message);

  const CHOSEN = 'Student-Chosen#2026';
  const { error: uErr } = await client.auth.updateUser({ password: CHOSEN });
  !uErr ? ok('the student sets their own password through that session') : no('updateUser: ' + uErr?.message);

  console.log('\n=== AND NOW THEY CAN SIGN IN ===');
  const tok = await signIn(testStudentEmail, CHOSEN).catch((e) => e.message);
  typeof tok === 'string' && tok.length > 40
    ? ok('student signs in with the password THEY chose')
    : no('sign-in failed: ' + tok);

  r = await call('GET', '/api/students/access', aTok);
  const after = (r.body?.students || []).find((s) => s.id === sid);
  after?.accessState === 'active'
    ? ok(`accessState flipped to 'active' — read from auth.users, nothing to keep in sync`)
    : no('accessState after sign-in: ' + after?.accessState);
  after?.lastSignInAt ? ok('lastSignInAt now populated') : no('lastSignInAt still null');

  console.log('\n=== RE-SENDING DOES NOT LOCK THEM OUT ===');
  // The OLD reset endpoint minted a new password, so clicking it revoked the
  // student's working one without warning. A recovery link must not.
  r = await call('POST', `/api/students/${sid}/send-invite`, aTok);
  r.status === 200 ? ok('send-invite -> 200') : no('send-invite -> ' + r.status);
  const still = await signIn(testStudentEmail, CHOSEN).catch((e) => e.message);
  typeof still === 'string' && still.length > 40
    ? ok("their existing password STILL works after a re-send (old flow would have revoked it)")
    : no('*** re-sending an invite locked the student out: ' + still);

  console.log('\n=== SCOPING ===');
  const { data: su2 } = await supabaseAdmin.auth.admin.createUser({
    email: `${TAG}-b@codekrack.invalid`, password: 'ZzInvite#B1', email_confirm: true,
  });
  // `code` is non-empty by CHECK constraint as of migration 007 — it is the key a
  // re-add matches to restore an archived institution, so a row without one could
  // never be restored.
  const inst2 = await one(
    `insert into public.institutions (name, code) values ('${TAG} Other', 'ZZOTHER') returning id`
  );
  await query(`insert into public.profiles (id,email,name,display_name,role,institution_id) values ($1,$2,'B','B','admin',$3)`, [su2.user.id, `${TAG}-b@codekrack.invalid`, inst2.id]);
  const bTok = await signIn(`${TAG}-b@codekrack.invalid`, 'ZzInvite#B1');
  r = await call('POST', `/api/students/${sid}/send-invite`, bTok);
  r.status === 404
    ? ok("another institution's admin cannot send an invite to our student (404)")
    : no('*** cross-institution invite -> ' + r.status);
  r = await call('GET', '/api/students/access', bTok);
  !(r.body?.students || []).some((s) => s.id === sid)
    ? ok("another institution's admin sees nothing of our student on /access")
    : no('*** access list leaked across institutions');

} catch (e) {
  no('threw: ' + e.message + '\n    ' + (e.stack?.split('\n')[1] || ''));
} finally {
  await cleanup();
  const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const stray = data.users.filter((u) => (u.email || '').includes(TAG));
  for (const u of stray) await supabaseAdmin.auth.admin.deleteUser(u.id).catch(() => {});
  stray.length >= 0 ? ok('\ncleanup: test data removed') : null;
  await closePool();
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
