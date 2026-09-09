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

/**
 * Public student registration.
 *
 * This is the only unauthenticated write in the API, so it is the only endpoint
 * an anonymous caller can use to make the server do work: a DNS lookup, a
 * Supabase admin call and three inserts, per request. Three things it therefore
 * has to be sized against:
 *
 *   - account flooding. Every accepted request is a real auth user and a real
 *     student on somebody's leaderboard, and cleaning them up is manual.
 *   - email enumeration. "That email is already registered" is genuinely useful
 *     to a student who forgot they signed up, and genuinely useful to someone
 *     probing for addresses. A ceiling of 5/hr makes the second use worthless
 *     (a list of any size would take years) while never troubling the first.
 *   - Supabase's own admin API quota, which a loop here would otherwise spend.
 *
 * Keyed by IP because there is no authenticated identity to key on. A shared
 * campus NAT is the known cost: 5 students registering from one network in the
 * same hour is plausible, and the 6th is asked to wait. Sized up rather than
 * down for exactly that reason — the failure mode of a tighter limit is a
 * student who cannot sign up at all.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Every attempt counts, including the ones that fail. skipFailedRequests
  // would be the obvious kindness here and it is exactly wrong: a probe for
  // existing addresses gets back 409s, so not counting failures would hand an
  // enumerator an unlimited budget for the only request they care about.
  handler: (req, res) => {
    logger.warn(`Registration limit exceeded: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many registration attempts from this network. Please try again in an hour.',
      code: 'REGISTER_RATE_LIMITED',
    });
  },
});

export default apiLimiter;
