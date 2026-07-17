// backend/routes/eventsRoutes.js
//
// GET /api/events — the Server-Sent Events stream that keeps the leaderboard
// and scraping-status screens live without polling.
//
// This route is authenticated with the SAME verifyToken middleware as every
// other route, because the client connects with @microsoft/fetch-event-source
// rather than the browser's native EventSource. That matters: native
// EventSource cannot send an Authorization header, and the usual workaround —
// putting the JWT in the query string — writes access tokens into server logs,
// proxy logs and browser history. A ~5KB client dependency buys us a stream
// that is authenticated exactly like the rest of the API.
//
// Events emitted:
//   connected  { clientId, scopedTo }        once, on connect
//   invalidate { topics: [...], at }         a coalesced change signal
//   : ping                                   heartbeat comment, every 25s
//
// `invalidate` carries NO row data — only which topics went stale. The client
// answers it by refetching through the normal, scoped API.
import express from 'express';
import { verifyToken } from '../middleware/supabaseAuth.js';
import { addClient, clientCount } from '../services/realtime.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.get('/', verifyToken, (req, res) => {
  // Node buffers small writes by default; SSE needs each event on the wire
  // immediately or "realtime" arrives in clumps.
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);
  // An SSE connection is deliberately long-lived. Without this, Node's default
  // request timeout would tear it down mid-stream.
  req.socket.setTimeout(0);
  res.setTimeout?.(0);

  try {
    addClient(req, res, req.user);
  } catch (e) {
    logger.error('SSE attach failed:', e);
    if (!res.headersSent) res.status(500).json({ success: false, error: e.message });
  }
});

/** Ops visibility: how many streams are open right now. */
router.get('/stats', verifyToken, (req, res) => {
  res.json({ success: true, connections: clientCount() });
});

export default router;
