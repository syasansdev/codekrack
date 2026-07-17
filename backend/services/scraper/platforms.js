// backend/services/scraper/platforms.js
//
// Platform scrapers. Pure functions: give one a profile URL, get back that
// platform's numbers, or null if it couldn't be read.
//
// Moved here from functions/utils/scrapers.js when the Firebase Cloud Function
// was deleted. Two changes beyond the module system:
//   - node-fetch is gone; Node 18+ has fetch built in.
//   - formatScrapedData() is gone with it. It shaped results into Firestore's
//     platformData/scrapingStatus maps; Postgres has typed columns, so that
//     mapping now lives in backend/scripts/scrape.js next to the SQL.
//
// Principles kept from the original:
//   - Official / first-party APIs only. No CORS proxies (this is server-side).
//   - NEVER fabricate. On failure a scraper returns null and the caller keeps
//     the student's previous numbers rather than writing a zero.

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36';

// Extract a platform username from a profile URL.
const extractUsername = (url, pattern) => {
  if (!url) return '';
  const match = url.match(pattern);
  return match ? match[1] : url.split('/').filter(Boolean).pop();
};

const getCodeforcesRank = (rating) => {
  if (rating >= 2400) return 'International Grandmaster';
  if (rating >= 2300) return 'Grandmaster';
  if (rating >= 2100) return 'International Master';
  if (rating >= 1900) return 'Master';
  if (rating >= 1600) return 'Candidate Master';
  if (rating >= 1400) return 'Expert';
  if (rating >= 1200) return 'Specialist';
  if (rating >= 1000) return 'Pupil';
  return 'Newbie';
};

const getAtCoderRank = (rating) => {
  if (rating >= 2800) return 'Red';
  if (rating >= 2400) return 'Orange';
  if (rating >= 2000) return 'Yellow';
  if (rating >= 1600) return 'Blue';
  if (rating >= 1200) return 'Cyan';
  if (rating >= 800) return 'Green';
  if (rating >= 400) return 'Brown';
  return 'Gray';
};

/**
 * LeetCode — official public GraphQL endpoint. No API key required.
 * Reads the "All" bucket for total solved (never sum the difficulty rows, they
 * already include an "All" entry) and computes acceptance rate from submissions.
 */
const scrapeLeetCode = async (url) => {
  try {
    const username = extractUsername(url, /leetcode\.com\/(?:u\/)?([^/?]+)/);
    if (!username) return null;

    const query = `
      query getUserProfile($username: String!) {
        matchedUser(username: $username) {
          username
          profile { ranking reputation }
          submitStatsGlobal {
            acSubmissionNum { difficulty count }
            totalSubmissionNum { difficulty count }
          }
        }
      }`;

    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: `https://leetcode.com/${username}/`,
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ query, variables: { username } }),
    });

    if (!response.ok) {
      console.log(`LeetCode GraphQL HTTP ${response.status} for ${username}`);
      return null;
    }

    const json = await response.json();
    const user = json && json.data && json.data.matchedUser;
    if (!user || !user.submitStatsGlobal) {
      console.log(`LeetCode: user not found or private: ${username}`);
      return null;
    }

    const ac = user.submitStatsGlobal.acSubmissionNum || [];
    const totals = user.submitStatsGlobal.totalSubmissionNum || [];
    const countOf = (arr, difficulty) => {
      const entry = arr.find((x) => x.difficulty === difficulty);
      return entry ? entry.count : 0;
    };

    const totalSolved = countOf(ac, 'All');
    const totalSubmissions = countOf(totals, 'All');

    return {
      username: user.username,
      totalSolved,
      easySolved: countOf(ac, 'Easy'),
      mediumSolved: countOf(ac, 'Medium'),
      hardSolved: countOf(ac, 'Hard'),
      ranking: (user.profile && user.profile.ranking) || 0,
      reputation: (user.profile && user.profile.reputation) || 0,
      acceptanceRate:
        totalSubmissions > 0 ? Math.round((totalSolved / totalSubmissions) * 1000) / 10 : 0,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('LeetCode scraping error:', error.message);
    return null;
  }
};

