import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useRescrapeStudent } from '../hooks/queries/useStudents';
import { validatePlatformData, sanitizeStudentData, calculateTotalProblems, formatLastUpdated } from '../utils/dataValidation';
import EditStudentModal from './EditStudentModal';

// --- Animation & Utility Hooks ---

const useCountUp = (end, duration = 1500) => {
  const [count, setCount] = useState(0);
  const frameRate = 1000 / 60;
  const totalFrames = Math.round(duration / frameRate);

  useEffect(() => {
    let frame = 0;
    const counter = setInterval(() => {
      frame++;
      const progress = (frame / totalFrames) ** 2;
      const currentCount = Math.round(end * progress);
      setCount(currentCount);

      if (frame === totalFrames) {
        clearInterval(counter);
        setCount(end);
      }
    }, frameRate);

    return () => clearInterval(counter);
  }, [end, duration, totalFrames, frameRate]);

  return count;
};

// --- Icon Components ---

const PlatformIcon = ({ platform }) => {
  const icons = {
    leetcode: (
      <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 transition transform hover:scale-110 duration-300">
        <path fillRule="evenodd" clipRule="evenodd" d="M13.483 4.243a1.5 1.5 0 00-2.966 0l-5.733 9.93a1.5 1.5 0 001.299 2.251h11.466a1.5 1.5 0 001.299-2.251l-5.733-9.93zM12 11.25l-2.932 5.078h5.864L12 11.25z" fill="#FBBF24"></path>
      </svg>
    ),
    codeforces: (
      <svg viewBox="0 0 256 256" className="h-8 w-8 transition transform hover:scale-110 duration-300">
        <rect width="256" height="256" fill="none"/>
        <circle cx="128" cy="128" r="96" fill="none" stroke="#4B5563" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
        <circle cx="128" cy="128" r="32" fill="none" stroke="#4B5563" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
        <line x1="160" y1="128" x2="224" y2="128" fill="none" stroke="#4B5563" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
        <line x1="32" y1="128" x2="96" y2="128" fill="none" stroke="#4B5563" strokeLinecap="round" strokeLinejoin="round" strokeWidth="16"/>
      </svg>
    ),
    atcoder: (
      <svg viewBox="0 0 256 256" fill="#374151" className="h-8 w-8 transition transform hover:scale-110 duration-300">
        <path d="M188.6,188.6a8,8,0,0,1,0,11.3l-50.06,50.06a8,8,0,0,1-11.32,0L77.17,199.9a8,8,0,0,1,0-11.3L121.28,144.5a8,8,0,0,1,11.32,0ZM162,176a8,8,0,0,0-11.31-11.31L135.37,179.94a8,8,0,0,0,11.31,11.31Z"></path>
        <path d="M128,24a104,104,0,1,0,104,104A104.11,104.11,0,0,0,128,216Z"></path>
      </svg>
    ),
    github: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 text-gray-800 transition transform hover:scale-110 duration-300">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path>
      </svg>
    ),
  };
  return icons[platform] || null;
};

// --- Helper UI Components ---

const StatItem = ({ label, value }) => (
  <div className="flex justify-between items-center py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors duration-200">
    <dt className="text-sm text-slate-500">{label}</dt>
    <dd className="text-base font-semibold text-slate-800 tracking-tight">{value}</dd>
  </div>
);
  
const LeetCodeDifficultyStats = ({ easy, medium, hard }) => (
  <div className="grid grid-cols-3 gap-3 mt-3 text-center">
    <div className="bg-green-50 border border-green-200 rounded-lg p-2 transition-transform duration-300 transform hover:scale-105 hover:shadow-md">
      <p className="text-xs font-medium text-green-800">Easy</p>
      <p className="font-bold text-green-700 text-2xl tracking-tighter">{easy}</p>
    </div>
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 transition-transform duration-300 transform hover:scale-105 hover:shadow-md">
      <p className="text-xs font-medium text-yellow-800">Medium</p>
      <p className="font-bold text-yellow-700 text-2xl tracking-tighter">{medium}</p>
    </div>
    <div className="bg-red-50 border border-red-200 rounded-lg p-2 transition-transform duration-300 transform hover:scale-105 hover:shadow-md">
      <p className="text-xs font-medium text-red-800">Hard</p>
      <p className="font-bold text-red-700 text-2xl tracking-tighter">{hard}</p>
    </div>
  </div>
);

