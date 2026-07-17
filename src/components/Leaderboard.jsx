import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useStudentLeaderboard } from '../hooks/queries/useDashboard';
import { Link } from 'react-router-dom';

// Student-facing leaderboard.
//
// WAS: an onSnapshot listener over the whole `users` collection, sorted and
// ranked in the browser. THREE things were wrong with it:
//
//  1. It leaked. The useEffect returned the unsubscribe from an inner async
//     function, not from the effect itself, so React never received it and the
//     listener was NEVER torn down — one more live Firestore subscription per
//     mount, for the life of the tab.
//  2. Its dep array was empty while it depended on userData.institutionId.
//     userData loads asynchronously, so the listener usually subscribed BEFORE
//     the institution was known — i.e. unscoped — and never re-subscribed.
//  3. It pulled every student to the client to rank them.
//
// NOW: the server ranks and scopes; SSE invalidates this query the moment
// platform_stats changes, so it stays live without polling and without a
// listener to leak.

const Leaderboard = () => {
  const { currentUser, userData } = useAuth();
  const [selectedPlatform, setSelectedPlatform] = useState('leetcode');
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [collegeFilter, setCollegeFilter] = useState('all');
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // Platform configurations - Only 4 platforms
  const platforms = [
    { 
      id: 'leetcode', 
      name: 'LeetCode', 
      color: 'orange',
      metricLabel: 'Problems Solved',
      dataField: 'leetcode',
      metricField: 'totalSolved'
    },
    { 
      id: 'codeforces', 
      name: 'Codeforces', 
      color: 'red',
      metricLabel: 'Problems Solved',
      dataField: 'codeforces',
      metricField: 'problemsSolved'
    },
    { 
      id: 'atcoder', 
      name: 'AtCoder', 
      color: 'blue',
      metricLabel: 'Problems Solved',
      dataField: 'atcoder',
      metricField: 'problemsSolved'
    },
    { 
      id: 'github', 
      name: 'GitHub', 
      color: 'purple',
      metricLabel: 'Repositories',
      dataField: 'github',
      metricField: 'repositories'
    }
  ];

  // College options
  const collegeOptions = [
    { id: 'all', name: 'All Colleges' },
    { id: 'Engineering', name: 'Engineering' },
    { id: 'Technology', name: 'Technology' }
  ];

  // Items per page options
  const itemsPerPageOptions = [10, 20, 50, 100];

  // The server scopes this to the caller's own institution — there is no
  // institutionId to pass and no way to widen it from here.
  const {
    data: board,
    isLoading: loading,
    error: queryError,
  } = useStudentLeaderboard({ platform: selectedPlatform });

  const error = queryError ? 'Failed to load leaderboard data. Please try again.' : null;

  // Rows arrive already ranked by the platform's own metric, and only 'completed'
  // scrapes are included. Reshaped into the { platformData, scrapingStatus } form
  // the rendering below already understands, so the UI is untouched.
  const data = useMemo(
    () =>
      (board?.leaderboard || []).map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        rollNumber: r.rollNumber,
        department: r.department || 'Not Specified',
        college: r.college || 'Engineering',
        year: r.year || 'N/A',
        platformData: { [selectedPlatform]: r.data },
        scrapingStatus: { [selectedPlatform]: 'completed' },
        platformUrls: {},
      })),
    [board, selectedPlatform]
  );

  // Get platform metric value with validation
  const getPlatformMetric = (user, platformId) => {
    const platform = platforms.find(p => p.id === platformId);
    if (!platform || !platform.dataField) return 0;

    const platformData = user.platformData?.[platform.dataField];
    const scrapingStatus = user.scrapingStatus?.[platform.dataField];
    
    // Only return value if scraping was completed successfully
    if (scrapingStatus !== 'completed' || !platformData) {
      return 0;
    }

    const rawValue = platformData[platform.metricField] || 0;
    
    // Validate data to prevent showing unrealistic numbers
    if (platformId === 'leetcode' && rawValue > 3000) {
      console.warn(`Suspicious LeetCode count for ${user.name}: ${rawValue} - hiding from leaderboard`);
      return 0; // Hide suspicious data
    }
    
    if (platformId === 'codeforces' && rawValue > 5000) {
      console.warn(`Suspicious Codeforces count for ${user.name}: ${rawValue} - hiding from leaderboard`);
      return 0; // Hide suspicious data
    }
    
    if (platformId === 'github' && rawValue > 1000) {
      console.warn(`Suspicious GitHub count for ${user.name}: ${rawValue} - hiding from leaderboard`);
      return 0; // Hide suspicious data
    }
    
    if (platformId === 'atcoder' && rawValue > 3000) {
      console.warn(`Suspicious AtCoder count for ${user.name}: ${rawValue} - hiding from leaderboard`);
      return 0; // Hide suspicious data
    }
    
    // Log successful data display
    if (rawValue > 0) {
      console.log(`Displaying ${platformId} data for ${user.name}: ${rawValue}`);
    }

    return rawValue;
  };

  // Get scraping status
  const getScrapingStatus = (user, platformId) => {
    const platform = platforms.find(p => p.id === platformId);
    if (!platform) return 'unknown';
    
    return user.scrapingStatus?.[platform.dataField] || 'not_started';
  };

  // Get unique departments from data
  const departments = useMemo(() => {
    const depts = ['all', ...new Set(data.map(s => s.department).filter(Boolean))];
    return depts;
  }, [data]);

  // Filter and sort data - Sort by metric value (descending), then by name
  const filteredAndSortedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    let filtered = data.filter(user => {
      // Search filter
      const matchesSearch = 
        user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.department?.toLowerCase().includes(searchTerm.toLowerCase());

      // Department filter
      const matchesDepartment = departmentFilter === 'all' || user.department === departmentFilter;
      
      // College filter
      const matchesCollege = collegeFilter === 'all' || user.college === collegeFilter;
      
      // Platform filter - only show users who have valid data for the selected platform
      const platformMetric = getPlatformMetric(user, selectedPlatform);
      const hasPlatformData = platformMetric > 0;
      
      // Additional validation: check if user has platform URL configured
      const platform = platforms.find(p => p.id === selectedPlatform);
      const hasPlatformUrl = platform && user.platformUrls?.[platform.dataField];

      return matchesSearch && matchesDepartment && matchesCollege && hasPlatformData && hasPlatformUrl;
    });

    // Sorting - Primary: by metric (descending), Secondary: by name (alphabetical)
    const sorted = [...filtered].sort((a, b) => {
      const aValue = getPlatformMetric(a, selectedPlatform);
      const bValue = getPlatformMetric(b, selectedPlatform);

      // Primary sort: by metric value (highest to lowest)
      if (aValue !== bValue) {
        return bValue - aValue;
      }
      
      // Secondary sort: by name (alphabetical) when metric values are equal
      return (a.name || '').localeCompare(b.name || '');
    });

    // Add ranks after sorting
    return sorted.map((user, index) => ({
      ...user,
      rank: index + 1,
      isCurrentUser: user.id === currentUser?.uid,
      displayMetric: getPlatformMetric(user, selectedPlatform)
    }));
  }, [data, searchTerm, departmentFilter, collegeFilter, selectedPlatform, currentUser]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentStudents = filteredAndSortedData.slice(startIndex, endIndex);

  // Pagination handlers
  const goToPage = (page) => {
    setCurrentPage(page);
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, departmentFilter, collegeFilter, selectedPlatform]);

  // Get platform label
  const getPlatformLabel = (platformId) => {
    const platform = platforms.find(p => p.id === platformId);
    return platform?.metricLabel || 'Score';
  };

  // Get scraping status badge
  const getScrapingStatusBadge = (user, platformId) => {
    const status = getScrapingStatus(user, platformId);
    if (!status) return null;

    const statusConfig = {
      completed: { label: 'Updated', color: 'bg-green-100 text-green-800' },
      failed: { label: 'Failed', color: 'bg-red-100 text-red-800' },
      in_progress: { label: 'Updating', color: 'bg-blue-100 text-blue-800' },
      not_started: { label: 'Not Started', color: 'bg-gray-100 text-gray-800' }
    };

    const config = statusConfig[status] || statusConfig.not_started;

    return (
      <span className={`ml-2 text-xs ${config.color} px-2 py-1 rounded-full`}>
        {config.label}
      </span>
    );
  };

  // Calculate statistics
  const platformStats = {
    totalStudents: data.length,
    activeStudents: filteredAndSortedData.length,
    departments: departments.length - 1,
    totalMetric: filteredAndSortedData.reduce((sum, s) => sum + (s.displayMetric || 0), 0),
    averageMetric: filteredAndSortedData.length > 0 
      ? Math.round(filteredAndSortedData.reduce((sum, s) => sum + (s.displayMetric || 0), 0) / filteredAndSortedData.length)
      : 0,
    highestScore: filteredAndSortedData.length > 0 ? filteredAndSortedData[0]?.displayMetric || 0 : 0,
    lowestScore: filteredAndSortedData.length > 0 ? filteredAndSortedData[filteredAndSortedData.length - 1]?.displayMetric || 0 : 0
  };

  const currentPlatform = platforms.find(p => p.id === selectedPlatform) || platforms[0];

  if (!currentUser) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600 mb-6">
            Please sign in to view the leaderboard and track your progress.
          </p>
          <Link
            to="/signin"
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold inline-block"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md">
          <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          {/* <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 bg-gradient-to-r from-gray-900 to-blue-700 bg-clip-text text-transparent">
            Coding Leaderboard
          </h1> */}
          <p className="text-xl text-gray-900 max-w-2xl mx-auto">
            Track your progress across LeetCode, Codeforces, AtCoder, and GitHub
          </p>
        </motion.div>

        {/* Loading State */}
        {loading && data.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center p-16"
          >
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-blue-600 mb-4"></div>
              <p className="text-gray-600 font-semibold text-lg">Loading leaderboard data...</p>
            </div>
          </motion.div>
        )}

        {/* Main Content */}
        {!loading && (
          <>
            {/* Stats Overview */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
            >
              {[
                { label: 'Total Coders', value: platformStats.totalStudents, color: 'blue' },
                { label: `Active on ${currentPlatform.name}`, value: platformStats.activeStudents, color: 'green' },
                { label: 'Highest Score', value: platformStats.highestScore, color: 'purple' },
                { label: 'Average Score', value: platformStats.averageMetric, color: 'orange' }
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="bg-white rounded-xl shadow-lg p-6 border border-gray-200"
                >
                  <p className="text-sm font-semibold text-gray-600 mb-2">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value.toLocaleString()}</p>
                  <div className={`w-12 h-1 bg-${stat.color}-500 rounded-full mt-2`} />
                </motion.div>
              ))}
            </motion.div>

            {/* Controls Section */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200"
            >
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Rankings</h2>
                  <p className="text-gray-600">
                    {filteredAndSortedData.length} coders found • Sorted by {currentPlatform.metricLabel.toLowerCase()} (highest to lowest)
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Search */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search coders..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white w-full sm:w-64"
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>

                  {/* Items per page */}
                  <select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    {itemsPerPageOptions.map(option => (
                      <option key={option} value={option}>
                        {option} per page
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Filters Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Platform Filters */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Platform:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {platforms.map((platform) => (
                      <motion.button
                        key={platform.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedPlatform(platform.id)}
                        className={`px-3 py-2 rounded-lg border transition-all duration-200 font-medium text-sm ${
                          selectedPlatform === platform.id
                            ? `bg-${platform.color}-500 text-white border-${platform.color}-500 shadow-md`
                            : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {platform.name}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Department Filter */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Department:
                  </label>
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    {departments.map(dept => (
                      <option key={dept} value={dept}>
                        {dept === 'all' ? 'All Departments' : dept}
                      </option>
                    ))}
                  </select>
                </div>

                {/* College Filter */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    College:
                  </label>
                  <select
                    value={collegeFilter}
                    onChange={(e) => setCollegeFilter(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    {collegeOptions.map(college => (
                      <option key={college.id} value={college.id}>
                        {college.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>

            {/* Leaderboard Table */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200"
            >
              {/* Table Header */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Rank
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Coder
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider hidden lg:table-cell">
                        Department
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider hidden md:table-cell">
                        College
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                        {getPlatformLabel(selectedPlatform)}
                      </th>
                    </tr>
                  </thead>
                  
                  <tbody className="divide-y divide-gray-200">
                    <AnimatePresence>
                      {currentStudents.map((user, index) => {
                        const globalRank = startIndex + index + 1;
                        const isTopThree = globalRank <= 3;
                        
                        return (
                          <motion.tr
                            key={user.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ delay: index * 0.05 }}
                            whileHover={{ 
                              backgroundColor: "rgba(249, 250, 251, 0.8)",
                              transition: { duration: 0.2 }
                            }}
                            className={`relative transition-all duration-200 ${
                              user.isCurrentUser
                                ? 'bg-blue-50 border-l-4 border-l-blue-500'
                                : ''
                            }`}
                          >
                            {/* Rank */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <motion.div
                                whileHover={{ scale: 1.1 }}
                                className={`flex items-center justify-center w-10 h-10 rounded-xl border-2 font-bold text-sm ${
                                  isTopThree 
                                    ? 'border-yellow-400 bg-yellow-50 text-yellow-700 shadow-sm' 
                                    : 'border-gray-200 bg-white text-gray-700'
                                }`}
                              >
                                {globalRank}
                                {isTopThree && (
                                  <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="ml-1 text-xs"
                                  >
                                    ★
                                  </motion.span>
                                )}
                              </motion.div>
                            </td>
                            
                            {/* User Info */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-4">
                                <motion.div
                                  whileHover={{ scale: 1.1, rotate: 5 }}
                                  className="relative"
                                >
                                  {/* <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                    {user.name?.charAt(0).toUpperCase() || '?'}
                                  </div> */}
                                  {user.isCurrentUser && (
                                    <motion.div
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                                    >
                                      <span className="text-xs font-bold text-white">✓</span>
                                    </motion.div>
                                  )}
                                </motion.div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-base font-bold text-gray-900 truncate">
                                    {user.name || 'Unknown User'}
                                    {user.isCurrentUser && (
                                      <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm text-gray-500 truncate">
                                    {user.email || 'No email'}
                                  </div>
                                  <div className="text-xs text-gray-400 lg:hidden">
                                    {user.department} • Year {user.year}
                                  </div>
                                </div>
                              </div>
                            </td>
                            
                            {/* Department */}
                            <td className="px-6 py-4 hidden lg:table-cell">
                              <div className="text-sm font-semibold text-gray-900">
                                {user.department}
                              </div>
                              <div className="text-xs text-gray-500">
                                Year {user.year}
                              </div>
                            </td>

                            {/* College */}
                            <td className="px-6 py-4 hidden md:table-cell">
                              <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                user.college === 'Engineering' 
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-green-100 text-green-800 border border-green-200'
                              }`}>
                                {user.college}
                              </div>
                            </td>
                            
                            {/* Metric Value */}
                            <td className="px-6 py-4 text-right">
                              <motion.div
                                initial={{ scale: 0.8 }}
                                animate={{ scale: 1 }}
                                className="text-xl font-bold text-gray-900"
                              >
                                {user.displayMetric.toLocaleString()}
                              </motion.div>
                              <div className="text-xs text-gray-500 mt-1">
                                {getPlatformLabel(selectedPlatform)}
                              </div>
                              {/* {getScrapingStatusBadge(user, selectedPlatform)} */}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              {/* Empty State */}
              {filteredAndSortedData.length === 0 && !loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-16 text-center"
                >
                  <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">No Coders Found</h3>
                  <p className="text-gray-600 mb-4">
                    Try adjusting your search or filters to find more results.
                  </p>
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setDepartmentFilter('all');
                      setCollegeFilter('all');
                    }}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold"
                  >
                    Clear All Filters
                  </button>
                </motion.div>
              )}

              {/* Pagination */}
              {filteredAndSortedData.length > 0 && (
                <div className="flex flex-col sm:flex-row justify-between items-center p-6 border-t border-gray-200 bg-gray-50">
                  <div className="text-sm text-gray-700 mb-4 sm:mb-0">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredAndSortedData.length)} of {filteredAndSortedData.length} coders
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={goToPrevPage}
                      disabled={currentPage === 1}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        currentPage === 1
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Previous
                    </button>
                    
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <button
                            key={pageNum}
                            onClick={() => goToPage(pageNum)}
                            className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
                              currentPage === pageNum
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    
                    <button
                      onClick={goToNextPage}
                      disabled={currentPage === totalPages}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        currentPage === totalPages
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;