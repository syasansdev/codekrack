// backend/scripts/scrape.js
//
// The scraper. Runs in GitHub Actions on a schedule; writes straight to Postgres.
//
//   node scripts/scrape.js              scrape every platform row that has a URL
//   node scripts/scrape.js --pending    only rows an admin queued (status='pending')
//   node scripts/scrape.js --limit 20   cap the number of rows (useful for a test run)
//   node scripts/scrape.js --dry-run    scrape and report, write nothing
//
// HOW THE UI STAYS LIVE WITHOUT THIS SCRIPT KNOWING ANYTHING ABOUT IT:
// every write below trips an AFTER trigger that fires pg_notify (003/004). The
// Express server holds a LISTEN connection, coalesces the burst, and pushes an
// SSE `invalidate` to admins scoped to that institution. This process never
// talks to Express — it just writes rows, and the database does the telling.
//
// WHAT CHANGED FROM THE FIRESTORE VERSION:
//   - Per-PLATFORM granularity. Firestore stored one document per student, so a
//     refresh of one platform meant scraping all four. platform_stats is keyed
//     (user_id, platform), so --pending scrapes exactly the rows an admin asked
//     for. Re-syncing one student's GitHub is one HTTP call, not four.
//   - Rows go 'in_progress' before work starts, so the Scraping Status screen
//     shows the batch advancing live rather than sitting still and then jumping.
//   - A failure keeps the previous numbers and records the reason in
//     platform_stats.error. It never writes a zero over real data.
import 'dotenv/config';
import pg from 'pg';
import {
  scrapeLeetCode,
  scrapeGitHub,
  scrapeCodeforces,
  scrapeAtCoder,
} from '../services/scraper/platforms.js';

const SCRAPERS = {
  leetcode: scrapeLeetCode,
  github: scrapeGitHub,
  codeforces: scrapeCodeforces,
  atcoder: scrapeAtCoder,
};

// The platform's headline number — the one both leaderboards sort by. Same
// mapping as utils/serialize.js metricFor(); note GitHub's is repositories,
// which is why the column is called `metric` and not `problems_solved`.
const metricFor = (platform, data) => {
  if (!data) return 0;
  switch (platform) {
    case 'leetcode':   return Number(data.totalSolved) || 0;
    case 'github':     return Number(data.repositories) || 0;
    case 'codeforces': return Number(data.problemsSolved) || 0;
    case 'atcoder':    return Number(data.problemsSolved) || 0;
    default:           return 0;
  }
};

const args = process.argv.slice(2);
const ONLY_PENDING = args.includes('--pending');
const DRY_RUN = args.includes('--dry-run');
const LIMIT = (() => {
  const i = args.indexOf('--limit');
  return i !== -1 && args[i + 1] ? parseInt(args[i + 1], 10) : null;
})();

// One student at a time, with a pause between them. Each student's platforms run
// in parallel (4 requests), so this is ~4 concurrent requests at peak — polite
// enough that LeetCode/Codeforces/AtCoder won't start refusing us. The GitHub
// token raises that limit to 5000/hr; the others have no token to offer.
const DELAY_BETWEEN_STUDENTS_MS = 1500;
const LONG_BREAK_EVERY = 50;
const LONG_BREAK_MS = 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set.');
  console.error('  In GitHub Actions this comes from the DATABASE_URL repository secret.');
  process.exit(1);
}

const db = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  application_name: 'codekrack-scraper',
});