const RadialProgressCard = ({ value, maxValue, label, color, isMounted }) => {
  const animatedValue = useCountUp(value);
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="bg-white rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-md transition-all duration-300 hover:shadow-xl hover:-translate-y-2">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full" viewBox="0 0 120 120">
          <circle
            className="text-slate-100"
            strokeWidth="10"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="60"
            cy="60"
          />
          <circle
            className={color}
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={isMounted ? offset : circumference}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="60"
            cy="60"
            style={{ 
              transform: 'rotate(-90deg)', 
              transformOrigin: '50% 50%', 
              transition: 'stroke-dashoffset 1.5s ease-out' 
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-slate-800">{animatedValue}</span>
        </div>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-600">{label}</p>
    </div>
  );
};

const SkeletonLoader = () => (
  <div className="space-y-4 animate-pulse p-2">
    <div className="flex justify-between items-center">
      <div className="h-6 bg-slate-200 rounded-md w-1/3"></div>
      <div className="h-4 bg-slate-200 rounded-md w-1/4"></div>
    </div>
    <div className="space-y-3 pt-4">
      <div className="h-4 bg-slate-200 rounded-md w-full"></div>
      <div className="h-4 bg-slate-200 rounded-md w-5/6"></div>
      <div className="h-4 bg-slate-200 rounded-md w-full"></div>
    </div>
  </div>
);

const ErrorDisplay = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center h-full text-center text-amber-700 bg-amber-50 rounded-lg py-10 animate-fadeIn">
    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2 animate-pulse" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.257 3.099c.636-1.22 2.85-1.22 3.486 0l5.58 10.76c.636 1.22-.474 2.641-1.743 2.641H4.42c-1.269 0-2.379-1.421-1.743-2.64L8.257 3.099zM9 13a1 1 0 112 0 1 1 0 01-2 0zm1-5a1 1 0 00-1 1v2a1 1 0 102 0V9a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
    <p className="font-semibold">Unable to fetch data</p>
    <p className="text-xs max-w-xs mb-4">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
      >
        Try Again
      </button>
    )}
  </div>
);

const PlatformStatus = ({ status }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'completed':
        return { color: 'bg-green-500', text: 'Updated', icon: '✓' };
      case 'scraping':
        return { color: 'bg-blue-500 animate-pulse', text: 'Scraping...', icon: '⟳' };
      case 'failed':
        return { color: 'bg-red-500', text: 'Failed', icon: '✗' };
      default:
        return { color: 'bg-gray-400', text: 'Pending', icon: '⋯' };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${config.color}`}></div>
      <span className="text-xs text-slate-500">{config.text}</span>
    </div>
  );
};

// --- Enhanced Scraping Functions with Kenkoooo API for AtCoder ---

const extractUsername = (url, pattern) => {
  const match = url.match(pattern);
  return match ? match[1] : url.split('/').filter(Boolean).pop();
};

const fetchWithProxy = async (url, options = {}) => {
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  ];
  
  for (const proxyUrl of proxies) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(proxyUrl, {
        ...options,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json, text/html, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...options.headers,
        },
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return response;
      }
    } catch (error) {
      console.log(`Proxy ${proxyUrl} failed:`, error.message);
      continue;
    }
  }
  
  throw new Error('All proxy attempts failed');
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

const scrapeLeetCode = async (leetcodeUrl) => {
  const empty = {
    totalSolved: 0, easySolved: 0, mediumSolved: 0, hardSolved: 0,
    ranking: 0, acceptanceRate: 0, reputation: 0,
  };
  try {
    const username = extractUsername(leetcodeUrl, /leetcode\.com\/(?:u\/)?([^\/\?]+)/);
    if (!username) return empty;

    // Official LeetCode GraphQL via a CORS proxy (browser can't call it directly).
    const query = `
      query getUserProfile($username: String!) {
        matchedUser(username: $username) {
          profile { ranking reputation }
          submitStatsGlobal {
            acSubmissionNum { difficulty count }
            totalSubmissionNum { difficulty count }
          }
        }
      }`;
    const endpoint = 'https://leetcode.com/graphql';
    const proxied = `https://corsproxy.io/?url=${encodeURIComponent(endpoint)}`;

    let json = null;
    try {
      const res = await fetch(proxied, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { username } }),
      });
      if (res.ok) json = await res.json();
    } catch (proxyError) {
      console.log('LeetCode GraphQL proxy failed:', proxyError.message);
    }

    const user = json && json.data && json.data.matchedUser;
    if (!user || !user.submitStatsGlobal) return empty;

    const ac = user.submitStatsGlobal.acSubmissionNum || [];
    const totals = user.submitStatsGlobal.totalSubmissionNum || [];
    const countOf = (arr, difficulty) => {
      const entry = arr.find((x) => x.difficulty === difficulty);
      return entry ? entry.count : 0;
    };
    const totalSolved = countOf(ac, 'All');
    const totalSubmissions = countOf(totals, 'All');

    return {
      totalSolved,
      easySolved: countOf(ac, 'Easy'),
      mediumSolved: countOf(ac, 'Medium'),
      hardSolved: countOf(ac, 'Hard'),
      ranking: (user.profile && user.profile.ranking) || 0,
      acceptanceRate:
        totalSubmissions > 0 ? Math.round((totalSolved / totalSubmissions) * 1000) / 10 : 0,
      reputation: (user.profile && user.profile.reputation) || 0,
    };
  } catch (error) {
    console.error('LeetCode scraping error:', error);
    return empty;
  }
};

