// backend/db/migrate.js
//
// Applies backend/db/migrations/*.sql in filename order, once each.
//
//   node db/migrate.js          apply pending migrations
//   node db/migrate.js --status show what's applied without changing anything
//
// Each file runs inside a transaction: a migration either lands completely or
// not at all, so a syntax error halfway down never leaves a half-built schema.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set in backend/.env');
  console.error('  Supabase dashboard -> Project Settings -> Database -> Connection string -> URI');
  console.error('  Use the SESSION POOLER (port 5432) — the direct db.<ref>.supabase.co host is IPv6-only.');
  process.exit(1);
}

// The most common setup failure, caught with a useful message rather than ENOTFOUND.
if (/@db\.[a-z0-9]+\.supabase\.co/.test(DATABASE_URL)) {
  console.error('✗ DATABASE_URL points at the direct connection host (db.<ref>.supabase.co).');
  console.error('  That host is IPv6-only and will not resolve from most machines.');
  console.error('  Use the Session pooler URI instead:');
  console.error('    postgresql://postgres.<ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres');
  process.exit(1);
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const run = async () => {
  await client.connect();

  await client.query(`
    create table if not exists public.schema_migrations (
      filename    text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    )
  `);

  const applied = new Map(
    (await client.query('select filename, checksum from public.schema_migrations')).rows.map(
      (r) => [r.filename, r.checksum]
    )
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (process.argv.includes('--status')) {
    console.log('\nMigration status:');
    for (const f of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      const was = applied.get(f);
      if (!was) console.log(`  PENDING  ${f}`);
      else if (was !== sha(sql)) console.log(`  CHANGED  ${f}  ← edited after being applied!`);
      else console.log(`  applied  ${f}`);
    }
    await client.end();
    return;
  }

  let ran = 0;
  for (const filename of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
    const checksum = sha(sql);
    const was = applied.get(filename);

    if (was === checksum) continue;
    if (was && was !== checksum) {
      // Editing an applied migration means the DB and the file disagree, and
      // re-running would not fix it. Demand a new migration instead.
      console.error(`✗ ${filename} was already applied but its contents changed.`);
      console.error('  Do not edit an applied migration — add a new one (002_*.sql).');
      process.exitCode = 1;
      break;
    }

    process.stdout.write(`→ ${filename} ... `);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        'insert into public.schema_migrations (filename, checksum) values ($1, $2)',
        [filename, checksum]
      );
      await client.query('commit');
      console.log('ok');
      ran++;
    } catch (e) {
      await client.query('rollback');
      console.log('FAILED (rolled back)');
      console.error(`\n  ${e.message}`);
      if (e.position) {
        const upto = sql.slice(0, Number(e.position));
        console.error(`  at line ${upto.split('\n').length}`);
      }
      process.exitCode = 1;
      break;
    }
  }

  if (ran === 0 && !process.exitCode) console.log('Nothing to do — schema is up to date.');
  await client.end();
};

run().catch((e) => {
  console.error('✗ ' + e.message);
  if (/ENOTFOUND|ENETUNREACH/.test(e.message)) {
    console.error('  → DNS/route failed. Use the Session pooler host (pooler.supabase.com).');
  }
  if (/password authentication failed/.test(e.message)) {
    console.error('  → Wrong password, or special characters need URL-encoding (@ -> %40).');
  }
  process.exit(1);
});
