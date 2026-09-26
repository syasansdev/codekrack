// Run from the backend/ directory:  node tests/platforms.unit.test.mjs
//
// Unit tests for the HackerRank / HackerEarth scrapers, URL rules and metric
// mapping. Unlike the other suites here this one needs NO database, server or
// network: global fetch is replaced with a stub, and the response shapes below
// are the real ones captured from the live APIs (2026-09-26).
import {
  scrapeHackerRank,
  scrapeHackerEarth,
  parseHackerRankUsername,
  parseHackerEarthUsername,
} from '../services/scraper/platforms.js';
import { profileUrlError } from '../utils/profileUrls.js';
import { metricFor, PLATFORMS } from '../utils/serialize.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { console.log('  ✓ ' + name); pass++; }
  else { console.log('  ✗ ' + name); fail++; }
};

// --- fetch stub -------------------------------------------------------------
const realFetch = globalThis.fetch;
const calls = [];
const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (body instanceof Error) throw body;
    return body;
  },
});
// routes: array of [substring, response | () => response | Error]
const stubFetch = (routes) => {
  calls.length = 0;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    for (const [needle, res] of routes) {
      if (String(url).includes(needle)) {
        if (res instanceof Error) throw res;
        return typeof res === 'function' ? res() : res;
      }
    }
    throw new Error('unrouted fetch: ' + url);
  };
};

const silence = () => {
  const { log, error } = console;
  console.log = () => {}; console.error = () => {};
  return () => { console.log = log; console.error = error; };
};
// scrapers log on failure paths; keep test output readable
const quiet = async (fn) => { const un = silence(); try { return await fn(); } finally { un(); } };