const scrapeGitHub = async (githubUrl) => {
  try {
    const username = extractUsername(githubUrl, /github\.com\/([^\/\?]+)/);
    
    if (!username) {
      throw new Error('Invalid GitHub URL');
    }

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    
    // Add GitHub token if available
    if (import.meta.env.VITE_GITHUB_TOKEN) {
      headers['Authorization'] = `token ${import.meta.env.VITE_GITHUB_TOKEN}`;
    }

    const userResponse = await fetch(`https://api.github.com/users/${username}`, { headers });
    
    if (!userResponse.ok) {
      if (userResponse.status === 403) {
        throw new Error('GitHub API rate limit exceeded. Please try again later.');
      }
      if (userResponse.status === 404) {
        throw new Error('GitHub user not found');
      }
      throw new Error(`GitHub API error: ${userResponse.status}`);
    }
    
    const userData = await userResponse.json();

    // Get repositories data
    let totalStars = 0;
    let totalForks = 0;
    
    try {
      const reposResponse = await fetch(
        `https://api.github.com/users/${username}/repos?per_page=30&page=1&sort=updated`,
        { headers }
      );
      
      if (reposResponse.ok) {
        const reposData = await reposResponse.json();
        totalStars = reposData.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
        totalForks = reposData.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);
      }
    } catch (repoError) {
      console.log('GitHub repos API failed, using basic user data:', repoError.message);
    }

    // Calculate contributions based on available data
    const totalContributions = (userData.public_repos || 0) + (userData.followers || 0);

    return {
      username: userData.login,
      name: userData.name || username,
      repositories: userData.public_repos || 0,
      followers: userData.followers || 0,
      following: userData.following || 0,
      totalStars: totalStars,
      totalForks: totalForks,
      totalContributions: totalContributions,
      accountCreated: userData.created_at,
      lastUpdated: userData.updated_at,
    };

  } catch (error) {
    console.error('GitHub scraping error:', error);
    return {
      error: error.message,
      repositories: 0,
      followers: 0,
      following: 0,
      totalStars: 0,
      totalForks: 0,
      totalContributions: 0,
    };
  }
};

const scrapeCodeforces = async (codeforcesUrl) => {
  try {
    const username = extractUsername(codeforcesUrl, /codeforces\.com\/profile\/([^\/\?]+)/);
    
    if (!username) {
      throw new Error('Invalid Codeforces URL');
    }

    const response = await fetch(`https://codeforces.com/api/user.info?handles=${username}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) throw new Error('Codeforces API error');
    
    const data = await response.json();
    
    if (data.status !== 'OK' || !data.result?.[0]) {
      throw new Error('User not found');
    }

    const user = data.result[0];

    // Get submissions count
    let problemsSolved = 0;
    try {
      const submissionsResponse = await fetch(`https://codeforces.com/api/user.status?handle=${username}&from=1&count=1000`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (submissionsResponse.ok) {
        const submissionsData = await submissionsResponse.json();
        if (submissionsData.status === 'OK') {
          const solvedProblems = new Set();
          submissionsData.result.forEach(sub => {
            if (sub.verdict === 'OK' && sub.problem) {
              solvedProblems.add(`${sub.problem.contestId}-${sub.problem.index}`);
            }
          });
          problemsSolved = solvedProblems.size;
        }
      }
    } catch (subError) {
      console.log('Codeforces submissions API failed, defaulting to 0 problems:', subError.message);
      // If we can't get submissions, assume 0 problems (no fake estimates)
      problemsSolved = 0;
    }

    return {
      rating: user.rating || 'Unrated',
      maxRating: user.maxRating || 'N/A',
      problemsSolved: problemsSolved,
      rank: user.rank || 'unrated',
      maxRank: user.maxRank || 'N/A',
      contribution: user.contribution || 0
    };

  } catch (error) {
    console.error('Codeforces scraping error:', error);
    return {
      rating: 'Unrated',
      maxRating: 'N/A',
      problemsSolved: 0,
      rank: 'unrated',
      maxRank: 'N/A',
      contribution: 0
    };
  }
};

