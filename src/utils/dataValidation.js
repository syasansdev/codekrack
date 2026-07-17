// Utility functions for data validation and sanitization

export const validatePlatformData = (platform, data) => {
  if (!data || typeof data !== 'object') {
    return getEmptyPlatformData(platform);
  }

  switch (platform.toLowerCase()) {
    case 'leetcode':
      return {
        totalSolved: Math.max(0, parseInt(data.totalSolved) || 0),
        easySolved: Math.max(0, parseInt(data.easySolved) || 0),
        mediumSolved: Math.max(0, parseInt(data.mediumSolved) || 0),
        hardSolved: Math.max(0, parseInt(data.hardSolved) || 0),
        ranking: data.ranking || 0,
        acceptanceRate: Math.max(0, Math.min(100, parseFloat(data.acceptanceRate) || 0)),
        reputation: Math.max(0, parseInt(data.reputation) || 0)
      };

    case 'codeforces':
      return {
        rating: data.rating === 'Unrated' ? 'Unrated' : Math.max(0, parseInt(data.rating) || 0),
        maxRating: data.maxRating === 'N/A' ? 'N/A' : Math.max(0, parseInt(data.maxRating) || 0),
        problemsSolved: Math.max(0, parseInt(data.problemsSolved) || 0),
        rank: data.rank || 'unrated',
        maxRank: data.maxRank || 'N/A',
        contribution: parseInt(data.contribution) || 0
      };

    case 'atcoder':
      return {
        rating: data.rating === 'Unrated' ? 'Unrated' : Math.max(0, parseInt(data.rating) || 0),
        maxRating: data.maxRating === 'N/A' ? 'N/A' : Math.max(0, parseInt(data.maxRating) || 0),
        problemsSolved: Math.max(0, parseInt(data.problemsSolved) || 0),
        contestsParticipated: Math.max(0, parseInt(data.contestsParticipated) || 0),
        rank: data.rank || 'Gray'
      };

    case 'github':
      return {
        username: data.username || '',
        name: data.name || '',
        repositories: Math.max(0, parseInt(data.repositories) || 0),
        followers: Math.max(0, parseInt(data.followers) || 0),
        following: Math.max(0, parseInt(data.following) || 0),
        totalStars: Math.max(0, parseInt(data.totalStars) || 0),
        totalForks: Math.max(0, parseInt(data.totalForks) || 0),
        totalContributions: Math.max(0, parseInt(data.totalContributions) || 0)
      };

    default:
      return data;
  }
};

export const getEmptyPlatformData = (platform) => {
  switch (platform.toLowerCase()) {
    case 'leetcode':
      return {
        totalSolved: 0,
        easySolved: 0,
        mediumSolved: 0,
        hardSolved: 0,
        ranking: 0,
        acceptanceRate: 0,
        reputation: 0
      };

    case 'codeforces':
      return {
        rating: 'Unrated',
        maxRating: 'N/A',
        problemsSolved: 0,
        rank: 'unrated',
        maxRank: 'N/A',
        contribution: 0
      };

    case 'atcoder':
      return {
        rating: 'Unrated',
        maxRating: 'N/A',
        problemsSolved: 0,
        contestsParticipated: 0,
        rank: 'Gray'
      };

    case 'github':
      return {
        username: '',
        name: '',
        repositories: 0,
        followers: 0,
        following: 0,
        totalStars: 0,
        totalForks: 0,
        totalContributions: 0
      };

    default:
      return {};
  }
};

export const validateUrl = (url, platform) => {
  if (!url || typeof url !== 'string') return false;

  const urlPatterns = {
    leetcode: /^https?:\/\/(www\.)?leetcode\.com\/(u\/)?[a-zA-Z0-9_-]+\/?$/,
    codeforces: /^https?:\/\/(www\.)?codeforces\.com\/profile\/[a-zA-Z0-9_-]+\/?$/,
    atcoder: /^https?:\/\/(www\.)?atcoder\.jp\/users\/[a-zA-Z0-9_-]+\/?$/,
    github: /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/,
    hackerrank: /^https?:\/\/(www\.)?hackerrank\.com\/[a-zA-Z0-9_-]+\/?$/,
    linkedin: /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/
  };

  const pattern = urlPatterns[platform.toLowerCase()];
  return pattern ? pattern.test(url) : false;
};

export const sanitizeStudentData = (studentData) => {
  if (!studentData || typeof studentData !== 'object') {
    return null;
  }

  return {
    id: studentData.id || '',
    name: studentData.name || 'Unknown Student',
    email: studentData.email || '',
    phoneNumber: studentData.phoneNumber || '',
    registerNumber: studentData.registerNumber || '',
    rollNumber: studentData.rollNumber || '',
    department: studentData.department || '',
    year: studentData.year || '',
    platformUrls: {
      github: studentData.platformUrls?.github || '',
      leetcode: studentData.platformUrls?.leetcode || '',
      codeforces: studentData.platformUrls?.codeforces || '',
      atcoder: studentData.platformUrls?.atcoder || '',
      hackerrank: studentData.platformUrls?.hackerrank || '',
      linkedin: studentData.platformUrls?.linkedin || ''
    },
    platformData: {
      leetcode: validatePlatformData('leetcode', studentData.platformData?.leetcode),
      codeforces: validatePlatformData('codeforces', studentData.platformData?.codeforces),
      atcoder: validatePlatformData('atcoder', studentData.platformData?.atcoder),
      github: validatePlatformData('github', studentData.platformData?.github)
    },
    scrapingStatus: studentData.scrapingStatus || {},
    lastUpdated: studentData.lastUpdated || null
  };
};

export const calculateTotalProblems = (platformData) => {
  if (!platformData || typeof platformData !== 'object') {
    return 0;
  }

  let total = 0;
  
  // LeetCode problems
  if (platformData.leetcode?.totalSolved) {
    total += parseInt(platformData.leetcode.totalSolved) || 0;
  }
  
  // Codeforces problems
  if (platformData.codeforces?.problemsSolved) {
    total += parseInt(platformData.codeforces.problemsSolved) || 0;
  }
  
  // AtCoder problems
  if (platformData.atcoder?.problemsSolved) {
    total += parseInt(platformData.atcoder.problemsSolved) || 0;
  }

  return total;
};

export const getScrapingStatusColor = (status) => {
  const statusColors = {
    completed: 'text-green-600 bg-green-50 border-green-200',
    failed: 'text-red-600 bg-red-50 border-red-200',
    in_progress: 'text-blue-600 bg-blue-50 border-blue-200',
    pending: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    scraping: 'text-blue-600 bg-blue-50 border-blue-200'
  };

  return statusColors[status] || statusColors.pending;
};

export const formatLastUpdated = (timestamp) => {
  if (!timestamp) return 'Never updated';

  const date = new Date(timestamp);
  const now = new Date();
  const diffInMinutes = Math.floor((now - date) / (1000 * 60));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
  if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)} days ago`;
  
  return date.toLocaleDateString();
};