// backend/utils/email.js
//
// Email helpers shared by the routes that create accounts (students and
// institution admins). Both used to define isValidEmail inline and normalise
// addresses by hand, which is how a trailing space slips through in one place
// and not another.
//
// Two DIFFERENT questions live here, and keeping them separate matters:
//
//   isValidEmail(e)              — does it LOOK like an address? (syntax, offline)
//   undeliverableDomainReason(e) — can its DOMAIN receive mail at all? (DNS)
//
// Neither can tell you the MAILBOX exists — only the receiving server knows
// that, and it says so as a 550 at send time (surfaced by services/mailer.js).
// So a "correct" address can still bounce; these two checks catch the mistakes
// that are knowable BEFORE sending, and the enriched 550 catches the rest.
import { promises as dns } from 'node:dns';

/** Syntactic check only. Identical to the regex the two routes each had inline. */
export const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));

/**
 * Trim and lowercase. A trailing space or a capitalised domain is invisible in
 * a form field, and produces a value the receiving server won't match — one of
 * the quiet ways an address that "looks correct" bounces 550 5.1.1. Do this
 * BEFORE validating, so " Asha@Gmail.com " is accepted rather than rejected.
 */
export const normalizeEmail = (e) => String(e || '').trim().toLowerCase();

const domainOf = (email) => String(email).split('@')[1] || '';

// Never let a slow or unreachable resolver hang account creation. If DNS doesn't
// answer in time we ALLOW the address — a deliverability check must not become a
// new way for creation to fail.
const withTimeout = (promise, ms = 3000) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), ms))]);

/**
 * A human-readable reason if the address's DOMAIN definitively cannot receive
 * mail, or null if it can — OR if we can't tell (DNS hiccup): uncertainty must
 * never block creating a student.
 *
 * What this CATCHES: a mistyped domain — @gmial.com, @gmai.co, @sjce.edu.i — the
 * kind that resolves to nothing.
 *
 * What this does NOT catch, deliberately and unavoidably:
 *   - a typo in the LOCAL part of a real domain (asha vs. ahsa @gmail.com). Only
 *     Gmail knows its own mailboxes; that surfaces as the enriched 550.
 *   - a real domain with an MX that still has no such mailbox (e.g. edu.com,
 *     whose MX is an Amazon SES catch-all). MX presence ≠ mailbox existence.
 * So this is a cheap first net, not a guarantee. mailer.js is the backstop.
 */
// RFC 6761 / 2606 special-use TLDs: reserved and guaranteed non-resolvable, used
// for tests, examples and local dev. They are not typos to catch — a real
// mistyped address is @gmail.con or a truncated TLD, never @x.invalid. Exempting
// them keeps the test suite (which uses the .invalid TLD precisely because it can
// never reach a real inbox) working, and costs nothing in real typo detection.
const RESERVED_TLDS = ['.invalid', '.test', '.example', '.localhost'];
const isReservedDomain = (domain) =>
  domain === 'localhost' || RESERVED_TLDS.some((t) => domain.endsWith(t));

export const undeliverableDomainReason = async (email) => {
  const domain = domainOf(email);
  if (!domain) return 'That email address has no domain.';
  if (isReservedDomain(domain)) return null; // special-use, not a typo — don't block

  let mx;
  try {
    mx = await withTimeout(dns.resolveMx(domain));
  } catch (e) {
    if (e.code === 'ENOTFOUND') return `The domain "${domain}" doesn't exist — check for a typo.`;
    if (e.code !== 'ENODATA') return null; // SERVFAIL / network — don't block on infra
    mx = []; // ENODATA: domain resolves but has no MX; fall through to the A-record check
  }
  if (mx === 'TIMEOUT') return null;
  if (Array.isArray(mx) && mx.length) return null; // has mail servers → deliverable

  // No MX record. RFC 5321 permits mail to fall back to the domain's A record,
  // so only reject if the domain has no address at all.
  let a;
  try {
    a = await withTimeout(dns.resolve(domain));
  } catch (e) {
    if (e.code === 'ENOTFOUND' || e.code === 'ENODATA')
      return `The domain "${domain}" can't receive email — check for a typo.`;
    return null;
  }
  if (a === 'TIMEOUT') return null;
  if (Array.isArray(a) && a.length) return null;
  return `The domain "${domain}" has no mail server — check for a typo.`;
};

export default { isValidEmail, normalizeEmail, undeliverableDomainReason };
