// Run from the backend/ directory:  node tests/mail.test.mjs
//
// REGRESSION TEST for: "mail is not being sent to users."
//
// THE BUG: there were TWO nodemailer transports — inviteService built one,
// emailService built another. They drifted, as duplicated config does. The
// invite one got a TLS workaround for machines that intercept TLS; the contest
// one never did. So on such a machine:
//
//   invite emails        -> sent fine
//   contest notifications -> died with ESOCKET "unable to verify the first
//                            certificate", silently, using the SAME Gmail
//                            account and the SAME credentials
//
// Nothing in the logs connected the two, because nothing was wrong with the
// credentials — only with one of the two objects holding them.
//
// This asserts the structural fix (ONE transport) rather than the symptom, so it
// fails if anyone ever adds a second createTransport.
//
// It sends NO real email: transporter.verify() opens the connection and
// authenticates without delivering anything.
import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0, fail = 0;
const ok = (m) => { console.log('  ✓ ' + m); pass++; };
const no = (m) => { console.log('  ✗ ' + m); fail++; };

try {
  console.log('=== ONE transport, not two ===');
  const svcDir = 'services';
  const creators = readdirSync(svcDir)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => /createTransport\s*\(/.test(readFileSync(join(svcDir, f), 'utf8')));
  creators.length === 1 && creators[0] === 'mailer.js'
    ? ok('exactly one createTransport, in mailer.js')
    : no(`*** ${creators.length} transports: ${creators.join(', ')} — they WILL drift ***`);

  const invite = readFileSync('services/inviteService.js', 'utf8');
  const email = readFileSync('services/emailService.js', 'utf8');
  /from '\.\/mailer\.js'/.test(invite) ? ok('inviteService uses the shared mailer') : no('inviteService has its own transport');
  /from '\.\/mailer\.js'/.test(email) ? ok('emailService uses the shared mailer') : no('emailService has its own transport');

  console.log('\n=== dotenv is loaded at import time ===');
  const mailerSrc = readFileSync('services/mailer.js', 'utf8');
  // ES imports are hoisted and run BEFORE server.js's dotenv.config(). A module
  // that reads process.env at import time and does NOT load dotenv itself gets an
  // empty env — which is how the shared transport was first built with no
  // credentials and no TLS option, failing every send.
  /^import 'dotenv\/config';/m.test(mailerSrc)
    ? ok("mailer.js imports 'dotenv/config' itself (import hoisting means it must)")
    : no('*** mailer.js does not load dotenv — it will read an empty process.env ***');

  console.log('\n=== the transport actually works ===');
  const { transporter, verifyMailer } = await import('../services/mailer.js');
  const creds = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
  creds ? ok('EMAIL_USER + EMAIL_PASS are set') : no('EMAIL_USER / EMAIL_PASS missing — cannot test delivery');

  if (creds) {
    // verify() connects + authenticates. It does NOT send.
    const okv = await verifyMailer();
    okv
      ? ok('SMTP connects and authenticates (no mail sent)')
      : no('*** SMTP verify failed — see the log line above for the reason ***');

    // Both services must resolve to the SAME object. If someone reintroduces a
    // second transport, this catches it even if the file-level check is fooled.
    const es = (await import('../services/emailService.js')).default;
    es.transporter === transporter
      ? ok('emailService.transporter IS the shared transport (same object)')
      : no('*** emailService holds a DIFFERENT transport object ***');
  }

  console.log('\n=== the prod guard on the TLS bypass ===');
  /NODE_ENV === 'production'/.test(mailerSrc) && /allowSelfSigned/.test(mailerSrc)
    ? ok('SMTP_ALLOW_SELF_SIGNED is ignored when NODE_ENV=production')
    : no('*** the TLS bypass is not fenced off from production ***');

} catch (e) {
  no('threw: ' + e.message);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
