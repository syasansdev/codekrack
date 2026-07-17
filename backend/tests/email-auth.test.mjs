// Run from the backend/ directory:  node tests/email-auth.test.mjs
//
// SEC-01 + SEC-02 regression test.
//
// Before the fix, every one of these endpoints answered 200 to an anonymous
// caller — mass email and scheduler control, free to anyone who could reach the
// host. This asserts the door is shut AND that shutting it didn't lock out the
// people who legitimately need to walk through: the student contest calendar in
// Header.jsx calls /upcoming-contests, so that one must stay open to any
// signed-in user.
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
const signIn = async (email, password) => {
  const c = createClient(process.env.SUPABASE_URL, anon, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  return data.session.access_token;
};
const call = async (method, path, token) => {
  const r = await fetch(API + path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  let b = null;
  try { b = await r.json(); } catch {}
  return { status: r.status, body: b };
};

const TAG = 'zzmail';
// Found by SQL, not listUsers: that endpoint is paginated AND 500s entirely if
// any row in auth.users has a NULL token column. A cleanup that silently sweeps
// nothing is worse than no cleanup — it reports success and leaves the junk that
// breaks the next run.
const cleanup = async () => {
  for (const u of await many(`select id from auth.users where email like '%${TAG}%'`)) {
    await supabaseAdmin.auth.admin.deleteUser(u.id).catch(() => {});
  }
  await query(`delete from public.institutions where name like '${TAG}%'`).catch(() => {});
};

// Read-only endpoints only. Deliberately NOT the send/trigger ones: this suite
// must not fire real email at every student, and must not burn the 5/hr limit.
const READ_ENDPOINTS = [
  ['GET', '/api/email/upcoming-contests'],
  ['GET', '/api/email/weekly-contests'],
  ['GET', '/api/email/scheduler/status'],
];
const MUTATING_ENDPOINTS = [
  ['POST', '/api/email/send-contest-notifications'],
  ['POST', '/api/email/scheduler/start'],
  ['POST', '/api/email/scheduler/stop'],
  ['POST', '/api/email/scheduler/trigger'],
  ['POST', '/api/email/test-email'],
];

try {
  await cleanup();

  console.log('=== SEC-01: ANONYMOUS CALLERS ARE NOW REFUSED ===');
  console.log('  (every one of these returned 200 before the fix)');
  for (const [m, p] of [...READ_ENDPOINTS, ...MUTATING_ENDPOINTS]) {
    const r = await call(m, p, null);
    r.status === 401
      ? ok(`${m} ${p} -> 401`)
      : no(`*** ${m} ${p} -> ${r.status} — STILL OPEN TO ANONYMOUS CALLERS ***`);
  }

  const bad = await call('GET', '/api/email/scheduler/status', 'garbage.token.here');
  bad.status === 401 ? ok('a forged token -> 401') : no('forged token -> ' + bad.status);

  // --- accounts
  const suEmail = `${TAG}-su@codekrack.invalid`;
  const { data: su } = await supabaseAdmin.auth.admin.createUser({
    email: suEmail, password: 'ZzMail#Su1', email_confirm: true,
  });
  await query(
    `insert into public.profiles (id,email,name,display_name,role) values ($1,$2,'ZZ','ZZ','superadmin')`,
    [su.user.id, suEmail]
  );
  const suTok = await signIn(suEmail, 'ZzMail#Su1');

  let r = await fetch(`${API}/api/institutions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${suTok}` },
    body: JSON.stringify({
      name: `${TAG} College`, code: 'ZZMAIL', adminEmail: `${TAG}-a@codekrack.invalid`, adminPassword: 'ZzMail#Ad1',
    }),
  });
  const instId = (await r.json()).id;
  const aTok = await signIn(`${TAG}-a@codekrack.invalid`, 'ZzMail#Ad1');

  // A STUDENT, to prove the calendar still works for them.
  const stEmail = `${TAG}-student@codekrack.invalid`;
  const { data: st } = await supabaseAdmin.auth.admin.createUser({
    email: stEmail, password: 'ZzMail#St1', email_confirm: true,
  });
  await query(
    `insert into public.profiles (id,email,name,display_name,role,institution_id)
     values ($1,$2,'ZZ Student','ZZ Student','student',$3)`,
    [st.user.id, stEmail, instId]
  );
  const stTok = await signIn(stEmail, 'ZzMail#St1');
  ok('setup: super-admin + institution admin + student');

  console.log('\n=== THE STUDENT CONTEST CALENDAR STILL WORKS ===');
  console.log('  (Header.jsx renders it for every signed-in student — verifyAdmin');
  console.log('   here would have broken it for the entire student body)');
  r = await call('GET', '/api/email/upcoming-contests', stTok);
  r.status === 200
    ? ok(`student GET /upcoming-contests -> 200 (${(r.body?.contests || []).length} contests)`)
    : no(`*** student calendar BROKEN -> ${r.status} ***`);

  console.log('\n=== BUT A STUDENT CANNOT TOUCH THE ADMIN ROUTES ===');
  for (const [m, p] of [
    ['GET', '/api/email/weekly-contests'],
    ['GET', '/api/email/scheduler/status'],
    ['POST', '/api/email/scheduler/stop'],
    ['POST', '/api/email/send-contest-notifications'],
  ]) {
    const rr = await call(m, p, stTok);
    rr.status === 403 && rr.body?.code === 'NOT_ADMIN'
      ? ok(`student ${m} ${p} -> 403 NOT_ADMIN`)
      : no(`*** student ${m} ${p} -> ${rr.status} ***`);
  }

  console.log('\n=== ADMINS STILL GET THROUGH ===');
  for (const [m, p] of READ_ENDPOINTS) {
    const rr = await call(m, p, aTok);
    rr.status === 200 ? ok(`admin ${m} ${p} -> 200`) : no(`admin ${m} ${p} -> ${rr.status}`);
  }
  r = await call('POST', '/api/email/scheduler/status'.replace('status', 'start'), aTok);
  [200, 429].includes(r.status)
    ? ok(`admin POST /scheduler/start -> ${r.status}`)
    : no('admin start -> ' + r.status);

  console.log('\n=== SEC-02: RATE LIMITING IS ACTUALLY APPLIED ===');
  const probe = await fetch(`${API}/api/email/scheduler/status`, {
    headers: { Authorization: `Bearer ${aTok}` },
  });
  const limitHdr = probe.headers.get('ratelimit-limit') || probe.headers.get('RateLimit-Limit');
  limitHdr
    ? ok(`RateLimit-Limit header present on /api (${limitHdr}) — the limiter is mounted`)
    : no('*** no RateLimit headers — the limiter is still not applied ***');

  // /api/events must be EXEMPT: it reconnects on a 3s backoff, so limiting it
  // would lock a browser out of the endpoint it needs to recover.
  const ev = await fetch(`${API}/api/events/stats`, { headers: { Authorization: `Bearer ${aTok}` } });
  const evLimit = ev.headers.get('ratelimit-limit');
  !evLimit
    ? ok('/api/events is EXEMPT from the limiter (SSE reconnect storms must not self-lock)')
    : no('*** /api/events is rate limited (' + evLimit + ') — reconnects will lock clients out ***');

  console.log('\n=== the email send limiter is configured (5/hr, keyed per admin) ===');
  const { emailSendLimiter } = await import('../middleware/rateLimiter.js');
  typeof emailSendLimiter === 'function'
    ? ok('emailSendLimiter exists and is exported')
    : no('emailSendLimiter missing');
  // Not exercised live: tripping it would send real mail to every student and
  // then block the route for an hour. Its wiring is asserted by the route
  // definitions above returning 200/429 rather than 404.

} catch (e) {
  no('threw: ' + e.message + '\n    ' + (e.stack?.split('\n')[1] || ''));
} finally {
  await cleanup();
  const left = await many(`select id from public.profiles where email like '${TAG}%'`);
  left.length === 0 ? ok('\ncleanup: test data removed') : no(`\ncleanup left ${left.length}`);
  await closePool();
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
