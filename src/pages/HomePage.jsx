import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, animate } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useMyProfile } from '../hooks/queries/useStudents';
import { useNavigate } from 'react-router-dom';

// A reusable component for animating numbers from zero to the target value.
const AnimatedStat = ({ value }) => {
  const isNumeric = !isNaN(parseFloat(value)) && isFinite(value);
  const [displayValue, setDisplayValue] = useState(isNumeric ? 0 : value);

  useEffect(() => {
    if (!isNumeric) return;

    const controls = animate(0, value, {
      duration: 1.5,
      ease: "easeOut",
      onUpdate(latest) {
        setDisplayValue(Math.round(latest));
      }
    });

    // Cleanup function to stop animation if component unmounts
    return () => controls.stop();
  }, [value, isNumeric]);

  return <>{isNumeric ? displayValue.toLocaleString() : value}</>;
};


const HomePage = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Was: useState + useEffect + a direct Firestore read of users/{uid}.
  // The API returns platformData in the same shape the scraper produced, so the
  // mapping below is unchanged — only where the data comes from is different.
  const { data: profile, isLoading: loading, error: queryError } = useMyProfile();

  useEffect(() => {
    if (!currentUser) navigate('/signin');
  }, [currentUser, navigate]);

  const error = queryError
    ? queryError.isNotFound
      ? 'User profile not found'
      : 'Failed to load dashboard data'
    : null;

  // Derived, not copied into state: there is one source of truth (the query
  // cache) and this recomputes from it rather than drifting alongside it.
  const userData = useMemo(() => {
    if (!profile) return null;
    const p = profile.platformData || {};
    return {
      name: profile.name || 'User',
      email: profile.email,
      leetcode: {
        totalSolved: p.leetcode?.totalSolved || 0,
        easySolved: p.leetcode?.easySolved || 0,
        mediumSolved: p.leetcode?.mediumSolved || 0,
        hardSolved: p.leetcode?.hardSolved || 0,
        ranking: p.leetcode?.ranking || 'N/A',
      },
      codeforces: {
        rating: p.codeforces?.rating || 0,
        problemsSolved: p.codeforces?.problemsSolved || 0,
        maxRating: p.codeforces?.maxRating || 0,
        rank: p.codeforces?.rank || 'Unrated',
      },
      atcoder: {
        problemsSolved: p.atcoder?.problemsSolved || 0,
        rating: p.atcoder?.rating || 0,
        highestRating: p.atcoder?.highestRating || 0,
        rank: p.atcoder?.rank || 'Unrated',
      },
      github: {
        repositories: p.github?.repositories || 0,
        totalStars: p.github?.totalStars || 0,
        followers: p.github?.followers || 0,
        following: p.github?.following || 0,
      },
      department: profile.department || 'Not Specified',
      college: profile.college || 'Engineering',
      year: profile.year || 'N/A',
      scrapingStatus: profile.scrapingStatus || {},
    };
  }, [profile]);

  const platformStats = userData ? [
    { 
      title: 'LeetCode',
      subtitle: 'Problem Solving',
      icon: (
        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
          <path d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104a5.35 5.35 0 0 0-.125.513a5.527 5.527 0 0 0 .062 2.362a5.83 5.83 0 0 0 .349 1.017a5.938 5.938 0 0 0 1.271 1.818l4.277 4.193l.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019l-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .066-.523a2.545 2.545 0 0 1 .619-1.164L9.13 8.114c1.058-1.134 3.204-1.27 4.43-.278c.376.304.656.663.852 1.062c.195.4.304.834.317 1.28c.012.464-.096.921-.317 1.338c-.221.419-.548.774-.96 1.04l-4.163 2.692a1.403 1.403 0 0 0-.541 1.903a1.378 1.378 0 0 0 1.903.541l4.163-2.692c.815-.526 1.478-1.237 1.943-2.08a5.49 5.49 0 0 0 .787-2.856a5.707 5.707 0 0 0-.787-2.875a5.526 5.526 0 0 0-1.943-2.08c-2.47-1.586-5.856-1.284-7.99.85L7.655 9.114L3.803 13.24a5.493 5.493 0 0 0-.125.513a5.527 5.527 0 0 0 .062 2.362a5.83 5.83 0 0 0 .349 1.017a5.938 5.938 0 0 0 1.271 1.818l4.277 4.193l.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019l-4.276-4.193c-.652-.64-.972-1.469-.948-2.263z" fill="#FFA116"/>
        </svg>
      ),
      stats: [
        { label: 'Total Solved', value: userData.leetcode.totalSolved },
        { label: 'Easy', value: userData.leetcode.easySolved },
        { label: 'Medium', value: userData.leetcode.mediumSolved },
        { label: 'Hard', value: userData.leetcode.hardSolved }
      ],
      color: 'orange'
    },
    { 
      title: 'Codeforces',
      subtitle: 'Competitive Programming',
      icon: (
        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
          <path d="M4.5 7.5C5.328 7.5 6 8.172 6 9V15C6 15.828 5.328 16.5 4.5 16.5C3.672 16.5 3 15.828 3 15V9C3 8.172 3.672 7.5 4.5 7.5Z" fill="#1F8ACB"/>
          <path d="M9 4.5C9.828 4.5 10.5 5.172 10.5 6V18C10.5 18.828 9.828 19.5 9 19.5C8.172 19.5 7.5 18.828 7.5 18V6C7.5 5.172 8.172 4.5 9 4.5Z" fill="#1F8ACB"/>
          <path d="M13.5 7.5C14.328 7.5 15 8.172 15 9V15C15 15.828 14.328 16.5 13.5 16.5C12.672 16.5 12 15.828 12 15V9C12 8.172 12.672 7.5 13.5 7.5Z" fill="#F44336"/>
          <path d="M18 4.5C18.828 4.5 19.5 5.172 19.5 6V18C19.5 18.828 18.828 19.5 18 19.5C17.172 19.5 16.5 18.828 16.5 18V6C16.5 5.172 17.172 4.5 18 4.5Z" fill="#F44336"/>
        </svg>
      ),
      stats: [
        { label: 'Solved', value: userData.codeforces.problemsSolved },
        { label: 'Rating', value: userData.codeforces.rating },
        { label: 'Max Rating', value: userData.codeforces.maxRating },
        { label: 'Rank', value: userData.codeforces.rank }
      ],
      color: 'blue'
    },
    { 
      title: 'AtCoder',
      subtitle: 'Algorithm Contests',
      icon: (
        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#000000" stroke="#000000" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="#000000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      stats: [
        { label: 'Solved', value: userData.atcoder.problemsSolved },
        { label: 'Rating', value: userData.atcoder.rating },
        { label: 'Highest', value: userData.atcoder.highestRating },
        { label: 'Rank', value: userData.atcoder.rank }
      ],
      color: 'gray'
    },
    { 
      title: 'GitHub',
      subtitle: 'Open Source',
      icon: (
        <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none">
          <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12C2 16.42 4.865 20.17 8.839 21.49C9.339 21.58 9.52 21.27 9.52 21C9.52 20.77 9.511 20.14 9.506 19.31C6.726 19.91 6.139 17.77 6.139 17.77C5.685 16.61 5.029 16.3 5.029 16.3C4.121 15.68 5.098 15.69 5.098 15.69C6.101 15.76 6.629 16.73 6.629 16.73C7.521 18.26 8.97 17.82 9.539 17.56C9.631 16.91 9.889 16.47 10.175 16.22C7.955 15.97 5.62 15.11 5.62 11.37C5.62 10.28 6.01 9.39 6.649 8.69C6.546 8.44 6.203 7.43 6.747 6.06C6.747 6.06 7.584 5.79 9.497 7.05C10.294 6.83 11.147 6.72 12 6.715C12.853 6.72 13.706 6.83 14.503 7.05C16.416 5.79 17.253 6.06 17.253 6.06C17.797 7.43 17.454 8.44 17.351 8.69C17.99 9.39 18.38 10.28 18.38 11.37C18.38 15.12 16.042 15.968 13.817 16.215C14.172 16.53 14.492 17.15 14.492 18.1C14.492 19.47 14.48 20.57 14.48 21C14.48 21.27 14.66 21.585 15.168 21.489C19.138 20.166 22 16.418 22 12C22 6.477 17.523 2 12 2Z" fill="#181717"/>
        </svg>
      ),
      stats: [
        { label: 'Repositories', value: userData.github.repositories },
        { label: 'Stars', value: userData.github.totalStars },
        { label: 'Followers', value: userData.github.followers },
        { label: 'Following', value: userData.github.following }
      ],
      color: 'gray'
    }
  ] : [];

  const getStatusBadge = (status) => {
    const statusConfig = {
      completed: { label: 'SYNCED', color: 'bg-green-50 text-green-700 border border-green-200' },
      failed: { label: 'FAILED', color: 'bg-red-50 text-red-700 border border-red-200' },
      in_progress: { label: 'SYNCING', color: 'bg-blue-50 text-blue-700 border border-blue-200' },
      not_started: { label: 'PENDING', color: 'bg-gray-50 text-gray-600 border border-gray-200' }
    };

    const config = statusConfig[status] || statusConfig.not_started;

    return (
      <span className={`text-xs font-medium ${config.color} px-2 py-1 rounded-md`}>
        {config.label}
      </span>
    );
  };

  const calculateOverallScore = () => {
    if (!userData) return 0;
    return userData.leetcode.totalSolved + 
           userData.codeforces.problemsSolved + 
           userData.atcoder.problemsSolved;
  };
  
  // Animation Variants for staggering animations
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      }
    }
  };
  
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
  };


  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <main className="flex-grow px-4 py-6 md:px-8">
          <motion.div 
            className="flex flex-col items-center justify-center h-[70vh]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <div className="relative">
              <div className="w-16 h-16 border-4 border-gray-200 rounded-full"></div>
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0"></div>
            </div>
            <p className="mt-6 text-lg font-semibold text-gray-900">Loading your dashboard...</p>
            <p className="mt-2 text-sm text-gray-600">Fetching your coding statistics</p>
          </motion.div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <main className="flex-grow px-4 py-6 md:px-8">
          <motion.div 
            className="max-w-2xl mx-auto mt-20"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', delay: 0.1 }}
          >
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-lg">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                <span className="text-2xl font-bold text-red-600">!</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Unable to Load Dashboard</h2>
              <p className="text-gray-600 mb-6">{error}</p>
              <motion.button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Retry Loading
              </motion.button>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white mb-12">
      <main className="px-4 py-6 md:px-8 md:py-8">
        <AnimatePresence mode="wait">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <div className="max-w-7xl mx-auto">
              {/* Header Section */}
              <motion.div 
                className="mb-8"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-md">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <motion.div className="flex-1" variants={itemVariants}>
                      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                        Welcome back, {userData?.name}
                      </h1>
                      <p className="text-gray-600 mb-3">
                        {userData?.department} · Year {userData?.year} · {userData?.college}
                      </p>
                      <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
                        Track your competitive programming progress and coding statistics across multiple platforms.
                      </p>
                    </motion.div>
                    <motion.div 
                      className="bg-gray-50 rounded-lg p-4 text-center border border-gray-200 min-w-[140px]" 
                      variants={itemVariants}
                      whileHover={{ scale: 1.05, boxShadow: '0px 10px 25px rgba(0,0,0,0.1)' }}
                    >
                      <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Total Score</p>
                      <p className="text-3xl font-bold text-gray-900">
                        <AnimatedStat value={calculateOverallScore()} />
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Problems Solved</p>
                    </motion.div>
                  </div>
                </div>
              </motion.div>

              {/* Platform Summary Cards */}
              <motion.div 
                className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {platformStats.map((platform) => (
                  <motion.div 
                    key={platform.title}
                    variants={itemVariants}
                    whileHover={{ y: -8, scale: 1.05, boxShadow: "0px 15px 25px -5px rgba(0,0,0,0.15)" }}
                    transition={{ type: 'spring', stiffness: 300 }}
                    className="bg-white rounded-lg border border-gray-200 p-4 shadow-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        platform.color === 'orange' ? 'bg-orange-50' :
                        platform.color === 'blue' ? 'bg-blue-50' : 'bg-gray-50'
                      }`}>
                        {platform.icon}
                      </div>
                      <div>
                        <p className="text-xl font-semibold text-gray-900">
                            <AnimatedStat value={platform.stats[0].value} />
                        </p>
                        <p className="text-xs text-gray-600">{platform.title}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              {/* Platform Details Grid */}
              <motion.div 
                className="grid grid-cols-1 xl:grid-cols-2 gap-6"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {platformStats.map((platform) => (
                  <motion.div
                    key={platform.title}
                    variants={itemVariants}
                    className="bg-white rounded-xl border border-gray-200 shadow-md transition-shadow duration-300 hover:shadow-xl"
                  >
                    <div className="p-5">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <motion.div 
                            className={`p-2 rounded-lg ${
                              platform.color === 'orange' ? 'bg-orange-50' :
                              platform.color === 'blue' ? 'bg-blue-50' : 'bg-gray-50'
                            }`}
                            whileHover={{ rotate: 15 }}
                          >
                            {platform.icon}
                          </motion.div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                              {platform.title}
                            </h3>
                            <p className="text-xs text-gray-500">{platform.subtitle}</p>
                          </div>
                        </div>
                         <motion.div initial={{scale: 0}} animate={{scale: 1}} transition={{ delay: 0.5, type: 'spring', stiffness: 400 }}>
                           {getStatusBadge(userData.scrapingStatus[platform.title.toLowerCase()] || 'not_started')}
                         </motion.div>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-4">
                        {platform.stats.map((stat, idx) => (
                          <div 
                            key={idx}
                            className="bg-gray-50 rounded-lg p-3 border border-gray-100 hover:bg-gray-100 transition-colors duration-150"
                          >
                            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
                              {stat.label}
                            </p>
                            <p className="text-2xl font-bold text-gray-900">
                              <AnimatedStat value={stat.value} />
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default HomePage;