try {
  // ===========================================================================
  console.log('\nHackerRank — URL parsing');
  check('profile/ form', parseHackerRankUsername('https://www.hackerrank.com/profile/kuldeep_singh') === 'kuldeep_singh');
  check('bare form', parseHackerRankUsername('hackerrank.com/kuldeep_singh') === 'kuldeep_singh');
  check('@ form', parseHackerRankUsername('https://www.hackerrank.com/@kuldeep_singh/') === 'kuldeep_singh');
  check('trailing slash + query', parseHackerRankUsername('https://hackerrank.com/profile/abc-1/?x=1') === 'abc-1');
  check('wrong host -> empty', parseHackerRankUsername('https://github.com/abc') === '');
  check('nested path -> empty', parseHackerRankUsername('https://www.hackerrank.com/domains/algorithms') === '');
  check('empty/null -> empty', parseHackerRankUsername('') === '' && parseHackerRankUsername(null) === '');

  console.log('\nHackerRank — URL validation (server rules)');
  check('accepts profile/ URL', profileUrlError('hackerrank', 'https://www.hackerrank.com/profile/kuldeep_singh') === null);
  check('accepts URL without scheme', profileUrlError('hackerrank', 'hackerrank.com/kuldeep_singh') === null);
  check('rejects GitHub URL', profileUrlError('hackerrank', 'https://github.com/abc') !== null);
  check('rejects HackerEarth URL', profileUrlError('hackerrank', 'https://www.hackerearth.com/@abc/') !== null);
  check('empty is allowed (optional field)', profileUrlError('hackerrank', '') === null);

  console.log('\nHackerRank — scraping');
  // real shape, trimmed: kuldeep_singh -> 8 + 1 + 1
  const badges = {
    status: true,
    models: [
      { badge_type: 'problem-solving', badge_name: 'Problem Solving', solved: 8, stars: 1, current_points: 71.0 },
      { badge_type: 'cpp', badge_name: 'C++', stars: 1, current_points: 10.0 },
      { badge_type: '30-days-of-code', badge_name: '30 Days of Code', solved: 1, stars: 0, current_points: 0 },
    ],
  };
  stubFetch([['/badges', reply(200, badges)]]);
  let r = await scrapeHackerRank('https://www.hackerrank.com/profile/kuldeep_singh');
  check('sums solved across badges (missing `solved` counts as 0)', r && r.problemsSolved === 9);
  check('keeps username + badge count', r && r.username === 'kuldeep_singh' && r.badgesCount === 3);
  check('calls the badges endpoint for that user', calls.length === 1 && calls[0].endsWith('/rest/hackers/kuldeep_singh/badges'));

  stubFetch([['/badges', reply(404, {})]]);
  r = await quiet(() => scrapeHackerRank('https://www.hackerrank.com/zzzznotauser98765'));
  check('404 -> null (not 0)', r === null);

  stubFetch([['/badges', reply(429, {})]]);
  check('HTTP 429 -> null', (await quiet(() => scrapeHackerRank('hackerrank.com/abc'))) === null);

  stubFetch([['/badges', reply(200, { status: false })]]);
  check('status:false / no models -> null', (await quiet(() => scrapeHackerRank('hackerrank.com/abc'))) === null);

  stubFetch([['/badges', reply(200, new SyntaxError('bad json'))]]);
  check('non-JSON body -> null', (await quiet(() => scrapeHackerRank('hackerrank.com/abc'))) === null);

  stubFetch([['/badges', new Error('ECONNRESET')]]);
  check('network error -> null', (await quiet(() => scrapeHackerRank('hackerrank.com/abc'))) === null);

  check('unparseable URL -> null, no request', await (async () => {
    stubFetch([]);
    const out = await scrapeHackerRank('https://leetcode.com/abc');
    return out === null && calls.length === 0;
  })());

  stubFetch([
    ['/badges', reply(200, { status: true, models: [] })],
    ['/contests/master/hackers/', reply(200, { model: { username: 'newbie' } })],
  ]);
  r = await scrapeHackerRank('hackerrank.com/newbie');
  check('no badges + profile exists -> verified 0', r && r.problemsSolved === 0);

  stubFetch([
    ['/badges', reply(200, { status: true, models: [] })],
    ['/contests/master/hackers/', reply(404, {})],
  ]);
  check('no badges + profile missing -> null', (await quiet(() => scrapeHackerRank('hackerrank.com/ghost'))) === null);

  // ===========================================================================
  console.log('\nHackerEarth — URL parsing');
  check('@ form', parseHackerEarthUsername('https://www.hackerearth.com/@vivek/') === 'vivek');
  check('@ form, no scheme/slash', parseHackerEarthUsername('hackerearth.com/@vivek') === 'vivek');
  check('users/ form', parseHackerEarthUsername('https://www.hackerearth.com/users/vivek/') === 'vivek');
  check('dots/dashes in name', parseHackerEarthUsername('hackerearth.com/@a.b-c_d') === 'a.b-c_d');
  check('query string ignored', parseHackerEarthUsername('hackerearth.com/@vivek/?tab=x') === 'vivek');
  check('missing @ -> empty', parseHackerEarthUsername('https://www.hackerearth.com/vivek') === '');
  check('non-profile page -> empty', parseHackerEarthUsername('https://www.hackerearth.com/practice/') === '');
  check('wrong host -> empty', parseHackerEarthUsername('https://hackerrank.com/@vivek') === '');

  console.log('\nHackerEarth — URL validation (server rules)');
  check('accepts @ URL', profileUrlError('hackerearth', 'https://www.hackerearth.com/@vivek/') === null);
  check('accepts URL without scheme', profileUrlError('hackerearth', 'hackerearth.com/@vivek') === null);
  check('accepts users/ URL', profileUrlError('hackerearth', 'hackerearth.com/users/vivek') === null);
  check('rejects HackerRank URL', profileUrlError('hackerearth', 'https://www.hackerrank.com/vivek') !== null);
  check('rejects non-profile HackerEarth page', profileUrlError('hackerearth', 'https://www.hackerearth.com/practice/') !== null);
  check('rejects bare word with helpful message', /full HackerEarth link/.test(profileUrlError('hackerearth', 'vivek') || ''));

  console.log('\nHackerEarth — scraping');
  // real shape: vivek
  stubFetch([['/metrics/', reply(200, { solutions_submitted: 637, problem_solved: 71, points: 14080, contest_rating: 0 })]]);
  r = await scrapeHackerEarth('https://www.hackerearth.com/@vivek/');
  check('extracts problem_solved', r && r.problemsSolved === 71 && r.username === 'vivek');
  check('calls the public metrics endpoint', calls.length === 1 && calls[0].endsWith('/api/community/user/profile/vivek/metrics/'));

  stubFetch([['/metrics/', reply(200, { solutions_submitted: 0, problem_solved: 0, points: 0, contest_rating: 0 })]]);
  r = await scrapeHackerEarth('hackerearth.com/@abhishek');
  check('genuine numeric 0 is kept as 0', r && r.problemsSolved === 0);

  stubFetch([['/metrics/', reply(200, { problem_solved: '42' })]]);
  r = await scrapeHackerEarth('hackerearth.com/@x');
  check('numeric string is coerced', r && r.problemsSolved === 42);

  stubFetch([['/metrics/', reply(404, {})]]);
  check('404 (unknown user) -> null', (await quiet(() => scrapeHackerEarth('hackerearth.com/@zzzznotauser98765'))) === null);

  stubFetch([['/metrics/', reply(403, { detail: 'Authentication credentials were not provided.' })]]);
  check('403 -> null', (await quiet(() => scrapeHackerEarth('hackerearth.com/@x'))) === null);

  stubFetch([['/metrics/', reply(200, { solutions_submitted: 3 })]]);
  check('problem_solved missing -> null (never 0)', (await quiet(() => scrapeHackerEarth('hackerearth.com/@x'))) === null);

  stubFetch([['/metrics/', reply(200, { problem_solved: null })]]);
  check('problem_solved null -> null', (await quiet(() => scrapeHackerEarth('hackerearth.com/@x'))) === null);

  stubFetch([['/metrics/', reply(200, { problem_solved: 'lots' })]]);
  check('problem_solved non-numeric -> null', (await quiet(() => scrapeHackerEarth('hackerearth.com/@x'))) === null);

  stubFetch([['/metrics/', reply(200, { problem_solved: -5 })]]);
  check('negative problem_solved -> null', (await quiet(() => scrapeHackerEarth('hackerearth.com/@x'))) === null);

  stubFetch([['/metrics/', reply(200, new SyntaxError('<html>'))]]);
  check('HTML/non-JSON body -> null', (await quiet(() => scrapeHackerEarth('hackerearth.com/@x'))) === null);

  stubFetch([['/metrics/', new Error('ETIMEDOUT')]]);
  check('network error -> null', (await quiet(() => scrapeHackerEarth('hackerearth.com/@x'))) === null);

  check('unparseable URL -> null, no request', await (async () => {
    stubFetch([]);
    const out = await scrapeHackerEarth('https://www.hackerearth.com/practice/');
    return out === null && calls.length === 0;
  })());

  // ===========================================================================
  console.log('\nIntegration points');
  check('both registered in PLATFORMS', PLATFORMS.includes('hackerrank') && PLATFORMS.includes('hackerearth'));
  check('metricFor(hackerrank) = problemsSolved', metricFor('hackerrank', { problemsSolved: 9 }) === 9);
  check('metricFor(hackerearth) = problemsSolved', metricFor('hackerearth', { problemsSolved: 71 }) === 71);
  check('metricFor(null data) = 0', metricFor('hackerearth', null) === 0);
  check('metricFor still correct for existing platforms',
    metricFor('leetcode', { totalSolved: 5 }) === 5 &&
    metricFor('github', { repositories: 7 }) === 7 &&
    metricFor('codeforces', { problemsSolved: 3 }) === 3 &&
    metricFor('atcoder', { problemsSolved: 4 }) === 4);
} finally {
  globalThis.fetch = realFetch;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
