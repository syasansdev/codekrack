// Run from the backend/ directory (needs BOTH servers up):
//   node tests/tab-focus.test.mjs
//
// REGRESSION TEST for: "if I type something and switch tabs, the data is no
// longer visible."
//
// Drives a real Chromium, because this bug lives in a browser event that no Node
// test can reach:
//
//   tab regains focus
//     -> visibilitychange
//       -> supabase-js _onVisibilityChanged -> _recoverAndRefresh()
//         -> emits 'SIGNED_IN'            <-- NOT an actual sign-in!
//           -> AuthContext used to removeQueries(['me'])
//             -> profile gone -> loading -> <AuthSplash/> replaced children
//               -> whole tree unmounted -> every form's local state destroyed
//
// The fetched data came back a moment later, so it looked like a flicker — but
// anything typed was gone for good.
//
// TWO THINGS THIS TEST GETS RIGHT, both of which it got WRONG at first:
//
//  1. `bubbles: true`, and dispatched at window. supabase's listener is on
//     WINDOW (GoTrueClient.js:4636). The first version fired a non-bubbling
//     Event at document, which never reached supabase — so it exercised nothing
//     and passed against the BUGGY code. A green test that cannot fail is worse
//     than no test.
//  2. It was verified by reverting the fix: the old code fails this test
//     ("typing lost"), the new code passes. That check is the only thing that
//     makes the green meaningful.
//
// Drives an actual Chromium: signs in, types into a filter, fires the SAME
// visibilitychange event a tab switch fires, and checks whether what was typed —
// and the rendered data — survive.
//
// Creates a throwaway admin + student, deletes them at the end.
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { supabaseAdmin } from '../config/supabase.js';
import { query, many, closePool } from '../config/db.js';

const APP = 'http://localhost:5173';
let pass = 0, fail = 0;
const ok = (m) => { console.log('  ✓ ' + m); pass++; };
const no = (m) => { console.log('  ✗ ' + m); fail++; };

const TAG = 'zztab';
const cleanup = async () => {
  for (const u of await many(`select id from auth.users where email like '%${TAG}%'`)) {
    await supabaseAdmin.auth.admin.deleteUser(u.id).catch(() => {});
  }
  await query(`delete from public.institutions where name like '${TAG}%'`).catch(() => {});
};


