// backend/middleware/rateLimiter.js
//
// SEC-02. This file already existed and already worked — nothing imported it.
// express-rate-limit was installed, the limiter was written, and it was never
// wired into the app, so the whole API had no ceiling of any kind.
//
// TWO THINGS THAT MAKE RATE LIMITING GO WRONG, both handled here:
//
//  1. BEHIND A PROXY, EVERY REQUEST LOOKS LIKE ONE IP. On Render/Railway/Fly the
//     socket address is the load balancer's, so without `trust proxy` all users
//     share a single bucket and the 301st request from ANYONE is refused.
//     server.js sets `app.set('trust proxy', 1)` — exactly one hop. Not `true`:
//     blindly trusting the whole X-Forwarded-For chain lets a caller spoof their
//     own IP and evade the limit entirely.
//
//  2. SSE MUST BE EXEMPT. /api/events is a long-lived stream that reconnects on
//     a 3s backoff. During a backend restart one legitimate browser can burn
//     ~100 reconnects in five minutes and lock itself out of the very endpoint it
//     needs to recover. server.js mounts the limiter so it never sees /api/events.
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

/**
 * General API ceiling. 300 / 15 min ≈ 20 req/min sustained.
 *
 * Sized for how this app actually behaves rather than a round number: opening the
 * admin dashboard fires several requests, and clicking through students →
 * leaderboard → scraping-status comes in bursts. The original 100 would have
 * tripped during ordinary use — and a limiter that fires on legitimate traffic
 * gets switched off, after which you have none at all.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded: ${req.ip} ${req.method} ${req.originalUrl}`);
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again in a few minutes.',
      code: 'RATE_LIMITED',
    });
  },
});

/**
 * Strict ceiling for anything that SENDS EMAIL.
 *
 * Auth (SEC-01) stops anonymous abuse, but not a compromised or careless admin
 * session looping "send to everyone" — and each of those is N emails from a Gmail
 * account with a hard daily quota. Exceed it and the account is suspended: no
 * invites, no notifications, nothing, until Google lets it back.
 *
 * 5/hr is generous for a real workflow (the weekly send is a cron job, not a
 * human) and far below anything that could threaten the account's standing.
 */
export const emailSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Key on the authenticated user, not the IP. These routes sit behind
  // verifyAdmin so req.user exists — and a per-IP key would let one office of
  // admins exhaust each other's quota from a shared NAT address.
  keyGenerator: (req) => req.user?.uid || req.ip,
  handler: (req, res) => {
    logger.warn(`Email send limit exceeded: ${req.user?.email || req.ip} ${req.originalUrl}`);
    res.status(429).json({
      success: false,
      error: 'Too many email sends. Please wait an hour before trying again.',
      code: 'EMAIL_RATE_LIMITED',
    });
  },
});

export default apiLimiter;
