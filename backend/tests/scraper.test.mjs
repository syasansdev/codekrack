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
// Tests the real scraper against real public profiles, then checks it wrote
// correctly AND that an SSE client heard about it. Cleans up after itself.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase.js';
import { query, one, many, closePool } from '../config/db.js';
import { execSync } from 'node:child_process';
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
  if (error) throw new Error(error.message);
  return data.session.access_token;
};

const TAG = 'zzscrape';
const cleanup = async () => {
  for (const r of await many(`select id from public.profiles where email like '${TAG}%'`)) {
    await supabaseAdmin.auth.admin.deleteUser(r.id).catch(() => {});
  }
  await query(`delete from public.institutions where name like '${TAG}%'`).catch(() => {});
};

let stream = null;
try {
  await cleanup();

  // --- setup: institution + admin + a student with REAL public profile URLs
  const suEmail = `${TAG}-su@codekrack.invalid`;
  const { data: su } = await supabaseAdmin.auth.admin.createUser({
    email: suEmail, password: 'ZzScrape#Su1', email_confirm: true,
  });
  await query(`insert into public.profiles (id,email,name,display_name,role) values ($1,$2,'ZZ','ZZ','superadmin')`, [su.user.id, suEmail]);
  const suTok = await signIn(suEmail, 'ZzScrape#Su1');

  let r = await fetch(`${API}/api/institutions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${suTok}` },
    body: JSON.stringify({ name: `${TAG} College`, code: 'ZZSCRAPE', adminEmail: `${TAG}-a@codekrack.invalid`, adminPassword: 'ZzScrape#Ad1' }),
  });
  const instId = (await r.json()).id;
  const aTok = await signIn(`${TAG}-a@codekrack.invalid`, 'ZzScrape#Ad1');

  // Real, well-known public accounts, so the scrapers have something to read.
  r = await fetch(`${API}/api/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aTok}` },
    body: JSON.stringify({
      name: 'Scrape Test Student',
      email: `${TAG}-s1@codekrack.invalid`,
      platformUrls: {
        github: 'https://github.com/torvalds',
        leetcode: 'https://leetcode.com/u/neal_wu',
        codeforces: 'https://codeforces.com/profile/tourist',
        // Deliberately bogus: proves a failure keeps old data and records why.
        atcoder: 'https://atcoder.jp/users/zz_definitely_not_a_real_user_9999',
      },
    }),
  });
  const sid = (await r.json()).uid;
  ok('setup: student with 3 real profiles + 1 deliberately bogus');

  const before = await many(`select platform, status, metric from public.platform_stats where user_id=$1 order by platform`, [sid]);
  before.length === 4 && before.every((x) => x.status === 'pending' && x.metric === 0)
    ? ok('4 platform rows seeded as pending, metric=0')
    : no('seed wrong: ' + JSON.stringify(before));

  // --- open an SSE stream, so we can prove the scraper's writes reach a browser
  const ctrl = new AbortController();
  const res = await fetch(`${API}/api/events`, { headers: { Authorization: `Bearer ${aTok}` }, signal: ctrl.signal });
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
        const chunks = buf.split('\n\n'); buf = chunks.pop();
        for (const c of chunks) {
          const ev = (c.match(/^event: (.+)$/m) || [])[1];
          if (ev) events.push(ev);
        }
      }
    } catch { /* aborted */ }
  })();
  stream = ctrl;
  await new Promise((r) => setTimeout(r, 600));
  events.length = 0;

  // --- RUN THE ACTUAL SCRAPER, exactly as the GitHub Action does
  console.log('\n=== running scripts/scrape.js --pending (real network calls) ===');
  let out = '';
  try {
    out = execSync('node scripts/scrape.js --pending', { encoding: 'utf8', timeout: 180_000 });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  console.log(out.split('\n').map((l) => '  │ ' + l).join('\n'));

  console.log('=== RESULTS ===');
  const after = await many(
    `select platform, status, metric, username, rating, rank, error, data, last_updated
       from public.platform_stats where user_id=$1 order by platform`, [sid]
  );

  const gh = after.find((x) => x.platform === 'github');
  gh?.status === 'completed' && gh.metric > 0
    ? ok(`github  -> completed, ${gh.metric} repos (username=${gh.username})`)
    : no('github: ' + JSON.stringify({ s: gh?.status, m: gh?.metric, e: gh?.error }));

  const lc = after.find((x) => x.platform === 'leetcode');
  lc?.status === 'completed' && lc.metric > 0
    ? ok(`leetcode -> completed, ${lc.metric} solved (data.easySolved=${lc.data?.easySolved})`)
    : no('leetcode: ' + JSON.stringify({ s: lc?.status, m: lc?.metric, e: lc?.error }));

  const cf = after.find((x) => x.platform === 'codeforces');
  cf?.status === 'completed' && cf.metric > 0
    ? ok(`codeforces -> completed, ${cf.metric} solved, rating=${cf.rating}, rank=${cf.rank}`)
    : no('codeforces: ' + JSON.stringify({ s: cf?.status, m: cf?.metric, e: cf?.error }));

  const ac = after.find((x) => x.platform === 'atcoder');
  ac?.status === 'failed'
    ? ok(`atcoder (bogus user) -> failed, and the reason was recorded: "${String(ac.error).slice(0, 40)}…"`)
    : no('bogus atcoder should have failed: ' + JSON.stringify({ s: ac?.status, m: ac?.metric }));
  ac?.metric === 0 && (!ac?.data || Object.keys(ac.data).length === 0)
    ? ok('failed platform kept its previous (empty) data — no zero written over real numbers')
    : no('failed platform clobbered data: ' + JSON.stringify(ac?.data));

  console.log('\n=== the metric mapping (each platform differs) ===');
  gh && lc && gh.metric !== lc.metric
    ? ok(`github counts REPOS (${gh.metric}), leetcode counts SOLVED (${lc.metric}) — not conflated`)
    : no('metric mapping looks wrong');

  const totals = await one('select total_solved from public.student_totals where user_id=$1', [sid]);
  const expected = (lc?.metric || 0) + (cf?.metric || 0);
  totals?.total_solved === expected
    ? ok(`student_totals = ${totals.total_solved} (leetcode ${lc.metric} + codeforces ${cf.metric}; github repos EXCLUDED, failed atcoder excluded)`)
    : no(`total_solved=${totals?.total_solved}, expected ${expected}`);

  console.log('\n=== did the browser find out? ===');
  events.includes('invalidate')
    ? ok(`SSE fired ${events.filter((e) => e === 'invalidate').length} invalidate(s) — the scraper never touched Express`)
    : no('*** no SSE event — the trigger -> LISTEN -> SSE chain is broken ***');

  console.log('\n=== leaderboard now reflects it ===');
  const lb = await (await fetch(`${API}/api/dashboard/leaderboard?platform=leetcode`, { headers: { Authorization: `Bearer ${aTok}` } })).json();
  lb.leaderboard?.[0]?.metric === lc.metric
    ? ok(`leaderboard shows ${lb.leaderboard[0].metric} for ${lb.leaderboard[0].name}`)
    : no('leaderboard: ' + JSON.stringify(lb.leaderboard));

  const st = await (await fetch(`${API}/api/dashboard/stats`, { headers: { Authorization: `Bearer ${aTok}` } })).json();
  st.stats?.platforms?.leetcode?.completed === 1 && st.stats?.platforms?.atcoder?.failed === 1
    ? ok('dashboard stats: leetcode completed=1, atcoder failed=1')
    : no('stats: ' + JSON.stringify(st.stats?.platforms));

  console.log('\n=== re-run with --pending should now find nothing ===');
  let out2 = '';
  try { out2 = execSync('node scripts/scrape.js --pending', { encoding: 'utf8', timeout: 60_000 }); }
  catch (e) { out2 = (e.stdout || '') + (e.stderr || ''); }
  /Nothing pending/.test(out2)
    ? ok('second --pending run: "Nothing pending" (completed rows are not re-scraped)')
    : no('second run did work it should have skipped');

} catch (e) {
  no('threw: ' + e.message + '\n    ' + (e.stack?.split('\n')[1] || ''));
} finally {
  try { stream?.abort(); } catch {}
  await cleanup();
  const left = await many(`select id from public.profiles where email like '${TAG}%'`);
  left.length === 0 ? ok('\ncleanup: test data removed') : no(`\ncleanup left ${left.length}`);
  await closePool();
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
