// backend/services/mailer.js
//
// THE mail transport. One, shared by everything that sends email.
//
// WHY THIS FILE EXISTS: there used to be two independent transporters —
// inviteService.js and emailService.js each built their own. They drifted, as
// duplicated config always does: the invite one got a TLS workaround for
// intercepted networks and the contest one didn't. The result was a system where
// invite emails sent perfectly and contest notifications failed silently with
// "unable to verify the first certificate", using the same account and the same
// credentials. Nothing in the logs connected the two.
//
// One transport cannot disagree with itself.
//
// `import 'dotenv/config'` FIRST, and it is load-bearing. ES module imports are
// hoisted and evaluated before ANY statement in the importing module — including
// server.js's own dotenv.config(). Without this line, everything below reads an
// empty process.env: no credentials, and SMTP_ALLOW_SELF_SIGNED invisible, so the
// transport is built broken and every send fails with "unable to verify the first
// certificate". config/db.js and config/supabase.js do the same, for the same
// reason. Any module that reads process.env at import time must load dotenv itself.
import 'dotenv/config';
import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// SMTP_ALLOW_SELF_SIGNED — a development escape hatch, fenced off from prod.
//
// Some machines (corporate proxies, antivirus with HTTPS scanning — Kaspersky,
// ESET, BitDefender) intercept TLS and re-sign it with their own root. Node does
// not trust that root, so every outgoing mail dies with ESOCKET "unable to
// verify the first certificate", and the app looks broken through no fault of
// its own.
//
// This disables certificate verification for outgoing mail. That is a real
// downgrade: an invite link IS a credential, so someone able to MITM the SMTP
// connection could read one and take over the account. It is therefore:
//   - opt-in, per machine, via the env var
//   - IGNORED when NODE_ENV=production, unconditionally
//   - loud at boot, so it can't quietly become the norm
//
// The actual fix is NODE_EXTRA_CA_CERTS=/path/to/your-proxy-ca.pem, which keeps
// verification ON and just teaches Node about the intercepting root.
// ---------------------------------------------------------------------------
const isProduction = process.env.NODE_ENV === 'production';
const allowSelfSigned = process.env.SMTP_ALLOW_SELF_SIGNED === 'true' && !isProduction;

if (process.env.SMTP_ALLOW_SELF_SIGNED === 'true' && isProduction) {
  logger.warn(
    'SMTP_ALLOW_SELF_SIGNED is set but NODE_ENV=production — IGNORING it. ' +
      'Outgoing mail certificates will be verified. If mail fails in production, ' +
      'fix the certificate chain (NODE_EXTRA_CA_CERTS); do not disable verification.'
  );
}
if (allowSelfSigned) {
  logger.warn(
    'SMTP_ALLOW_SELF_SIGNED is ON — TLS certificates are NOT verified for outgoing mail. ' +
      'Development only (this machine intercepts TLS). Invite links are credentials; ' +
      'the real fix is NODE_EXTRA_CA_CERTS=/path/to/proxy-ca.pem.'
  );
}

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  // Not fatal: the app is perfectly usable without mail, and refusing to boot
  // would be a worse failure than degraded invites. But say so once, clearly —
  // the alternative is silence and a support ticket about missing emails.
  logger.warn(
    'EMAIL_USER / EMAIL_PASS are not set — invite and contest emails will fail. ' +
      'Use a Gmail App Password (Google Account -> Security -> 2-Step Verification -> App passwords).'
  );
}

export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  ...(allowSelfSigned ? { tls: { rejectUnauthorized: false } } : {}),
});

export const MAIL_FROM = `"CodeKrack" <${process.env.EMAIL_USER}>`;

/**
 * Send one message. Thin wrapper so every caller logs the same way and nobody
 * has to remember the `from`.
 *
 * Throws on failure — deliberately. A caller that wants to tolerate a mail
 * outage should catch it and say so (POST /api/students does exactly this:
 * `invited: false`), rather than have this pretend it worked.
 */
// Turn a nodemailer send failure into a message that names the culprit.
//
// A raw 550 arrives as e.message = "Message failed: 550 5.1.1 ..." with the
// actual bounced address buried in e.rejected. The admin then sees "email
// failed" and swears the address is right. Rewriting the message to lead with
// the exact recipient and the SMTP reason turns that into "asha@gmail.com
// rejected: 550 5.1.1 no such mailbox" — the whole diagnosis, in the toast.
//
// The original error object is preserved (responseCode, rejected, stack) and
// only enriched, so nothing downstream that inspects those fields breaks.
const enrichSendError = (err, fallbackTo) => {
  const recipient = err.rejected?.length ? err.rejected.join(', ') : fallbackTo;
  const smtp = err.response || err.message || 'unknown SMTP error';
  err.recipient = recipient;
  err.smtpResponse = err.response || null;
  err.message = `Delivery to ${recipient} failed: ${smtp}`;
  logger.error(`Mail to ${recipient} rejected (${err.responseCode ?? 'no SMTP code'}): ${smtp}`);
  return err;
};

export const sendMail = async ({ to, subject, text, html }) => {
  let info;
  try {
    info = await transporter.sendMail({ from: MAIL_FROM, to, subject, text, html });
  } catch (err) {
    // The receiving server refused the whole transaction. For a @gmail.com
    // recipient Gmail validates at submission time, so a typo'd gmail bounces
    // synchronously right here rather than as a delayed bounce email.
    throw enrichSendError(err, to);
  }

  // Some servers ACCEPT the message and then reject individual recipients
  // instead of failing the transaction — nodemailer resolves, with the refused
  // addresses in info.rejected. For a single-recipient invite that is still a
  // failure: do not stamp invited_at and tell the admin it worked when the one
  // person it was for got nothing.
  if (info.rejected?.length) {
    const err = new Error('recipient rejected');
    err.rejected = info.rejected;
    err.response = info.response;
    err.responseCode = info.rejectedErrors?.[0]?.responseCode;
    throw enrichSendError(err, to);
  }

  logger.info(`Mail sent to ${to}: ${subject} (${info.response?.split(' ')[0] || 'ok'})`);
  return info;
};

/**
 * Check SMTP is reachable and the credentials work, without sending anything.
 * Called at boot so a broken mail setup is visible immediately, rather than
 * discovered later by a student who never got their invite.
 */
export const verifyMailer = async () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return false;
  try {
    await transporter.verify();
    logger.info(`Mail transport ready (${process.env.EMAIL_USER})`);
    return true;
  } catch (e) {
    logger.error(`Mail transport NOT working: ${e.message}`);
    if (/unable to verify the first certificate|self.signed/i.test(e.message)) {
      logger.error(
        '  This machine intercepts TLS (antivirus/corporate proxy). Fix it properly with ' +
          'NODE_EXTRA_CA_CERTS=/path/to/proxy-ca.pem, or for local dev only set ' +
          'SMTP_ALLOW_SELF_SIGNED=true in backend/.env'
      );
    }
    if (/Invalid login|BadCredentials|535/i.test(e.message)) {
      logger.error(
        '  Gmail rejected the credentials. EMAIL_PASS must be an App Password, not the ' +
          'account password (Google Account -> Security -> App passwords).'
      );
    }
    return false;
  }
};

export default { transporter, sendMail, verifyMailer, MAIL_FROM };