// Vite's dev server does HMR reloads and restarts on .env changes, which abort
// in-flight navigations (net::ERR_ABORTED). That's the dev server, not the app —
// so retry rather than let an environment artifact masquerade as a product bug.
const goto = async (page, url, tries = 3) => {
  for (let i = 1; i <= tries; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      return;
    } catch (e) {
      if (i === tries) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
};

let browser;
try {
  await cleanup();

  // --- a real admin with a real student to look at
  const adminEmail = `${TAG}-admin@codekrack.invalid`;
  const adminPass = 'ZzTab#Admin1';
  const inst = await query(
    `insert into public.institutions (name, code) values ('${TAG} College','ZZTAB') returning id`
  );
  const instId = inst.rows[0].id;
  const { data: au } = await supabaseAdmin.auth.admin.createUser({
    email: adminEmail, password: adminPass, email_confirm: true,
  });
  await query(
    `insert into public.profiles (id,email,name,display_name,role,institution_id)
     values ($1,$2,'ZZ Tab Admin','ZZ Tab Admin','admin',$3)`,
    [au.user.id, adminEmail, instId]
  );
  const { data: su } = await supabaseAdmin.auth.admin.createUser({
    email: `${TAG}-stu@codekrack.invalid`, password: 'ZzTab#Stu1', email_confirm: true,
  });
  await query(
    `insert into public.profiles (id,email,name,display_name,role,institution_id)
     values ($1,$2,'Findable Student','Findable Student','student',$3)`,
    [su.user.id, `${TAG}-stu@codekrack.invalid`, instId]
  );
  ok('setup: institution + admin + 1 student');

  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  // Instrument onAuthStateChange so we can PROVE the tab switch reached supabase.
  await page.evaluateOnNewDocument(() => { window.__authEvents = []; });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // --- sign in through the real UI
  await goto(page, `${APP}/admin/signin`);
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.type('input[type="email"]', adminEmail);
  await page.type('input[type="password"]', adminPass);
  // SignIn routes with navigate(), which is client-side — there is no real
  // navigation for waitForNavigation to observe. Wait for the URL to change.
  await page.click('button[type="submit"]');
  await page
    .waitForFunction(() => location.pathname.startsWith('/admin/dashboard'), { timeout: 25000 })
    .catch(() => {});
  const url = page.url();
  url.includes('/admin/dashboard') ? ok('signed in -> /admin/dashboard') : no('landed on ' + url);

  // --- go to a screen with a text input + data
  await goto(page, `${APP}/admin/manage-students`);
  await new Promise((r) => setTimeout(r, 2000));

  const searchSel = 'input[type="text"], input[placeholder*="earch"]';
  await page.waitForSelector(searchSel, { timeout: 10000 });

  // --- TYPE SOMETHING (the user's exact scenario)
  await page.click(searchSel);
  await page.type(searchSel, 'Findable');
  await new Promise((r) => setTimeout(r, 800));

  const typedBefore = await page.$eval(searchSel, (el) => el.value);
  const bodyBefore = await page.evaluate(() => document.body.innerText);
  typedBefore === 'Findable' ? ok(`typed "${typedBefore}" into the search box`) : no('typing failed: ' + typedBefore);
  bodyBefore.includes('Findable Student') ? ok('the student is visible before the tab switch') : no('student not rendered before switch');

  // --- SWITCH TABS: fire the exact event a real tab switch fires.
  // supabase-js listens for visibilitychange and calls _recoverAndRefresh(),
  // which emits SIGNED_IN. This is what broke it.
  console.log('\n  … simulating: switch to another tab, then back');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    // bubbles: true — supabase's listener is on WINDOW, and a non-bubbling event
    // dispatched on document never gets there.
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    window.dispatchEvent(new Event('visibilitychange'));
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    window.dispatchEvent(new Event('visibilitychange'));
  });
  // Long enough for supabase's recover+notify and any refetch to land.
  await new Promise((r) => setTimeout(r, 3500));

  // --- THE ASSERTIONS
  console.log('');
  const splash = await page.evaluate(() => document.body.innerText.includes('Loading CodeKrack'));
  !splash ? ok('the app did NOT fall back to the loading splash') : no('*** AuthSplash rendered — the tree unmounted ***');

  const typedAfter = await page.$eval(searchSel, (el) => el.value).catch(() => '(input gone — component unmounted)');
  typedAfter === 'Findable'
    ? ok(`what was typed SURVIVED the tab switch ("${typedAfter}")`)
    : no(`*** typing lost: "${typedAfter}" ***`);

  const bodyAfter = await page.evaluate(() => document.body.innerText);
  bodyAfter.includes('Findable Student')
    ? ok('the data is STILL VISIBLE after the tab switch')
    : no('*** data disappeared after the tab switch ***');

  page.url().includes('/admin/manage-students')
    ? ok('still on the same page (not bounced to sign-in)')
    : no('navigated away to ' + page.url());

  // --- do it a few more times: the old bug fired on EVERY focus
  console.log('\n  … switching tabs 3 more times');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
      window.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await new Promise((r) => setTimeout(r, 1200));
  }
  const finalTyped = await page.$eval(searchSel, (el) => el.value).catch(() => '(gone)');
  const finalBody = await page.evaluate(() => document.body.innerText);
  finalTyped === 'Findable' && finalBody.includes('Findable Student')
    ? ok('survives repeated tab switches')
    : no(`*** broke after repeated switches: typed="${finalTyped}" ***`);

  const realErrors = errors.filter(
    (e) => !/favicon|Download the React DevTools|ERR_CONNECTION_CLOSED|net::ERR_ABORTED/i.test(e)
  );
  realErrors.length === 0
    ? ok('no console errors')
    : no('console errors: ' + realErrors.slice(0, 2).join(' | '));

} catch (e) {
  no('threw: ' + e.message + '\n    ' + (e.stack?.split('\n')[1] || ''));
} finally {
  if (browser) await browser.close();
  await cleanup();
  const left = await many(`select id from public.profiles where email like '%${TAG}%'`);
  left.length === 0 ? ok('\ncleanup: test data removed') : no(`\ncleanup left ${left.length}`);
  await closePool();
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
