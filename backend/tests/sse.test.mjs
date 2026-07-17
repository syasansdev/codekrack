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
// Proves the SSE pipeline end to end:
//   write to Postgres from THIS process (not Express)
//     -> trigger -> pg_notify -> Express's LISTEN connection
//       -> coalesced -> fanned out to the right SSE clients only.
// Also proves an institution admin never hears about another institution.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase.js';
import { query, one, many, closePool } from '../config/db.js';
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
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return data.session.access_token;
};

/** Minimal SSE client over fetch — the same mechanism fetch-event-source uses. */
const openStream = async (token, label) => {
  const ctrl = new AbortController();
  const res = await fetch(`${API}/api/events`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: ctrl.signal,
  });
  if (!res.ok) throw new Error(`${label} stream -> ${res.status}`);
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop();
        for (const chunk of chunks) {
          const ev = (chunk.match(/^event: (.+)$/m) || [])[1];
          const dt = (chunk.match(/^data: (.+)$/m) || [])[1];
          if (ev) events.push({ event: ev, data: dt ? JSON.parse(dt) : null });
          else if (chunk.startsWith(': ')) events.push({ event: 'ping' });
        }
      }
    } catch { /* aborted */ }
  })();
  return { events, close: () => ctrl.abort(), contentType: res.headers.get('content-type') };
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100); }
  return false;
};

const TAG = 'zzsse';
const cleanup = async () => {
  for (const r of await many(`select id from public.profiles where email like '${TAG}%'`)) {
    await supabaseAdmin.auth.admin.deleteUser(r.id).catch(() => {});
  }
  await query(`delete from public.institutions where name like '${TAG}%'`).catch(() => {});
};

