// backend/config/db.js
//
// Postgres access. Real SQL rather than PostgREST, because this app needs:
//   - joins            (institution admin lists, leaderboard + profile)
//   - aggregates       (dashboard stats in one round trip, not N)
//   - transactions     (profile + platform_stats rows land together or not at all)
//
// Connects via the Session pooler (port 5432), which is the right pooler for a
// long-lived Express process holding its own pool.
import 'dotenv/config';
import pg from 'pg';
import logger from '../utils/logger.js';

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL must be set in backend/.env.\n' +
      'Supabase dashboard -> Project Settings -> Database -> Connection string -> URI\n' +
      'Use the SESSION POOLER (port 5432).'
  );
}

if (/@db\.[a-z0-9]+\.supabase\.co/.test(DATABASE_URL)) {
  throw new Error(
    'DATABASE_URL points at the direct connection host (db.<ref>.supabase.co), which is\n' +
      'IPv6-only and will not resolve from most machines. Use the Session pooler URI:\n' +
      '  postgresql://postgres.<ref>:<password>@aws-<n>-<region>.pooler.supabase.com:5432/postgres'
  );
}

// Postgres numeric/int8 come back as strings by default (they can exceed JS's
// safe integer range). Every count and percentage in this app is small, and the
// frontend expects numbers — so parse them rather than shipping "12" to a chart.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => parseInt(v, 10));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => parseFloat(v));

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // A pooled connection died while idle. Not fatal — the pool replaces it.
  logger.error('Postgres idle client error:', err.message);
});

/** Run a query. Params are ALWAYS bound ($1, $2) — never interpolate into SQL. */
export const query = async (text, params) => {
  const started = Date.now();
  const res = await pool.query(text, params);
  const ms = Date.now() - started;
  if (ms > 500) logger.warn(`Slow query (${ms}ms): ${text.slice(0, 90).replace(/\s+/g, ' ')}`);
  return res;
};

/** First row, or null. */
export const one = async (text, params) => (await query(text, params)).rows[0] || null;

/** All rows. */
export const many = async (text, params) => (await query(text, params)).rows;

/**
 * Run fn inside a transaction. Commits on return, rolls back on throw.
 *   await tx(async (c) => { await c.query(...); await c.query(...); })
 */
export const tx = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
};

export const closePool = () => pool.end();

export default { pool, query, one, many, tx, closePool };
