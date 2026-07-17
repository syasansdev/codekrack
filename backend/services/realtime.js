// backend/services/realtime.js
//
// The SSE hub. One dedicated Postgres LISTEN connection receives every relevant
// row change (fired by triggers — see 003_realtime_notify.sql), and fans it out
// to connected browsers as Server-Sent Events.
//
// Three things this file is careful about:
//
// 1. THE LISTEN CONNECTION IS NOT POOLED. A pooled client gets recycled back
//    into the pool and its LISTEN registration goes with it — the socket stays
//    open and the app looks fine, but notifications silently stop arriving.
//    This is a dedicated client that reconnects itself.
//
// 2. EVENTS ARE COALESCED. The scraper writes ~4 rows per student. A 1000-
//    student run would fire ~4000 notifies in a burst; forwarding each one
//    would hand every open browser 4000 refetches. We collapse a burst into at
//    most one event per topic per institution per COALESCE_MS.
//
// 3. FAN-OUT IS SCOPED. A client only hears about its own institution.
//    Super-admins hear everything. This mirrors the API's scoping rule — but it
//    is defence in depth, not the security boundary: the event carries no data,
//    so the worst a scoping slip here can do is cause a needless refetch, which
//    the API then answers with correctly-scoped data anyway.
import pg from 'pg';
import { NO_INSTITUTION } from '../middleware/supabaseAuth.js';
import logger from '../utils/logger.js';

const CHANNEL = 'codekrack';
const COALESCE_MS = 400;      // burst window; the eye can't see faster anyway
const HEARTBEAT_MS = 25_000;  // keep proxies/load balancers from idling us out
const RECONNECT_MS = 2_000;

/** Connected SSE clients. id -> { res, institutionId, isSuperAdmin, topics } */
const clients = new Map();
let nextClientId = 1;

/** Pending coalesced events: "topic|institutionId" -> { topic, institutionId } */
const pending = new Map();
let flushTimer = null;

let listenClient = null;
let shuttingDown = false;

// ---- fan-out ---------------------------------------------------------------

const shouldReceive = (client, institutionId) => {
  if (client.isSuperAdmin) return true;              // global view
  if (institutionId === null) return true;           // unscoped change (e.g. an
                                                     // unlinked student) — let
                                                     // everyone revalidate
  return client.institutionId === institutionId;
};

const send = (client, event, data) => {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    // Broken pipe: the browser vanished without a clean close.
    logger.debug?.(`SSE write failed for client ${client.id}: ${e.message}`);
    removeClient(client.id);
  }
};

const flush = () => {
  flushTimer = null;
  const batch = [...pending.values()];
  pending.clear();
  if (!batch.length || !clients.size) return;

  let delivered = 0;
  for (const client of clients.values()) {
    // Collapse to the distinct topics this client actually cares about, so a
    // burst touching one institution 400 times is one "refresh scraping" event.
    const topics = [
      ...new Set(
        batch.filter((b) => shouldReceive(client, b.institutionId)).map((b) => b.topic)
      ),
    ];
    if (!topics.length) continue;
    send(client, 'invalidate', { topics, at: Date.now() });
    delivered++;
  }
  if (delivered) {
    logger.debug?.(`SSE: ${batch.length} change(s) -> ${delivered} client(s)`);
  }
};

const enqueue = (topic, institutionId) => {
  pending.set(`${topic}|${institutionId ?? 'null'}`, { topic, institutionId: institutionId ?? null });
  if (!flushTimer) flushTimer = setTimeout(flush, COALESCE_MS);
};

// ---- the LISTEN connection -------------------------------------------------

const connectListener = async () => {
  if (shuttingDown) return;

  listenClient = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // A distinct application_name makes this connection identifiable in
    // pg_stat_activity when someone wonders what the extra connection is.
    application_name: 'codekrack-listener',
  });

  listenClient.on('error', (err) => {
    logger.error(`SSE listener connection error: ${err.message}`);
    // Do not rethrow: an idle-connection death must not take the server down.
    scheduleReconnect();
  });

  listenClient.on('notification', (msg) => {
    if (msg.channel !== CHANNEL) return;
    try {
      const { topic, institutionId } = JSON.parse(msg.payload);
      enqueue(topic, institutionId);
    } catch (e) {
      logger.warn(`SSE: unparseable notify payload: ${msg.payload}`);
    }
  });

  try {
    await listenClient.connect();
    await listenClient.query(`listen ${CHANNEL}`);
    logger.info(`SSE: listening on Postgres channel "${CHANNEL}"`);
  } catch (e) {
    logger.error(`SSE: could not start listener: ${e.message}`);
    scheduleReconnect();
  }
};

let reconnectTimer = null;
const scheduleReconnect = () => {
  if (shuttingDown || reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try { await listenClient?.end(); } catch { /* already dead */ }
    logger.info('SSE: reconnecting listener…');
    connectListener();
  }, RECONNECT_MS);
};

export const startRealtime = () => connectListener();

export const stopRealtime = async () => {
  shuttingDown = true;
  if (flushTimer) clearTimeout(flushTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  for (const c of clients.values()) {
    try { c.res.end(); } catch { /* already gone */ }
  }
  clients.clear();
  try { await listenClient?.end(); } catch { /* already dead */ }
};

// ---- client registry -------------------------------------------------------

const removeClient = (id) => {
  const c = clients.get(id);
  if (!c) return;
  clearInterval(c.heartbeat);
  clients.delete(id);
};

/**
 * Attach an SSE client. `user` is the resolved req.user, so scoping comes from
 * the verified profile — never from a query string.
 */
export const addClient = (req, res, user) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx buffers proxied responses by default, which would hold events back
    // until the buffer fills — i.e. break realtime in exactly the setup most
    // likely to be in front of this in production.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const id = nextClientId++;
  const client = {
    id,
    res,
    institutionId: user.isSuperAdmin ? null : user.institutionId || NO_INSTITUTION,
    isSuperAdmin: user.isSuperAdmin,
    heartbeat: null,
  };

  // A comment line is a valid SSE no-op. Without it, idle proxies and load
  // balancers close the connection after ~60s and the client reconnect-loops.
  client.heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { removeClient(id); }
  }, HEARTBEAT_MS);

  clients.set(id, client);
  send(client, 'connected', { clientId: id, scopedTo: client.institutionId });
  logger.info(`SSE: client ${id} connected (${user.email}, scope=${client.institutionId ?? 'all'}) — ${clients.size} open`);

  const bye = () => {
    removeClient(id);
    logger.info(`SSE: client ${id} disconnected — ${clients.size} open`);
  };
  req.on('close', bye);
  req.on('error', bye);
};

export const clientCount = () => clients.size;

/** Test hook: push a synthetic change without touching the database. */
export const _emitForTest = (topic, institutionId) => enqueue(topic, institutionId);

export default { startRealtime, stopRealtime, addClient, clientCount };