const run = async () => {
  const startedAt = Date.now();
  console.log('CodeKrack scraper');
  console.log(`  mode:        ${ONLY_PENDING ? 'pending only' : 'all rows with a URL'}${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`  GitHub token: ${process.env.GH_API_TOKEN || process.env.GITHUB_TOKEN ? 'set (5000 req/hr)' : 'MISSING — GitHub limited to 60 req/hr'}`);

  await db.connect();

  // One row per (student, platform) that actually has a URL to scrape.
  const { rows } = await db.query(
    `select ps.id, ps.user_id, ps.platform, ps.profile_url, ps.status,
            p.name, p.email
       from public.platform_stats ps
       join public.profiles p on p.id = ps.user_id
      where p.role = 'student'
        and ps.profile_url <> ''
        ${ONLY_PENDING ? "and ps.status = 'pending'" : ''}
      order by
        -- Pending first: someone is waiting on those.
        case when ps.status = 'pending' then 0 else 1 end,
        -- Then oldest-scraped first, so a run that gets cut short still makes
        -- progress on the most stale data instead of redoing the freshest.
        ps.last_updated asc nulls first
      ${LIMIT ? `limit ${LIMIT}` : ''}`
  );

  if (!rows.length) {
    console.log(ONLY_PENDING ? '\nNothing pending. Done.' : '\nNo platform URLs to scrape. Done.');
    await db.end();
    return;
  }

  // Group by student so we can do their platforms together and pace per person.
  const byStudent = new Map();
  for (const r of rows) {
    if (!byStudent.has(r.user_id)) {
      byStudent.set(r.user_id, { name: r.name || r.email, rows: [] });
    }
    byStudent.get(r.user_id).rows.push(r);
  }

  console.log(`\n${rows.length} platform row(s) across ${byStudent.size} student(s)\n`);

  let done = 0;
  let ok = 0;
  let failed = 0;
  let studentIndex = 0;

  for (const [userId, student] of byStudent) {
    studentIndex++;
    const label = `[${studentIndex}/${byStudent.size}] ${student.name}`;

    if (!DRY_RUN) {
      // Flip to in_progress BEFORE the work, so the Scraping Status screen shows
      // this student lighting up as the batch reaches them.
      await db.query(
        `update public.platform_stats set status = 'in_progress' where id = any($1::uuid[])`,
        [student.rows.map((r) => r.id)]
      );
    }

    // A student's platforms are independent — run them together.
    const results = await Promise.all(
      student.rows.map(async (row) => {
        const scraper = SCRAPERS[row.platform];
        if (!scraper) return { row, data: null, error: `no scraper for ${row.platform}` };
        try {
          // A hung platform must not stall the whole run.
          const data = await Promise.race([
            scraper(row.profile_url),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 30s')), 30_000)),
          ]);
          return { row, data, error: data ? null : 'no data returned (user not found, private, or API refused)' };
        } catch (e) {
          return { row, data: null, error: e.message };
        }
      })
    );

    for (const { row, data, error } of results) {
      done++;
      if (data) {
        ok++;
        const metric = metricFor(row.platform, data);
        console.log(`  ${label} ${row.platform.padEnd(10)} ok      ${metric}`);
        if (!DRY_RUN) {
          await db.query(
            `update public.platform_stats
                set status = 'completed',
                    username = $2,
                    metric = $3,
                    rating = $4,
                    max_rating = $5,
                    rank = $6,
                    data = $7::jsonb,
                    error = null,
                    last_updated = now(),
                    last_attempt_at = now()
              where id = $1`,
            [
              row.id,
              data.username || '',
              metric,
              Number(data.rating) || 0,
              Number(data.maxRating) || 0,
              data.rank || '',
              JSON.stringify(data),
            ]
          );
        }
      } else {
        failed++;
        console.log(`  ${label} ${row.platform.padEnd(10)} FAILED  ${error}`);
        if (!DRY_RUN) {
          // Mark it failed and say why — but do NOT touch metric/data/username.
          // The student's last known-good numbers survive a bad API day, which
          // is the whole reason the scrapers return null instead of zeroes.
          await db.query(
            `update public.platform_stats
                set status = 'failed', error = $2, last_attempt_at = now()
              where id = $1`,
            [row.id, String(error).slice(0, 500)]
          );
        }
      }
    }

    if (studentIndex < byStudent.size) {
      if (studentIndex % LONG_BREAK_EVERY === 0) {
        console.log(`\n  … ${studentIndex} students done, pausing ${LONG_BREAK_MS / 1000}s to let rate limits recover\n`);
        await sleep(LONG_BREAK_MS);
      } else {
        await sleep(DELAY_BETWEEN_STUDENTS_MS);
      }
    }
  }

  const secs = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\nDone in ${secs}s — ${done} row(s): ${ok} ok, ${failed} failed`);
  if (DRY_RUN) console.log('(dry run — nothing was written)');

  await db.end();

  // A run where EVERY row failed means something systemic (creds, network, an
  // API-wide block), not a few private profiles. Fail the Action so it's visible
  // rather than quietly reporting success while data goes stale.
  if (!DRY_RUN && done > 0 && ok === 0) {
    console.error('\n✗ Every row failed — this looks systemic, not per-student.');
    process.exit(1);
  }
};

run().catch(async (e) => {
  console.error('\n✗ Scraper crashed:', e.message);
  if (/ENOTFOUND|ENETUNREACH/.test(e.message)) {
    console.error('  → DATABASE_URL must use the Session pooler host (*.pooler.supabase.com:5432).');
  }
  await db.end().catch(() => {});
  process.exit(1);
});
