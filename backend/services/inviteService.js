// backend/services/inviteService.js
//
// Sends the "set your password" email.
//
// WHY WE GENERATE THE LINK WITH SUPABASE BUT SEND IT OURSELVES:
// Supabase can email these for you, but its built-in SMTP is heavily rate
// limited and documented as unsuitable for production — it exists so a demo can
// send a couple of confirmation mails. Importing 200 students from a spreadsheet
// would blow through that limit in seconds and silently leave most of the class
// with no invite and no way in. So Supabase mints the link (it must — the token
// is signed by the auth server) and Nodemailer delivers it through the Gmail
// account already configured for contest notifications.
//
// WHAT THE LINK IS: a single-use recovery token. Following it signs the student
// in just long enough to choose a password. It expires (1h by default, set in
// the Supabase dashboard), and using it consumes it.
import { sendMail } from './mailer.js';
import { supabaseAdmin } from '../config/supabase.js';
import logger from '../utils/logger.js';

// FRONTEND_URL is where the set-password link points. Getting it wrong is a
// SILENT failure of the worst kind: every invite still "sends" successfully, and
// every student receives a link to a machine that isn't theirs. Nothing errors,
// invited_at gets stamped, the admin sees a green tick — and nobody can sign in.
//
// So in production, refuse to guess.
const FRONTEND_URL = (() => {
  const url = process.env.FRONTEND_URL;
  if (url) return url.replace(/\/+$/, ''); // trailing slash -> '//reset-password'
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FRONTEND_URL is not set. Invite emails would link to http://localhost:5173, ' +
        'which no student can open. Set it to your deployed frontend URL (and add ' +
        `that origin + '/reset-password' to Supabase -> Authentication -> URL Configuration).`
    );
  }
  logger.warn(
    'FRONTEND_URL not set — invite links will point at http://localhost:5173. ' +
      'Fine for local development; fatal in production.'
  );
  return 'http://localhost:5173';
})();

const RESET_PATH = '/reset-password';

/**
 * Mint a set-password link for an existing account.
 *
 * type 'recovery' rather than 'invite': `invite` is for addresses with no
 * account, and would fail here — we create the auth user first (so the profile
 * can reference its id) and then invite them to set a password on it.
 */
export const generateSetPasswordLink = async (email) => {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${FRONTEND_URL}${RESET_PATH}` },
  });
  if (error) throw new Error(`Could not generate set-password link: ${error.message}`);
  // action_link already carries the token and the redirect.
  return data.properties?.action_link || data.action_link;
};

const escapeHtml = (s) =>
  String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const inviteEmail = ({ name, link, isNew }) => {
  const heading = isNew ? 'Welcome to CodeKrack' : 'Set a new password';
  const intro = isNew
    ? 'Your CodeKrack account has been created. Choose a password to get started — your coding progress across LeetCode, GitHub, Codeforces and AtCoder will be tracked automatically.'
    : 'A password reset was requested for your CodeKrack account. Choose a new password below.';

  return {
    subject: isNew ? 'Set up your CodeKrack account' : 'Reset your CodeKrack password',
    // Plain text matters: it's the fallback when images/HTML are blocked, and
    // it keeps the mail out of spam folders that distrust HTML-only messages.
    text: `${heading}\n\nHi ${name || 'there'},\n\n${intro}\n\nSet your password:\n${link}\n\nThis link can only be used once and expires in 1 hour. If it has expired, ask your administrator to send another.\n\nIf you weren't expecting this email, you can ignore it.\n\n— CodeKrack, a product of Syasans (https://syasans.com)`,
    html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.08);">
        <tr><td style="background:linear-gradient(135deg,#2547eb,#ff6a13);padding:24px 28px;">
          <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-.02em;">CodeKrack</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">${escapeHtml(heading)}</h1>
          <p style="margin:0 0 8px;font-size:15px;color:#334155;">Hi ${escapeHtml(name || 'there')},</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">${escapeHtml(intro)}</p>
          <a href="${link}" style="display:inline-block;background:#ff6a13;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px;">Set your password</a>
          <p style="margin:24px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
            This link works once and expires in 1 hour. If it's expired, ask your administrator to send another.
          </p>
          <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;word-break:break-all;">
            Button not working? Paste this into your browser:<br>${escapeHtml(link)}
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #eef2f6;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            If you weren't expecting this email, you can safely ignore it.<br>
            CodeKrack — a product of <a href="https://syasans.com" style="color:#2547eb;text-decoration:none;">Syasans</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
};

/**
 * Generate a set-password link and email it.
 *
 * Throws if the mail can't be sent, so the caller can tell the admin "created,
 * but the email failed" rather than claiming success and leaving a student
 * stranded with an account they can't reach.
 */
export const sendSetPasswordEmail = async ({ email, name, isNew = true }) => {
  const link = await generateSetPasswordLink(email);
  const { subject, text, html } = inviteEmail({ name, link, isNew });

  await sendMail({ to: email, subject, text, html });

  // Never log the link itself: it IS the credential until it's used.
  logger.info(`Set-password email sent to ${email} (${isNew ? 'new account' : 'reset'})`);
  return true;
};

export default { sendSetPasswordEmail, generateSetPasswordLink };
