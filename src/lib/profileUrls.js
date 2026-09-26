// src/lib/profileUrls.js
//
// What counts as a valid profile link, per platform.
//
// THE RULE: a box is either empty, or it holds a full link to THAT platform.
// A bare username is rejected — "krishna123" is not a link, and the scraper
// cannot do anything with it. The message tells the student what to paste.
//
// WHY PER-PLATFORM AND NOT "IS IT A URL". The common mistake is not a typo, it
// is pasting the right link into the wrong box — a GitHub URL under LeetCode.
// A generic URL check accepts that happily, the row is stored, and the failure
// surfaces days later as a scrape marked 'failed' that nobody connects back to
// a form filled in last week. Checking the host is what catches it while the
// student is still looking at the field.
//
// The scheme is optional because every placeholder in the form shows the link
// without one ("leetcode.com/u/username"). Demanding https:// after promising
// otherwise would fail people for following the hint. The server prepends it.
//
// KEEP IN SYNC WITH backend/utils/profileUrls.js — the browser copy is for fast
// feedback, the server copy is the one that actually decides. They are separate
// files because the API and the SPA are separate deployments with no shared
// package; if you change a rule here, change it there in the same commit.

/** Human name + pattern + an example to show when the pattern fails. */
export const PROFILE_RULES = {
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
    // Both shapes are live: /profile/name is current, /name is the older one
    // still linked from plenty of student CVs.
    label: 'HackerRank',
    pattern: /^(https?:\/\/)?(www\.)?hackerrank\.com\/(profile\/)?[A-Za-z0-9_@-]+\/?$/i,
    example: 'hackerrank.com/profile/username',
  },
  hackerearth: {
    label: 'HackerEarth',
    pattern: /^(https?:\/\/)?(www\.)?hackerearth\.com\/(@|users\/)[A-Za-z0-9_.-]+\/?$/i,
    example: 'hackerearth.com/@username',
  },
  linkedin: {
    // The country subdomain (in.linkedin.com) is what LinkedIn hands Indian
    // users when they copy their own profile URL, so it has to be accepted.
    label: 'LinkedIn',
    pattern: /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?$/i,
    example: 'linkedin.com/in/username',
  },
  resume: {
    // A resume can live anywhere — Drive, Dropbox, a personal site. All that can
    // be checked is that it is a link and not a filename or a sentence.
    label: 'Resume',
    pattern: /^(https?:\/\/)?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(\/\S*)?$/,
    example: 'drive.google.com/file/d/...',
  },
};

/**
 * @returns {string|null} an error message to show under the field, or null when
 *   the value is acceptable. An EMPTY value is always acceptable — every one of
 *   these fields is optional.
 */
export const validateProfileUrl = (platform, value) => {
  const v = String(value ?? '').trim();
  if (!v) return null;

  const rule = PROFILE_RULES[platform];
  if (!rule) return null;

  if (rule.pattern.test(v)) return null;

  // Distinguish the two failures, because the fix is different for each.
  // "No dot in it at all" is almost always someone typing just their username.
  if (!/[./]/.test(v)) {
    return `Paste your full ${rule.label} link, e.g. ${rule.example}`;
  }
  return `This doesn't look like a ${rule.label} link. Expected ${rule.example}`;
};

/** Validate a whole { platform: url } map. Returns { [platform]: message }. */
export const validateProfileUrls = (platformUrls = {}) => {
  const errors = {};
  for (const [platform, value] of Object.entries(platformUrls)) {
    const message = validateProfileUrl(platform, value);
    if (message) errors[platform] = message;
  }
  return errors;
};

export default { PROFILE_RULES, validateProfileUrl, validateProfileUrls };
