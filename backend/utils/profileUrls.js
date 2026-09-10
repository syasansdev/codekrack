// backend/utils/profileUrls.js
//
// The authoritative version of "is this a valid profile link".
//
// src/lib/profileUrls.js holds the same rules for the browser, and that copy is
// only there to tell a student what is wrong while they are still looking at the
// field. It decides nothing: anyone can POST to /api/students/register with
// curl and skip it entirely. THIS file is what actually keeps rubbish out of
// platform_stats.
//
// KEEP THE TWO IN SYNC. They are separate files because the API (Fly) and the
// SPA (Vercel) are separate deployments with no shared package between them. If
// you change a rule, change it in both in the same commit — the failure mode of
// drifting is a link the form accepts and the server then rejects, which reads
// to the student as the form being broken.
//
// WHY THE HOST IS CHECKED, NOT JUST "IS IT A URL". The mistake people actually
// make is pasting the right link into the wrong box. A generic URL check accepts
// a GitHub URL under LeetCode, stores it, and the damage shows up days later as
// a scrape marked 'failed' that nobody traces back to a registration form.

const RULES = {
  leetcode: {
    label: 'LeetCode',
    pattern: /^(https?:\/\/)?(www\.)?leetcode\.com\/(u\/)?[A-Za-z0-9_-]+\/?$/i,
    example: 'leetcode.com/u/username',
  },
  github: {
    label: 'GitHub',
    pattern: /^(https?:\/\/)?(www\.)?github\.com\/[A-Za-z0-9_.-]+\/?$/i,
    example: 'github.com/username',
  },
  codeforces: {
    label: 'Codeforces',
    pattern: /^(https?:\/\/)?(www\.)?codeforces\.com\/profile\/[A-Za-z0-9_.-]+\/?$/i,
    example: 'codeforces.com/profile/username',
  },
  atcoder: {
    label: 'AtCoder',
    pattern: /^(https?:\/\/)?(www\.)?atcoder\.jp\/users\/[A-Za-z0-9_-]+\/?$/i,
    example: 'atcoder.jp/users/username',
  },
  hackerrank: {
    label: 'HackerRank',
    pattern: /^(https?:\/\/)?(www\.)?hackerrank\.com\/(profile\/)?[A-Za-z0-9_@-]+\/?$/i,
    example: 'hackerrank.com/profile/username',
  },
  linkedin: {
    label: 'LinkedIn',
    pattern: /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?$/i,
    example: 'linkedin.com/in/username',
  },
  resume: {
    label: 'Resume',
    pattern: /^(https?:\/\/)?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(\/\S*)?$/,
    example: 'drive.google.com/file/d/...',
  },
};

/**
 * @returns {string|null} a message safe to show the student, or null when the
 *   value is acceptable. An EMPTY value is acceptable — these fields are all
 *   optional, and requiring them would turn "I don't use AtCoder" into a
 *   registration failure.
 */
export const profileUrlError = (platform, value) => {
  const v = String(value ?? '').trim();
  if (!v) return null;

  const rule = RULES[platform];
  // An unknown key is not an error here — splitPlatformUrls() drops anything
  // outside its two lists, so it never reaches storage anyway.
  if (!rule) return null;

  if (rule.pattern.test(v)) return null;

  if (!/[./]/.test(v)) {
    return `Paste your full ${rule.label} link, e.g. ${rule.example}`;
  }
  return `That doesn't look like a ${rule.label} link. Expected ${rule.example}`;
};

/**
 * First error in a { platform: url } map, or null if every value is fine.
 * First rather than all: this feeds a single 400 message, and the browser copy
 * has already marked up every bad field for anyone using the actual form.
 */
export const firstProfileUrlError = (platformUrls = {}) => {
  if (!platformUrls || typeof platformUrls !== 'object') return null;
  for (const [platform, value] of Object.entries(platformUrls)) {
    const message = profileUrlError(platform, value);
    if (message) return message;
  }
  return null;
};

export default { profileUrlError, firstProfileUrlError };