/**
 * GitHub — official REST API. Set GH_API_TOKEN (or GITHUB_TOKEN) to raise the
 * rate limit from 60/hr (unauthenticated) to 5000/hr.
 */
const scrapeGitHub = async (url) => {
  try {
    const username = extractUsername(url, /github\.com\/([^/?]+)/);
    if (!username) return null;

    const headers = {
      'User-Agent': USER_AGENT,
      Accept: 'application/vnd.github.v3+json',
    };
    const token = process.env.GH_API_TOKEN || process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `token ${token}`;

    const userResponse = await fetch(`https://api.github.com/users/${username}`, { headers });
    if (!userResponse.ok) {
      if (userResponse.status === 403) {
        console.warn('GitHub API rate limit hit — set GH_API_TOKEN to raise it to 5000/hr');
      }
      return null;
    }
    const userData = await userResponse.json();

    // Sum stars/forks across the user's (first 100) repositories.
    let totalStars = 0;
    let totalForks = 0;
    const reposResponse = await fetch(
      `https://api.github.com/users/${username}/repos?per_page=100&sort=updated`,
      { headers }
    );
    if (reposResponse.ok) {
      const repos = await reposResponse.json();
      if (Array.isArray(repos)) {
        totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
        totalForks = repos.reduce((sum, r) => sum + (r.forks_count || 0), 0);
      }
    }

    return {
      username: userData.login,
      name: userData.name || '',
      repositories: userData.public_repos || 0,
      followers: userData.followers || 0,
      following: userData.following || 0,
      totalStars,
      totalForks,
      // Real contribution counts require the GitHub GraphQL contributionsCollection
      // API; left at 0 rather than fabricating an estimate.
      totalContributions: 0,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('GitHub scraping error:', error.message);
    return null;
  }
};

/**
 * Codeforces — official API. user.info for rating/rank, user.status to count
 * distinct problems with an accepted verdict.
 */
const scrapeCodeforces = async (url) => {
  try {
    const username = extractUsername(url, /codeforces\.com\/profile\/([^/?]+)/);
    if (!username) return null;

    const headers = { 'User-Agent': USER_AGENT };

    const infoRes = await fetch(
      `https://codeforces.com/api/user.info?handles=${username}`,
      { headers }
    );
    if (!infoRes.ok) return null;
    const infoJson = await infoRes.json();
    if (infoJson.status !== 'OK' || !infoJson.result || !infoJson.result[0]) return null;
    const user = infoJson.result[0];

    let problemsSolved = 0;
    try {
      const statusRes = await fetch(
        `https://codeforces.com/api/user.status?handle=${username}&from=1&count=10000`,
        { headers }
      );
      if (statusRes.ok) {
        const statusJson = await statusRes.json();
        if (statusJson.status === 'OK' && Array.isArray(statusJson.result)) {
          const solved = new Set();
          statusJson.result.forEach((sub) => {
            if (sub.verdict === 'OK' && sub.problem) {
              solved.add(`${sub.problem.contestId}-${sub.problem.index}`);
            }
          });
          problemsSolved = solved.size;
        }
      }
    } catch (subError) {
      console.warn('Codeforces submissions fetch failed:', subError.message);
    }

    return {
      username: user.handle,
      rating: user.rating || 0,
      maxRating: user.maxRating || 0,
      problemsSolved,
      rank: user.rank || 'unrated',
      maxRank: user.maxRank || 'unrated',
      contribution: user.contribution || 0,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Codeforces scraping error:', error.message);
    return null;
  }
};

/**
 * AtCoder — accepted-problem count from Kenkoooo, rating/contest history from
 * AtCoder's official history JSON. Both called directly (server-side).
 */
const scrapeAtCoder = async (url) => {
  try {
    const username = extractUsername(url, /atcoder\.jp\/users\/([^/?]+)/);
    if (!username) return null;

    const headers = { 'User-Agent': USER_AGENT };

    let problemsSolved = 0;
    const acRes = await fetch(
      `https://kenkoooo.com/atcoder/atcoder-api/v3/user/ac_rank?user=${encodeURIComponent(username)}`,
      { headers }
    );
    // Kenkoooo knows every AtCoder user who has ever submitted. A 404 here means
    // it has never seen this handle.
    let knownToKenkoooo = false;
    if (acRes.ok) {
      const acData = await acRes.json();
      problemsSolved = acData.count || 0;
      knownToKenkoooo = true;
    }

    let rating = 0;
    let maxRating = 0;
    let contestsParticipated = 0;
    let hasContestHistory = false;
    const histRes = await fetch(
      `https://atcoder.jp/users/${encodeURIComponent(username)}/history/json`,
      { headers }
    );
    if (histRes.ok) {
      const history = await histRes.json();
      if (Array.isArray(history) && history.length > 0) {
        hasContestHistory = true;
        const ratings = history
          .map((c) => (c.NewRating != null ? c.NewRating : c.newRating))
          .filter((r) => r != null);
        rating = ratings.length ? ratings[ratings.length - 1] : 0;
        maxRating = ratings.length ? Math.max(...ratings) : 0;
        contestsParticipated = history.length;
      }
    }

    // DOES THIS USER ACTUALLY EXIST?
    //
    // The previous check was `if (!acRes.ok && !histRes.ok) return null`, and it
    // never fired, because AtCoder answers HTTP 200 with a body of `[]` for a
    // handle that does not exist. So histRes.ok was true for ANY string, the
    // guard's && was never satisfied, and a typo'd username produced a perfectly
    // confident record of all zeros: problemsSolved 0, rating 0, rank "Gray".
    //
    // That is worse than a failure. It gets written as 'completed', it OVERWRITES
    // the student's real previous numbers with zeroes, and it puts a phantom 0 on
    // the leaderboard that is indistinguishable from a genuine beginner.
    //
    // Existence has to be positively evidenced, not assumed from a 200:
    //   - Kenkoooo returning 200 => it has submissions on record for this handle.
    //   - A non-empty contest history => they have competed.
    // Neither => we have no evidence the account is real, so we report failure and
    // keep whatever we already had.
    if (!knownToKenkoooo && !hasContestHistory) return null;

    return {
      username,
      rating,
      maxRating,
      highestRating: maxRating,
      contestsParticipated,
      problemsSolved,
      rank: getAtCoderRank(rating),
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('AtCoder scraping error:', error.message);
    return null;
  }
};

/**
 * Scrape every platform for one student. Platforms run in parallel; a slow or
 * failing platform can't block the others (Promise.allSettled + per-platform
 * 25s timeout).
 */
const scrapeAllPlatforms = async (platformUrls) => {
  const results = { leetcode: null, github: null, codeforces: null, atcoder: null };

  const scrapers = {
    leetcode: scrapeLeetCode,
    github: scrapeGitHub,
    codeforces: scrapeCodeforces,
    atcoder: scrapeAtCoder,
  };

  const tasks = Object.entries(platformUrls).map(async ([platform, url]) => {
    if (!url || !scrapers[platform]) return;
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after 25s for ${platform}`)), 25000)
      );
      results[platform] = await Promise.race([scrapers[platform](url), timeoutPromise]);
    } catch (error) {
      console.error(`Error scraping ${platform}:`, error.message);
      results[platform] = null; // never fabricate — keep existing data via formatScrapedData
    }
  });

  await Promise.allSettled(tasks);
  return results;
};

export {
  scrapeLeetCode,
  scrapeGitHub,
  scrapeCodeforces,
  scrapeAtCoder,
  scrapeAllPlatforms,
  getCodeforcesRank,
  getAtCoderRank,
};
