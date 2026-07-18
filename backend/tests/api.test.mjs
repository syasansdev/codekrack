// Run from the backend/ directory:  node tests/<name>.test.mjs
// or all of them:                    npm test
//
// These hit the REAL database and REAL platform APIs — they are integration
// tests, not unit tests, which is the point: they caught a broken cascade, a
// fabricating scraper and a CORS gap that no mock would have.
//
// Every suite tags its data (zz*) and deletes it in a finally block, and none of
// them assume an empty database — they measure their own rows and connection
// deltas, so they stay green against a live, in-use system.
// Exercises the Supabase API over real HTTP, as the browser will.
// Creates two institutions + their admins, proves an admin of A cannot reach B,
// then deletes everything it made. Prints no secrets.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase.js';
import { query, many, closePool } from '../config/db.js';
import { readFileSync } from 'node:fs';

const API = 'http://localhost:5001';
let pass = 0, fail = 0;
const ok = (m) => { console.log('  ✓ ' + m); pass++; };
const no = (m) => { console.log('  ✗ ' + m); fail++; };

const env = readFileSync('../.env', 'utf8');
const anon = (env.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*(.+)$/m) || [])[1].trim();

const call = async (method, path, token, body) => {
  const r = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
};

const signIn = async (email, password) => {
  const c = createClient(process.env.SUPABASE_URL, anon, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return data.session.access_token;
};

const TAG = 'zzapitest';
const made = { users: [], institutions: [] };
const cleanup = async () => {
  const rows = await many(`select id from public.profiles where email like '${TAG}%'`);
  for (const r of rows) await supabaseAdmin.auth.admin.deleteUser(r.id).catch(() => {});
  await query(`delete from public.institutions where name like '${TAG}%'`).catch(() => {});
};

try {
  await cleanup(); // leftovers from a previous failed run

  // --- a super-admin to drive setup. Created here, deleted at the end.
  const suEmail = `${TAG}-super@codekrack.invalid`;
  const suPass = 'ZzApiTest#Super1';
  const { data: suData, error: suErr } = await supabaseAdmin.auth.admin.createUser({
    email: suEmail, password: suPass, email_confirm: true,
  });
  if (suErr) throw new Error('create super: ' + suErr.message);
  await query(
    `insert into public.profiles (id,email,name,display_name,role) values ($1,$2,'ZZ Super','ZZ Super','superadmin')`,
    [suData.user.id, suEmail]
  );
  const suTok = await signIn(suEmail, suPass);
  ok('test super-admin provisioned');

  console.log('\n=== INSTITUTIONS (super-admin) ===');
  let r = await call('POST', '/api/institutions', suTok, {
    name: `${TAG} Alpha College`, code: 'ZZALPHA', adminEmail: `${TAG}-alpha@codekrack.invalid`,
    adminPassword: 'ZzAlpha#Admin1', adminName: 'Alpha Admin',
  });
  r.status === 201 ? ok('create institution A + its admin login -> 201') : no('create A -> ' + r.status + ' ' + JSON.stringify(r.body));
  const instA = r.body?.id;

  r = await call('POST', '/api/institutions', suTok, {
    name: `${TAG} Beta College`, code: 'ZZBETA', adminEmail: `${TAG}-beta@codekrack.invalid`,
    adminPassword: 'ZzBeta#Admin1', adminName: 'Beta Admin',
  });
  const instB = r.body?.id;
  r.status === 201 ? ok('create institution B + its admin login -> 201') : no('create B -> ' + r.status);

  r = await call('POST', '/api/institutions', suTok, {
    name: `${TAG} Dupe`, code: 'ZZALPHA', adminEmail: `${TAG}-d@codekrack.invalid`, adminPassword: 'ZzDupe#Admin1',
  });
  r.status === 400 ? ok('duplicate institution code -> 400 (DB unique index)') : no('dupe code -> ' + r.status);

  r = await call('POST', '/api/institutions', suTok, {
    name: `${TAG} Weak`, code: 'ZZWEAK', adminEmail: `${TAG}-w@codekrack.invalid`, adminPassword: 'short',
  });
  r.status === 400 ? ok('weak admin password -> 400') : no('weak pw -> ' + r.status);

  // --- the institution admins sign in with the password the super-admin set
  console.log('\n=== THE REQUIREMENT: admin logs in with registered id + password ===');
  const aTok = await signIn(`${TAG}-alpha@codekrack.invalid`, 'ZzAlpha#Admin1');
  ok('institution A admin signed in with the password the super-admin chose');
  const bTok = await signIn(`${TAG}-beta@codekrack.invalid`, 'ZzBeta#Admin1');
  ok('institution B admin signed in');

  console.log('\n=== STUDENTS ===');
  r = await call('POST', '/api/students', aTok, {
    name: 'Alpha Student One', email: `${TAG}-s1@codekrack.invalid`,
    rollNumber: 'A001', department: 'CSE', year: '3', tenthPercentage: '92.5',
    platformUrls: { leetcode: 'leetcode.com/u/alphaone', github: 'github.com/alphaone' },
  });
  r.status === 201 && r.body.tempPassword === undefined
    ? ok('admin A creates a student -> 201, and NO password comes back — there is not one')
    : no('create student -> ' + r.status + ' ' + JSON.stringify(r.body));
  const s1 = r.body?.uid;
  r.body?.institutionId === instA ? ok('student auto-assigned to admin A\'s institution') : no('wrong institution assigned');

  // The core scoping test: admin A explicitly asks for institution B.
  r = await call('POST', '/api/students', aTok, {
    name: 'Smuggled Student', email: `${TAG}-s2@codekrack.invalid`, institutionId: instB,
  });
  const smuggled = r.body?.uid;
  r.body?.institutionId === instA
    ? ok('admin A passing institutionId=B -> FORCED to A (client value ignored, not trusted)')
    : no('*** SCOPE ESCAPE: student landed in ' + r.body?.institutionId);

  r = await call('POST', '/api/students', bTok, {
    name: 'Beta Student', email: `${TAG}-s3@codekrack.invalid`, platformUrls: { codeforces: 'codeforces.com/profile/betaone' },
  });
  const s3 = r.body?.uid;
  r.status === 201 ? ok('admin B creates a student in B') : no('B create -> ' + r.status);

  console.log('\n=== SCOPED LISTS ===');
  r = await call('GET', '/api/students', aTok);
  const aNames = (r.body?.students || []).map((s) => s.name).sort();
  aNames.length === 2 && !aNames.includes('Beta Student')
    ? ok(`admin A lists ${aNames.length} students — B's student not among them`)
    : no('admin A sees: ' + JSON.stringify(aNames));

  r = await call('GET', '/api/students?institutionId=' + instB, aTok);
  (r.body?.students || []).every((s) => s.institutionId === instA)
    ? ok('admin A forcing ?institutionId=B in the query string -> still only A')
    : no('*** SCOPE ESCAPE via query param ***');

  r = await call('GET', '/api/students', suTok);
  const ourStudents = (r.body?.students || []).filter((s) => s.email.startsWith(TAG));
  ourStudents.length === 3 ? ok('super-admin lists all 3 across both institutions') : no('super sees ' + ourStudents.length);

  r = await call('GET', `/api/students/${s3}`, aTok);
  r.status === 404 ? ok("admin A fetching B's student by id -> 404 (not 403: existence isn't leaked)") : no('cross-read -> ' + r.status);

  r = await call('GET', `/api/students/${s3}`, suTok);
  r.status === 200 ? ok('super-admin fetches the same student -> 200') : no('super read -> ' + r.status);

  console.log('\n=== SERIALIZER (legacy shape the components render) ===');
  r = await call('GET', `/api/students/${s1}`, aTok);
  const st = r.body?.student;
  st?.platformUrls?.leetcode === 'https://leetcode.com/u/alphaone' ? ok('platformUrls normalised with https://') : no('url: ' + st?.platformUrls?.leetcode);
  st?.scrapingStatus?.leetcode === 'pending' ? ok("scrapingStatus.leetcode = 'pending' (seeded on create)") : no('status: ' + st?.scrapingStatus?.leetcode);
  'github' in st.platformData && st.platformData.codeforces === null ? ok('platformData has all 4 keys, null where unscraped') : no('platformData: ' + JSON.stringify(Object.keys(st.platformData || {})));
  st?.tenthPercentage === 92.5 ? ok('tenthPercentage is a number (92.5), not the string Firestore stored') : no('tenth: ' + JSON.stringify(st?.tenthPercentage));
  st?.tempPassword === undefined ? ok('no tempPassword on GET /students/:id') : no('*** tempPassword leaked into GET /students/:id ***');

  console.log('\n=== ACCESS STATUS (replaces the temp-password screen) ===');
  r = await call('GET', '/api/students/access', aTok);
  const acc = r.body?.students || [];
  acc.length === 2 && acc.every((s) => s.institutionId === instA)
    ? ok("admin A sees only A's students on /access")
    : no('access scope: ' + acc.length);
  acc.every((s) => !('tempPassword' in s))
    ? ok('/access exposes NO password field — it reports access, not secrets')
    : no('*** /access leaked a password field ***');
  ['invited', 'active', 'never_invited'].includes(acc[0]?.accessState)
    ? ok('/access reports accessState (' + acc[0].accessState + ')')
    : no('accessState missing: ' + JSON.stringify(acc[0]));
  (r.body?.admins || []).length === 1 && r.body.admins[0].institutionId === instA
    ? ok("admin A sees their own institution's admin account")
    : no('admins in scope: ' + JSON.stringify((r.body?.admins || []).length));
  r = await call('GET', '/api/students/access', suTok);
  // Count only OUR admins: the database may hold real institutions too, and a
  // test that assumes an empty DB starts failing the moment the app is used.
  const ourAdmins = (r.body?.admins || []).filter((a) => a.email.startsWith(TAG));
  ourAdmins.length === 2
    ? ok('super-admin sees BOTH institution admins (the tracking requirement)')
    : no('super admins: ' + ourAdmins.length);

  console.log('\n=== UPDATE: privilege escalation attempts ===');
  r = await call('PATCH', `/api/students/${s1}`, aTok, {
    name: 'Renamed OK', role: 'superadmin', isAdmin: true, institutionId: instB, invitedAt: '1999-01-01',
  });
  const after = r.body?.student;
  after?.name === 'Renamed OK' ? ok('legitimate field (name) updated') : no('name not updated');
  after?.role === 'student' ? ok('role=superadmin in body -> IGNORED (allow-list, not block-list)') : no('*** ROLE ESCALATED to ' + after?.role);
  after?.institutionId === instA ? ok('institutionId=B in body -> IGNORED for a non-super admin') : no('*** MOVED to ' + after?.institutionId);
  const raw = await many('select invited_at from public.profiles where id=$1', [s1]);
  !raw[0].invited_at || new Date(raw[0].invited_at).getFullYear() > 2000
    ? ok('invited_at in body -> IGNORED (not on the allow-list)')
    : no('*** invited_at was writable from a request body ***');

  r = await call('PATCH', `/api/students/${s3}`, aTok, { name: 'Cross Write' });
  r.status === 404 ? ok("admin A patching B's student -> 404") : no('cross-write -> ' + r.status);

  console.log('\n=== CHANGE EMAIL: profile AND login move together ===');
  const newEmail = `${TAG}-s1-changed@codekrack.invalid`;
  r = await call('PATCH', `/api/students/${s1}`, aTok, { email: newEmail });
  r.status === 200 && r.body?.student?.email === newEmail
    ? ok('email change -> 200 and the returned profile shows the new address')
    : no('email change -> ' + r.status + ' ' + JSON.stringify(r.body?.student?.email));
  // The LOGIN must have moved too, not just the profile copy — otherwise the
  // student signs in with the old address while the UI shows the new one.
  const authAfter = await supabaseAdmin.auth.admin.getUserById(s1);
  authAfter.data?.user?.email === newEmail
    ? ok('the Supabase auth login moved to the new address')
    : no('*** LOGIN STILL OLD: ' + authAfter.data?.user?.email + ' (profile/login desync)');
  const profRow = await many('select email from public.profiles where id=$1', [s1]);
  profRow[0]?.email === newEmail ? ok('profiles.email persisted') : no('profile email: ' + profRow[0]?.email);

  // Uniqueness: cannot take an address another account already uses.
  r = await call('PATCH', `/api/students/${s1}`, aTok, { email: `${TAG}-s3@codekrack.invalid` });
  r.status === 400 ? ok("changing to another account's email -> 400 (no collision)") : no('dupe email -> ' + r.status);
  // ...and the failed attempt left the login untouched (no half-applied change).
  const authUnchanged = await supabaseAdmin.auth.admin.getUserById(s1);
  authUnchanged.data?.user?.email === newEmail
    ? ok('rejected change did not move the login')
    : no('*** login moved despite 400: ' + authUnchanged.data?.user?.email);

  console.log('\n=== DASHBOARD / LEADERBOARD ===');
  r = await call('GET', '/api/dashboard/stats', aTok);
  r.body?.stats?.totalStudents === 2 ? ok('stats scoped: admin A sees 2 students') : no('stats: ' + JSON.stringify(r.body?.stats));
  Array.isArray(r.body?.recentActivity) && r.body.recentActivity.length === 7
    ? ok('recentActivity zero-filled to exactly 7 days (generate_series)') : no('activity days: ' + r.body?.recentActivity?.length);
  r.body?.stats?.platforms?.leetcode?.pending === 1 ? ok('per-platform scrape health: leetcode pending=1') : no('platforms: ' + JSON.stringify(r.body?.stats?.platforms?.leetcode));

  r = await call('GET', '/api/dashboard/stats', suTok);
  // >= : a super-admin's stats legitimately include any real students too.
  r.body?.stats?.totalStudents >= 3 ? ok(`super-admin stats span all institutions (${r.body.stats.totalStudents} >= our 3)`) : no('super stats: ' + r.body?.stats?.totalStudents);

  // Simulate a completed scrape so the leaderboard has something to sort.
  await query(
    `update public.platform_stats set status='completed', metric=250, last_updated=now(),
            data='{"username":"alphaone","totalSolved":250,"easySolved":100}'::jsonb
      where user_id=$1 and platform='leetcode'`, [s1]
  );
  r = await call('GET', '/api/dashboard/leaderboard?platform=leetcode', aTok);
  r.body?.leaderboard?.[0]?.metric === 250 ? ok('leaderboard sorts by the platform metric (250)') : no('board: ' + JSON.stringify(r.body?.leaderboard));
  r.body?.leaderboard?.length === 1 ? ok("only 'completed' scrapes appear (pending ones excluded, per Leaderboard.jsx:136)") : no('board len: ' + r.body?.leaderboard?.length);

  r = await call('GET', '/api/dashboard/stats', aTok);
  r.body?.stats?.totalSolvedProblems === 250
    ? ok('totalSolvedProblems = 250 — the stat that always read 0 under Firestore')
    : no('total solved: ' + r.body?.stats?.totalSolvedProblems);

  r = await call('GET', '/api/dashboard/leaderboard?platform=bogus', aTok);
  r.status === 400 ? ok('unknown platform -> 400') : no('bogus platform -> ' + r.status);

  console.log('\n=== SCRAPING STATUS ===');
  r = await call('GET', '/api/dashboard/scraping-status', aTok);
  (r.body?.statuses || []).length === 1 ? ok('scraping-status: 1 student in A has platform rows') : no('statuses: ' + (r.body?.statuses || []).length);
  r.body?.summary?.completed === 1 && r.body?.summary?.pending === 1
    ? ok('summary counts: completed=1 pending=1') : no('summary: ' + JSON.stringify(r.body?.summary));

  console.log('\n=== AUTHZ ON EVERY NEW ROUTE ===');
  for (const [m, p] of [['GET','/api/students'],['GET','/api/students/access'],['GET','/api/dashboard/stats'],['GET','/api/dashboard/scraping-status'],['GET','/api/institutions']]) {
    const un = await call(m, p, null);
    const bad = await call(m, p, 'garbage.token.here');
    un.status === 401 && bad.status === 401 ? ok(`${p} -> 401 unauthenticated + 401 bad token`) : no(`${p} -> ${un.status}/${bad.status}`);
  }
  r = await call('POST', '/api/institutions', aTok, { name: 'x', adminEmail: 'x@y.co', adminPassword: 'Password1!' });
  r.status === 403 ? ok('institution admin creating an institution -> 403 NOT_SUPERADMIN') : no('inst create by admin -> ' + r.status);

  console.log('\n=== DELETE (the orphaned-Auth-account fix) ===');
  r = await call('DELETE', `/api/students/${smuggled}`, aTok);
  r.status === 200 ? ok('delete student -> 200') : no('delete -> ' + r.status);
  const gone = await many('select id from public.profiles where id=$1', [smuggled]);
  gone.length === 0 ? ok('profile gone (cascaded from auth.users)') : no('profile survived');
  const { data: au } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  !au.users.find((u) => u.id === smuggled)
    ? ok('AUTH USER ALSO GONE — no orphaned login (the current app leaves these behind)')
    : no('*** auth user orphaned ***');

  // ===========================================================================
  // ARCHIVE + RESTORE (migration 007)
  //
  // This block used to assert the OPPOSITE — "student record SURVIVED with
  // institution_id=null" — and it was right about the code at the time. That
  // behaviour is the bug: `delete from institutions` let the FK null every
  // student's link, and nothing on a profile records which institution it was
  // in, so a re-added college could never reclaim them. It orphaned all 3
  // students on the production database.
  //
  // The assertion below is now the inverse and is the regression guard: if
  // anyone makes DELETE destructive again, `institution_id` goes null and this
  // fails loudly instead of quietly stranding students.
  // ===========================================================================
  console.log('\n=== ARCHIVE INSTITUTION: students KEEP their link ===');
  r = await call('DELETE', `/api/institutions/${instA}`, suTok);
  r.status === 200 && r.body.archived
    ? ok(`archive institution A -> 200 (${r.body.retainedStudents} student(s) retained)`)
    : no('archive inst -> ' + r.status + ' ' + JSON.stringify(r.body));

  const archivedRow = await many('select id, deleted_at from public.institutions where id=$1', [instA]);
  archivedRow.length === 1 && archivedRow[0].deleted_at !== null
    ? ok('institution ROW KEPT with deleted_at set — the FK never fires')
    : no('institution was hard-deleted: ' + JSON.stringify(archivedRow));

  const survivor = await many('select id, institution_id from public.profiles where id=$1', [s1]);
  survivor.length === 1 && survivor[0].institution_id === instA
    ? ok('student KEPT institution_id through the archive (nothing to re-map later)')
    : no('STUDENT WAS UNLINKED — this is the orphan bug: ' + JSON.stringify(survivor));

  r = await call('GET', '/api/institutions', suTok);
  !(r.body.institutions || []).some((i) => i.id === instA)
    ? ok('archived institution is hidden from the list')
    : no('archived institution still appears in the list');

  const adminGone = await many(`select id from public.profiles where email = '${TAG}-alpha@codekrack.invalid'`);
  adminGone.length === 0 ? ok("A's admin login removed with the institution") : no('admin login survived');

  console.log('\n=== RE-ADD THE SAME CODE: restores it, students come back ===');
  r = await call('POST', '/api/institutions', suTok, {
    name: `${TAG} Alpha College Reborn`, code: 'ZZALPHA',
    adminEmail: `${TAG}-alpha2@codekrack.invalid`,
    adminPassword: 'ZzAlpha#Admin2', adminName: 'Alpha Admin 2',
  });
  r.status === 201 && r.body.restored
    ? ok(`re-adding code ZZALPHA RESTORED it (${r.body.reclaimedStudents} student(s) reclaimed)`)
    : no('re-add did not restore -> ' + r.status + ' ' + JSON.stringify(r.body));
  r.body?.id === instA
    ? ok('restored the SAME uuid — which is why its students are still attached')
    : no(`minted a NEW uuid (${r.body?.id} vs ${instA}) — students would stay orphaned`);

  const reclaimed = await many('select institution_id from public.profiles where id=$1', [s1]);
  reclaimed[0]?.institution_id === instA
    ? ok('student is back in the institution, with no re-mapping step')
    : no('student not reclaimed: ' + JSON.stringify(reclaimed));

  const relisted = await call('GET', '/api/institutions', suTok);
  (relisted.body.institutions || []).some((i) => i.id === instA && i.name.includes('Reborn'))
    ? ok('institution is live again, renamed as typed on re-add')
    : no('restored institution missing from the list');

  console.log('\n=== the code is mandatory (it IS the identity) ===');
  r = await call('POST', '/api/institutions', suTok, {
    name: `${TAG} No Code College`, adminEmail: `${TAG}-nocode@codekrack.invalid`,
    adminPassword: 'ZzNoCode#Admin1',
  });
  r.status === 400 ? ok('creating an institution with no code -> 400') : no('no-code create -> ' + r.status);

  r = await call('POST', '/api/institutions', suTok, {
    name: `${TAG} Dupe College`, code: 'ZZBETA',
    adminEmail: `${TAG}-dupe@codekrack.invalid`, adminPassword: 'ZzDupe#Admin1',
  });
  r.status === 400 ? ok("reusing a LIVE institution's code -> 400") : no('dupe code -> ' + r.status);

} catch (e) {
  no('threw: ' + e.message + '\n' + e.stack?.split('\n')[1]);
} finally {
  await cleanup();
  const left = await many(`select id from public.profiles where email like '${TAG}%'`);
  const insts = await many(`select id from public.institutions where name like '${TAG}%'`);
  left.length === 0 && insts.length === 0 ? ok('\ncleanup: all test data removed') : no(`\ncleanup INCOMPLETE: ${left.length} profiles, ${insts.length} institutions`);
  await closePool();
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