let streams = [];
try {
  await cleanup();

  // --- setup: super-admin + two institutions with their admins
  const suEmail = `${TAG}-super@codekrack.invalid`;
  const { data: su } = await supabaseAdmin.auth.admin.createUser({
    email: suEmail, password: 'ZzSse#Super1', email_confirm: true,
  });
  await query(`insert into public.profiles (id,email,name,display_name,role) values ($1,$2,'ZZ','ZZ','superadmin')`, [su.user.id, suEmail]);
  const suTok = await signIn(suEmail, 'ZzSse#Super1');

  let r = await fetch(`${API}/api/institutions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${suTok}` },
    // `code` is required as of migration 007 — it is what a re-add matches to
    // restore an archived institution and reclaim its students. Without it this
    // POST 400s, the admin login is never created, and the signIn below fails
    // with a misleading "Invalid login credentials".
    body: JSON.stringify({ name: `${TAG} Alpha`, code: 'ZZSSEA', adminEmail: `${TAG}-a@codekrack.invalid`, adminPassword: 'ZzSse#Alpha1' }),
  });
  const instA = (await r.json()).id;
  r = await fetch(`${API}/api/institutions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${suTok}` },
    body: JSON.stringify({ name: `${TAG} Beta`, code: 'ZZSSEB', adminEmail: `${TAG}-b@codekrack.invalid`, adminPassword: 'ZzSse#Beta1' }),
  });
  const instB = (await r.json()).id;
  const aTok = await signIn(`${TAG}-a@codekrack.invalid`, 'ZzSse#Alpha1');
  const bTok = await signIn(`${TAG}-b@codekrack.invalid`, 'ZzSse#Beta1');
  ok('setup: super-admin + 2 institutions with admins');

  console.log('\n=== CONNECT ===');
  const unauth = await fetch(`${API}/api/events`);
  unauth.status === 401 ? ok('/api/events unauthenticated -> 401') : no('unauth -> ' + unauth.status);
  const badTok = await fetch(`${API}/api/events`, { headers: { Authorization: 'Bearer nope' } });
  badTok.status === 401 ? ok('/api/events bad token -> 401') : no('bad token -> ' + badTok.status);

  const sA = await openStream(aTok, 'A'); streams.push(sA);
  const sB = await openStream(bTok, 'B'); streams.push(sB);
  const sS = await openStream(suTok, 'super'); streams.push(sS);

  /text\/event-stream/.test(sA.contentType) ? ok('content-type: text/event-stream') : no('content-type: ' + sA.contentType);
  (await waitFor(() => sA.events.some((e) => e.event === 'connected')))
    ? ok('client A got the `connected` handshake') : no('no connected event');
  const conn = sA.events.find((e) => e.event === 'connected');
  conn?.data?.scopedTo === instA ? ok(`handshake reports server-side scope (${instA.slice(0,8)}…)`) : no('scopedTo: ' + conn?.data?.scopedTo);

  // Measure a DELTA: a real admin may have the app open in a browser, and those
  // are legitimate connections. Asserting an absolute count makes this test fail
  // whenever someone is actually using the product.
  const statsRes = await fetch(`${API}/api/events/stats`, { headers: { Authorization: `Bearer ${suTok}` } });
  const openNow = (await statsRes.json()).connections;
  openNow >= 3 ? ok(`server reports ${openNow} open stream(s), including our 3`) : no('connection count: ' + openNow);

  console.log('\n=== THE REAL TEST: a write from OUTSIDE Express reaches the browser ===');
  // Create a student in A, then write platform_stats directly with SQL — this
  // is exactly what the GitHub Actions scraper does, in its own process.
  const sr = await fetch(`${API}/api/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aTok}` },
    body: JSON.stringify({ name: 'SSE Student', email: `${TAG}-s1@codekrack.invalid`, platformUrls: { leetcode: 'leetcode.com/u/sse' } }),
  });
  const sid = (await sr.json()).uid;
  await wait(900); // let the create's own notifies settle
  sA.events.length = 0; sB.events.length = 0; sS.events.length = 0;

  // ↓ This bypasses Express entirely. Express only learns via pg_notify.
  await query(
    `update public.platform_stats set status='completed', metric=42, last_updated=now(),
       data='{"username":"sse","totalSolved":42}'::jsonb
     where user_id=$1 and platform='leetcode'`, [sid]
  );

  const gotA = await waitFor(() => sA.events.some((e) => e.event === 'invalidate'));
  gotA ? ok('scraper-style SQL write (outside Express) -> client A received `invalidate`') : no('*** client A got nothing — SSE pipeline broken ***');
  const inv = sA.events.find((e) => e.event === 'invalidate');
  inv?.data?.topics?.includes('platform_stats') ? ok(`event names the stale topic: ${JSON.stringify(inv.data.topics)}`) : no('topics: ' + JSON.stringify(inv?.data));
  // Check the payload's SHAPE, not a substring: the `at` timestamp is a 13-digit
  // number that can contain any short digit sequence by pure chance, which made
  // the first version of this assertion fail on a payload that was in fact clean.
  const keys = Object.keys(inv?.data || {}).sort().join(',');
  keys === 'at,topics'
    ? ok(`event carries only {topics, at} — no row data, just a signal to refetch`)
    : no('*** unexpected keys in SSE payload: ' + keys);

  console.log('\n=== SCOPING: B must not hear about A ===');
  await wait(700);
  !sB.events.some((e) => e.event === 'invalidate')
    ? ok("institution B heard NOTHING about A's change")
    : no("*** institution B was notified of A's data change ***");
  sS.events.some((e) => e.event === 'invalidate')
    ? ok('super-admin heard it (global scope)') : no('super-admin missed the event');

  console.log('\n=== COALESCING: a scrape burst must not flood the browser ===');
  sA.events.length = 0;
  const WRITES = 40;
  const COALESCE_MS = 400; // must match services/realtime.js
  const t0 = Date.now();
  // 40 rapid writes, like a scraper working through a batch.
  for (let i = 0; i < WRITES; i++) {
    await query(`update public.platform_stats set metric=$2 where user_id=$1 and platform='leetcode'`, [sid, 100 + i]);
  }
  const elapsed = Date.now() - t0;
  await wait(1500);
  const bursts = sA.events.filter((e) => e.event === 'invalidate').length;

  // Assert the PROPERTY, not a magic number.
  //
  // This used to assert `bursts <= 4`, which wasn't testing coalescing at all —
  // it was encoding an assumption about network latency. Coalescing collapses
  // whatever lands within each COALESCE_MS window, so the FLOOR on the event
  // count is set by how long the writes take, i.e. the round trip to the DB:
  //   fast link  (~30ms/write)  -> 40 writes in ~1.2s -> ~3 windows  -> ~3 events
  //   slow link  (~225ms/write) -> 40 writes in ~9s   -> ~23 windows -> ~7 events
  // Both are correct behaviour. The old assertion failed on the slow one, which
  // made it a test of the wifi rather than of the code.
  const windows = Math.ceil(elapsed / COALESCE_MS);
  const ceiling = windows + 2; // slack for window-boundary timing
  bursts > 0 && bursts <= ceiling && bursts < WRITES / 2
    ? ok(`${WRITES} writes over ${elapsed}ms (~${windows} x ${COALESCE_MS}ms windows) -> ${bursts} SSE event(s), not ${WRITES}`)
    : no(`coalescing failed: ${WRITES} writes over ${elapsed}ms -> ${bursts} events (expected 1..${ceiling})`);

  console.log('\n=== OTHER TOPICS ===');
  sA.events.length = 0; sS.events.length = 0;
  const delRes = await fetch(`${API}/api/students/${sid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${aTok}` } });
  delRes.status === 200
    ? ok('delete student -> 200 (this 500ed until 004: the trigger ran as supabase_auth_admin)')
    : no('delete -> ' + delRes.status + ' ' + JSON.stringify(await delRes.json()));
  await waitFor(() => sA.events.some((e) => e.event === 'invalidate'));
  const delEv = sA.events.find((e) => e.event === 'invalidate');
  delEv?.data?.topics?.includes('profiles') ? ok('deleting a student -> `profiles` invalidate') : no('delete topics: ' + JSON.stringify(delEv?.data?.topics));

  sS.events.length = 0;
  await query(`update public.institutions set name = $2 where id = $1`, [instB, `${TAG} Beta Renamed`]);
  await waitFor(() => sS.events.some((e) => e.event === 'invalidate'));
  sS.events.find((e) => e.event === 'invalidate')?.data?.topics?.includes('institutions')
    ? ok('renaming an institution -> `institutions` invalidate to super-admin') : no('institution topic missing');

  console.log('\n=== NOISE CONTROL ===');
  sA.events.length = 0;
  // updated_at churn on an admin's own row must not wake the leaderboards.
  await query(`update public.profiles set last_login_at = now() where email = $1`, [`${TAG}-a@codekrack.invalid`]);
  await wait(900);
  sA.events.filter((e) => e.event === 'invalidate').length === 0
    ? ok('last_login_at touch fired NO event (trigger filters no-op churn)')
    : no('*** noise: a login stamp woke every client ***');

  console.log('\n=== DISCONNECT ===');
  const beforeClose = (await (await fetch(`${API}/api/events/stats`, { headers: { Authorization: `Bearer ${suTok}` } })).json()).connections;
  sB.close();
  await wait(800);
  const afterClose = (await (await fetch(`${API}/api/events/stats`, { headers: { Authorization: `Bearer ${suTok}` } })).json()).connections;
  afterClose === beforeClose - 1
    ? ok(`closing a stream deregisters exactly that client (${beforeClose} -> ${afterClose})`)
    : no(`after close: ${beforeClose} -> ${afterClose}, expected ${beforeClose - 1}`);

} catch (e) {
  no('threw: ' + e.message + '\n    ' + (e.stack?.split('\n')[1] || ''));
} finally {
  for (const s of streams) { try { s.close(); } catch {} }
  await wait(300);
  await cleanup();
  const left = await many(`select id from public.profiles where email like '${TAG}%'`);
  left.length === 0 ? ok('\ncleanup: test data removed') : no(`\ncleanup left ${left.length} profiles`);
  await closePool();
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