const scrapeAtCoder = async (atcoderUrl) => {
  try {
    const username = extractUsername(atcoderUrl, /atcoder\.jp\/users\/([^\/\?]+)/);
    console.log(`Scraping AtCoder for user: ${username} using Kenkoooo API`);
    
    if (!username) {
      throw new Error('Invalid AtCoder URL');
    }

    // Primary Method: Kenkoooo API for accurate accepted problems count
    try {
      console.log('Using Kenkoooo API for AtCoder data');
      
      // Get AC submissions count from Kenkoooo API
      const kenkooooAcUrl = `https://kenkoooo.com/atcoder/atcoder-api/v3/user/ac_rank?user=${username}`;
      const acResponse = await fetch(kenkooooAcUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (acResponse.ok) {
        const acData = await acResponse.json();
        const problemsSolved = acData.count || 0;
        
        console.log(`Kenkoooo API - Problems solved for ${username}: ${problemsSolved}`);
        
        // Get user info and rating from AtCoder API
        let rating = 0;
        let maxRating = 0;
        let contestsParticipated = 0;
        let rank = 'Gray';
        
        try {
          const userInfoUrl = `https://atcoder.jp/users/${username}/history/json`;
          const userInfoResponse = await fetchWithProxy(userInfoUrl);
          
          if (userInfoResponse.ok) {
            const contestData = await userInfoResponse.json();
            if (Array.isArray(contestData) && contestData.length > 0) {
              const ratings = contestData.map(contest => contest.NewRating || contest.newRating).filter(r => r !== null && r !== undefined);
              rating = ratings.length > 0 ? ratings[ratings.length - 1] : 0;
              maxRating = ratings.length > 0 ? Math.max(...ratings) : 0;
              contestsParticipated = contestData.length;
              rank = getAtCoderRank(rating);
              
              console.log(`AtCoder API - Rating: ${rating}, Contests: ${contestsParticipated}`);
            }
          }
        } catch (userInfoError) {
          console.log('AtCoder user info API failed:', userInfoError.message);
          // Use default values if API fails
          rating = 0;
          maxRating = 0;
          contestsParticipated = 0;
          rank = 'Gray';
        }
        
        return {
          rating: rating,
          maxRating: maxRating,
          contestsParticipated: contestsParticipated,
          problemsSolved: problemsSolved,
          rank: rank,
          lastUpdated: new Date().toISOString(),
          source: 'Kenkoooo API + AtCoder API'
        };
      } else {
        throw new Error(`Kenkoooo API returned status: ${acResponse.status}`);
      }
    } catch (kenkooooError) {
      console.log('Kenkoooo API failed:', kenkooooError.message);
    }
    
    // Fallback Method: Try Kenkoooo submissions API for more detailed data
    try {
      console.log('Trying Kenkoooo submissions API as fallback');
      const kenkooooSubmissionsUrl = `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${username}&from_second=0`;
      const submissionsResponse = await fetch(kenkooooSubmissionsUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (submissionsResponse.ok) {
        const submissionsData = await submissionsResponse.json();
        console.log(`Kenkoooo submissions API - Total submissions: ${submissionsData.length}`);
        
        if (Array.isArray(submissionsData)) {
          // Calculate unique solved problems from AC submissions
          const solvedProblems = new Set();
          const contestSubmissions = new Set();
          
          submissionsData.forEach(submission => {
            if (submission.result === 'AC') {
              solvedProblems.add(submission.problem_id);
              contestSubmissions.add(submission.contest_id);
            }
          });
          
          const problemsSolved = solvedProblems.size;
          const contestsParticipated = contestSubmissions.size;
          
          console.log(`Kenkoooo submissions - Solved: ${problemsSolved}, Contests: ${contestsParticipated}`);
          
          // Get rating info
          let rating = 0;
          let maxRating = 0;
          let rank = 'Gray';
          
          try {
            const userInfoUrl = `https://atcoder.jp/users/${username}/history/json`;
            const userInfoResponse = await fetchWithProxy(userInfoUrl);
            
            if (userInfoResponse.ok) {
              const contestData = await userInfoResponse.json();
              if (Array.isArray(contestData) && contestData.length > 0) {
                const ratings = contestData.map(contest => contest.NewRating || contest.newRating).filter(r => r !== null && r !== undefined);
                rating = ratings.length > 0 ? ratings[ratings.length - 1] : 0;
                maxRating = ratings.length > 0 ? Math.max(...ratings) : 0;
                rank = getAtCoderRank(rating);
              }
            }
          } catch (ratingError) {
            console.log('Rating API failed:', ratingError.message);
            // Use default values if rating API fails
            rating = 0;
            maxRating = 0;
            rank = 'Gray';
          }
          
          return {
            rating: rating,
            maxRating: maxRating,
            contestsParticipated: contestsParticipated,
            problemsSolved: problemsSolved,
            rank: rank,
            lastUpdated: new Date().toISOString(),
            source: 'Kenkoooo Submissions API'
          };
        }
      }
    } catch (submissionsError) {
      console.log('Kenkoooo submissions API failed:', submissionsError.message);
    }
    
    // Final fallback: Try traditional AtCoder API
    try {
      const apiUrl = `https://atcoder.jp/users/${username}/history/json`;
      const response = await fetchWithProxy(apiUrl);
      
      if (response.ok) {
        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0) {
          const ratings = data.map(contest => contest.NewRating || contest.newRating).filter(r => r !== null && r !== undefined);
          const currentRating = ratings.length > 0 ? ratings[ratings.length - 1] : 0;
          const maxRating = ratings.length > 0 ? Math.max(...ratings) : 0;
          
          // Calculate problems solved based on contest participation
          const problemsSolved = data.length > 0 ? data.length : 0;
          
          return {
            rating: currentRating,
            maxRating: maxRating,
            contestsParticipated: data.length,
            problemsSolved: problemsSolved,
            rank: getAtCoderRank(currentRating),
            lastUpdated: new Date().toISOString(),
            source: 'AtCoder API (estimated problems)'
          };
        }
      }
    } catch (apiError) {
      console.log('AtCoder API failed:', apiError.message);
    }
    
    // Ultimate fallback: Return empty data
    console.log('All AtCoder methods failed, returning empty data');
    return {
      rating: 0,
      maxRating: 0,
      contestsParticipated: 0,
      rank: 'Gray',
      problemsSolved: 0
    };

  } catch (error) {
    console.error('AtCoder scraping error:', error);
    return {
      rating: 0,
      maxRating: 0,
      contestsParticipated: 0,
      rank: 'Gray',
      problemsSolved: 0
    };
  }
};

// --- Main Component ---

const StudentViewDetails = ({ student, onClose, onStudentUpdate, isAdminView = false }) => {
  const [isMounted, setIsMounted] = useState(false);
  const [currentStudent, setCurrentStudent] = useState(student);
  const [scrapingStatus, setScrapingStatus] = useState({});
  const [isAutoScraping, setIsAutoScraping] = useState(false);
  const rescrape = useRescrapeStudent();
  const [showEditModal, setShowEditModal] = useState(false);
  const [platformData, setPlatformData] = useState({
    leetcode: { loading: false, data: null, error: null },
    github: { loading: false, data: null, error: null },
    codeforces: { loading: false, data: null, error: null },
    atcoder: { loading: false, data: null, error: null }
  });

  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 100);
    
    // Sanitize student data and auto-fetch if URLs exist
    const sanitizedStudent = sanitizeStudentData(student);
    if (sanitizedStudent) {
      setCurrentStudent(sanitizedStudent);
      if (sanitizedStudent.platformUrls && Object.values(sanitizedStudent.platformUrls).some(url => url)) {
        handleAutoFetch();
      }
      
    }
    
    return () => clearTimeout(timer);
  }, []);

  // Generate initial activities based on existing platform data
  // ---------------------------------------------------------------------------
  // Refreshing a student's numbers is now a server-side request, not a scrape.
  //
  // This block used to hold its OWN copies of scrapeLeetCode / scrapeGitHub /
  // scrapeCodeforces / scrapeAtCoder (a third copy in the codebase), call them
  // from the browser through CORS proxies, and updateDoc the results straight
  // into Firestore. It also wrote to activityService — whose logging methods
  // were all stubbed out ("DISABLED TO SAVE STORAGE"), so every one of those
  // awaits was a no-op that only added latency.
  //
  // Now: mark the platforms pending, and the GitHub Action does the scraping.
  // Results arrive by SSE. The admin's IP and the CORS proxies are out of it.
  // ---------------------------------------------------------------------------
  const handleAutoFetch = async () => {
    if (!currentStudent?.platformUrls || Object.values(currentStudent.platformUrls).every((u) => !u)) {
      return;
    }
    try {
      setIsAutoScraping(true);
      const res = await rescrape.mutateAsync(currentStudent.id);
      const pending = {};
      Object.keys(currentStudent.platformUrls).forEach((p) => {
        if (currentStudent.platformUrls[p]) pending[p] = 'pending';
      });
      setScrapingStatus(pending);
      toast.success(`Queued ${res.queued} platform(s) — results appear here when the scraper runs`);
    } catch (error) {
      toast.error('Could not queue refresh: ' + error.message);
    } finally {
      setIsAutoScraping(false);
    }
  };

  const handleManualRefresh = async () => {
    await handleAutoFetch();
  };

  // Per-platform retry: the whole student is re-queued, because the scraper
  // works per student and the cost of the extra platforms is negligible.
  const handleRetryPlatform = async (platform) => {
    if (!currentStudent?.platformUrls?.[platform]) {
      toast.error(`No ${platform} URL for this student`);
      return;
    }
    try {
      setScrapingStatus((prev) => ({ ...prev, [platform]: 'pending' }));
      await rescrape.mutateAsync(currentStudent.id);
      toast.success(`${platform} queued for the next scraper run`);
    } catch (error) {
      setScrapingStatus((prev) => ({ ...prev, [platform]: 'failed' }));
      toast.error(`Could not queue ${platform}: ` + error.message);
    }
  };


  const getPlatformData = (platform) => {
    // Use real-time data if available, otherwise use stored data
    const realTimeData = platformData[platform];
    const storedData = currentStudent.platformData?.[platform] || currentStudent.stats?.[platform];
    const scrapingStatusValue = currentStudent.scrapingStatus?.[platform] || 'pending';

    if (realTimeData.loading) {
      return { data: null, status: 'scraping', hasData: false };
    }

    if (realTimeData.data) {
      return { data: realTimeData.data, status: 'completed', hasData: true };
    }

    if (realTimeData.error) {
      return { data: storedData, status: 'failed', hasData: !!storedData };
    }

    return { data: storedData, status: scrapingStatusValue, hasData: !!storedData };
  };

  // Calculate total problems solved using utility function
  const calculateTotalSolved = () => {
    const platformDataObj = {};
    ['leetcode', 'codeforces', 'atcoder'].forEach(platform => {
      const platformInfo = getPlatformData(platform);
      if (platformInfo.data) {
        platformDataObj[platform] = platformInfo.data;
      }
    });
    return calculateTotalProblems(platformDataObj);
  };

  // Get platform stats for display
  const getPlatformStats = (platform) => {
    const { data } = getPlatformData(platform);
    
    if (!data) return null;

    switch (platform) {
      case 'leetcode':
        return {
          totalSolved: data.totalSolved || data.solved || 0,
          easy: data.easySolved || data.easy || 0,
          medium: data.mediumSolved || data.medium || 0,
          hard: data.hardSolved || data.hard || 0,
          rating: data.rating || 0,
          ranking: data.ranking || 0,
          acceptanceRate: data.acceptanceRate || 0
        };
      
      case 'codeforces':
        return {
          rating: data.rating || 'Unrated',
          maxRating: data.maxRating || 'N/A',
          problemsSolved: data.problemsSolved || 0,
          rank: data.rank || 'unrated',
          maxRank: data.maxRank || 'N/A',
        };
      
      case 'atcoder':
        return {
          rating: data.rating || 'Unrated',
          maxRating: data.maxRating || 'N/A',
          problemsSolved: data.problemsSolved || 0,
          contestsParticipated: data.contestsParticipated || 0,
          rank: data.rank || 'Unrated',
          source: data.source // Show data source for debugging
        };
      
      case 'github':
        return {
          repositories: data.repositories || data.repos || 0,
          followers: data.followers || 0,
          following: data.following || 0,
          totalContributions: data.totalContributions || 0
        };
      
      default:
        return data;
    }
  };

  const getInitials = (name = '') => {
    const parts = name.split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const platformOrder = ['leetcode', 'codeforces', 'github', 'atcoder'];
  const availablePlatforms = platformOrder.filter(p => currentStudent.platformUrls?.[p]);

  const snapshotData = [
    { 
      label: "Total Problems Solved", 
      value: calculateTotalSolved(), 
      maxValue: Math.max(calculateTotalSolved() * 1.5, 1000), 
      color: "text-blue-500" 
    },
    { 
      label: "GitHub Repos", 
      value: getPlatformStats('github')?.repositories || 0, 
      maxValue: Math.max((getPlatformStats('github')?.repositories || 0) * 1.5, 100), 
      color: "text-purple-500" 
    },
    { 
      label: "Active Platforms", 
      value: availablePlatforms.length, 
      maxValue: 5, 
      color: "text-emerald-500" 
    },
  ];

  const formatLastUpdated = (lastUpdated) => {
    if (!lastUpdated) return 'Never';
    const date = new Date(lastUpdated);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <div 
      className={`fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out ${isMounted ? 'opacity-100' : 'opacity-0'}`}
      onClick={onClose}
    >
      <div 
        className={`bg-slate-50 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] flex flex-col overflow-hidden transition-all duration-500 ease-out ${isMounted ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-8 py-4 border-b border-slate-200 bg-white">
          <div className="flex justify-between items-start gap-6">
            <div className="flex items-center gap-5">
              <div 
                className="flex-shrink-0 h-16 w-16 bg-blue-600 text-white flex items-center justify-center rounded-full text-2xl font-bold transform transition-transform duration-300 hover:scale-110 hover:shadow-lg"
              >
                {getInitials(currentStudent.name)}
              </div>
              <div>
                <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">{currentStudent.name}</h2>
                <p className="text-slate-500 mt-1">{currentStudent.email}</p>
                {isAutoScraping && (
                  <div className="flex items-center gap-2 mt-1 text-sm text-blue-600">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span>Fetching real-time data...</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdminView && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="text-blue-600 hover:bg-blue-100 hover:text-blue-700 rounded-full p-2 transition-all duration-300 hover:scale-110"
                  title="Edit Student"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-full p-2 transition-all duration-300 hover:rotate-90"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm text-slate-600">
            <div className="flex gap-2 hover:translate-x-1 transition-transform duration-200">
              <strong className="font-medium text-slate-500">Register No:</strong>
              <span>{currentStudent.registerNumber || 'N/A'}</span>
            </div>
            <div className="flex gap-2 hover:translate-x-1 transition-transform duration-200">
              <strong className="font-medium text-slate-500">Roll No:</strong>
              <span>{currentStudent.rollNumber || 'N/A'}</span>
            </div>
            <div className="flex gap-2 hover:translate-x-1 transition-transform duration-200">
              <strong className="font-medium text-slate-500">Department:</strong>
              <span>{currentStudent.department || 'N/A'}</span>
            </div>
            <div className="flex gap-2 hover:translate-x-1 transition-transform duration-200">
              <strong className="font-medium text-slate-500">Year:</strong>
              <span>{currentStudent.year || 'N/A'}</span>
            </div>
          </div>
          {currentStudent.scrapingStatus?.lastUpdated && (
            <div className="mt-3 text-xs text-slate-400">
              Last updated: {formatLastUpdated(currentStudent.scrapingStatus.lastUpdated)}
            </div>
          )}
        </header>

        {/* Body */}
        <main className="overflow-y-auto flex-1 p-8 bg-slate-100/70">
          {/* Overall Snapshot Section */}
          <section className="opacity-0 animate-fadeIn" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-slate-500 uppercase tracking-wider">
                Overall Snapshot
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={handleManualRefresh}
                  disabled={isAutoScraping}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2 ${
                    isAutoScraping 
                      ? 'bg-blue-100 text-blue-600 cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
                  }`}
                >
                  <svg 
                    className={`w-4 h-4 ${isAutoScraping ? 'animate-spin' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {isAutoScraping ? 'Updating...' : 'Refresh Data'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {snapshotData.map((item, index) => (
                <div
                  key={item.label}
                  className="opacity-0 animate-fadeIn transform translate-y-4" 
                  style={{ 
                    animationDelay: `${0.2 + (index * 0.1)}s`, 
                    animationFillMode: 'forwards' 
                  }}
                >
                  <RadialProgressCard {...item} isMounted={isMounted} />
                </div>
              ))}
            </div>
          </section>

          {/* Platform Details Section */}
          <section className="mt-10 opacity-0 animate-fadeIn" style={{ animationDelay: '0.6s', animationFillMode: 'forwards' }}>
            <h3 className="text-base font-semibold text-slate-500 mb-4 uppercase tracking-wider">
              Platform Details
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {availablePlatforms.map((platform, index) => {
                const { data, status } = getPlatformData(platform);
                const stats = getPlatformStats(platform);
                const profileUrl = currentStudent.platformUrls[platform];
                const isLoading = status === 'scraping';
                const realTimeData = platformData[platform];

                return (
                  <div 
                    key={platform} 
                    className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 opacity-0 animate-fadeIn" 
                    style={{ 
                      animationDelay: `${0.7 + (index * 0.1)}s`,
                      animationFillMode: 'forwards'
                    }}
                  >
                    <div className="flex items-center justify-between p-6 border-b border-slate-100">
                      <div className="flex items-center gap-4">
                        <PlatformIcon platform={platform} />
                        <div>
                          <h4 className="text-2xl font-bold text-slate-800 capitalize">{platform}</h4>
                          <PlatformStatus status={status} />
                          {realTimeData?.loading && (
                            <span className="text-xs text-blue-500">Live updating...</span>
                          )}
                        </div>
                      </div>
                      <a 
                        href={profileUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 group flex items-center gap-1 transition-all duration-200 hover:translate-x-1"
                      >
                        View Profile <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
                      </a>
                    </div>
                    <div className="p-6 min-h-[150px]">
                      {isLoading ? (
                        <SkeletonLoader />
                      ) : realTimeData?.error && !data ? (
                        <ErrorDisplay 
                          message={realTimeData.error} 
                          onRetry={() => handleRetryPlatform(platform)}
                        />
                      ) : !data ? (
                        <div className="flex flex-col items-center justify-center h-32 text-slate-500">
                          <svg className="w-12 h-12 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          <p className="text-sm">No data available</p>
                          <p className="text-xs text-slate-400">Data will be fetched automatically</p>
                        </div>
                      ) : (
                        <dl>
                          {platform === 'leetcode' && stats && (
                            <>
                              <StatItem label="Total Solved" value={stats.totalSolved} />
                              {stats.rating > 0 && <StatItem label="Current Rating" value={stats.rating} />}
                              {stats.ranking > 0 && <StatItem label="Global Ranking" value={stats.ranking} />}
                              {stats.acceptanceRate > 0 && <StatItem label="Acceptance Rate" value={`${stats.acceptanceRate}%`} />}
                              <LeetCodeDifficultyStats easy={stats.easy} medium={stats.medium} hard={stats.hard} />
                            </>
                          )}
                          
                          {platform === 'codeforces' && stats && (
                            <>
                              <StatItem label="Problems Solved" value={stats.problemsSolved} />
                              <StatItem label="Current Rating" value={stats.rating} />
                              <StatItem label="Max Rating" value={stats.maxRating} />
                              <StatItem label="Rank" value={stats.rank} />
                            </>
                          )}
                          
                          {platform === 'atcoder' && stats && (
                            <>
                              <StatItem label="Current Rating" value={stats.rating} />
                              <StatItem label="Max Rating" value={stats.maxRating} />
                              <StatItem label="Contests Participated" value={stats.contestsParticipated} />
                              <StatItem label="Problems Solved" value={stats.problemsSolved} />
                              <StatItem label="Rank" value={stats.rank} />
                              {/* {stats.source && (
                                <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
                                  <p>Data source: {stats.source}</p>
                                </div>
                              )} */}
                            </>
                          )}
                          
                          {platform === 'github' && stats && (
                            <>
                              <StatItem label="Public Repositories" value={stats.repositories} />
                              <StatItem label="Followers" value={stats.followers} />
                              <StatItem label="Following" value={stats.following} />
                              <StatItem label="Total Contributions" value={stats.totalContributions} />
                            </>
                          )}
                        </dl>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {availablePlatforms.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center mt-6 opacity-0 animate-fadeIn" style={{ animationDelay: '0.8s', animationFillMode: 'forwards' }}>
                <svg className="w-16 h-16 mx-auto text-slate-300 mb-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <h4 className="text-xl font-bold text-slate-700 mb-2">
                  No Platform Profiles Linked
                </h4>
                <p className="text-slate-500 max-w-md mx-auto">
                  This student hasn't linked any coding platform profiles yet. Encourage them to add their profiles for better tracking.
                </p>
              </div>
            )}
          </section>
        </main>

        {/* Footer */}
        <footer className="px-8 py-3 border-t border-slate-200 flex justify-between items-center rounded-b-xl bg-white opacity-0 animate-fadeIn" style={{ animationDelay: '0.9s', animationFillMode: 'forwards' }}>
          <div className="text-sm text-slate-500">
            {isAutoScraping ? (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span>Fetching real-time data...</span>
              </div>
            ) : (
              'Data updates automatically when viewing'
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 hover:scale-105 transform duration-200"
            >
              Close
            </button>
            {isAdminView && (
              <button
                onClick={() => setShowEditModal(true)}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm hover:shadow-lg hover:-translate-y-0.5 transform focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 duration-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Student
              </button>
            )}
          </div>
        </footer>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <EditStudentModal
          student={currentStudent}
          onClose={() => setShowEditModal(false)}
          onUpdate={(updatedStudent) => {
            setCurrentStudent(updatedStudent);
            if (onStudentUpdate) {
              onStudentUpdate(updatedStudent);
            }
            setShowEditModal(false);
          }}
        />
      )}
    </div>
  );
};

// Add required CSS for animations
const styles = `
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.animate-fadeIn {
  animation: fadeIn 0.5s ease-out forwards;
}
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.animate-bounce {
  animation: bounce 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);
}

export default StudentViewDetails;