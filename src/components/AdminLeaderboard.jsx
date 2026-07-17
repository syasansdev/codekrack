// AdminLeaderboard.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAdminScope } from '../hooks/useAdminScope';
import { useLeaderboard } from '../hooks/queries/useDashboard';
import { useRescrapeStudent } from '../hooks/queries/useStudents';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import StudentViewDetails from './StudentViewDetails';
import { motion, AnimatePresence } from 'framer-motion';
import BackButton from './BackButton';

const AdminLeaderboard = () => {
  // students / loading / lastScraped are derived from the query below — server
  // state has one home, and it isn't useState.
  const [activeBoard, setActiveBoard] = useState('leetcode');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [collegeFilter, setCollegeFilter] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [hoveredStudent, setHoveredStudent] = useState(null);
  const [autoScraping, setAutoScraping] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState({ completed: 0, total: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const containerRef = useRef(null);
  const tableContainerRef = useRef(null);
  const rescrape = useRescrapeStudent();
  const { realtime } = useAuth();

  // Platform configurations
  const boards = [
    { 
      id: 'leetcode', 
      name: 'LeetCode', 
      metricLabel: 'Problems Solved',
      statusField: 'leetcodeStatus',
      dataField: 'leetcode',
      metricField: 'totalSolved'
    },
    { 
      id: 'github', 
      name: 'GitHub', 
      metricLabel: 'Repositories',
      statusField: 'githubStatus',
      dataField: 'github',
      metricField: 'repositories'
    },
    { 
      id: 'codeforces', 
      name: 'Codeforces', 
      metricLabel: 'Problems Solved',
      statusField: 'codeforcesStatus',
      dataField: 'codeforces',
      metricField: 'problemsSolved'
    },
    { 
      id: 'atcoder', 
      name: 'AtCoder', 
      metricLabel: 'Problems Solved',
      statusField: 'atcoderStatus',
      dataField: 'atcoder',
      metricField: 'problemsSolved'
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

  // Institution admins only ever see their own institution's students.
  const { institutionId } = useAdminScope();

  // Live leaderboard, without a Firestore listener.
  //
  // WHAT THIS REPLACES — the old onSnapshot did something genuinely dangerous:
  // its callback called startAutoScraping(), which scraped every student from
  // the ADMIN'S BROWSER and wrote the results back to Firestore... which fired
  // the same snapshot again. The only thing standing between that and an
  // infinite scrape loop was a localStorage timestamp ("once per hour"). Clear
  // your browser storage, or open two admin tabs, and it runs away — hammering
  // LeetCode/GitHub from the admin's IP until something rate-limits them.
  //
  // Scraping is now the GitHub Action's job. This screen only reads. It stays
  // live because a platform_stats change fires a Postgres NOTIFY, Express pushes
  // an SSE `invalidate`, and React Query refetches this query — no listener, no
  // loop, no browser scraping.
  const {
    data: board,
    isLoading: loading,
    isFetching,
    error: boardError,
    dataUpdatedAt,
  } = useLeaderboard({ platform: activeBoard, institutionId });

  // Rows arrive ranked by the platform's own metric, filtered to completed
  // scrapes. Reshaped into the { platformData, scrapingStatus } form the table
  // below already renders.
  const students = useMemo(
    () =>
      (board?.leaderboard || []).map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        rollNumber: r.rollNumber,
        department: r.department || 'Not Specified',
        college: r.college || 'Engineering',
        year: r.year || 'N/A',
        institutionName: r.institutionName,
        platformData: { [activeBoard]: r.data },
        scrapingStatus: { [activeBoard]: 'completed' },
        platformUrls: {},
      })),
    [board, activeBoard]
  );

  const lastScraped = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString() : null;

  useEffect(() => {
    if (boardError) toast.error('Failed to load leaderboard data');
  }, [boardError]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [departmentFilter, collegeFilter, activeBoard]);

  // Queues every student in view for the next scraper run, instead of scraping
  // them here. Results arrive over SSE when the Action finishes.
  const handleManualRefresh = async () => {
    const ids = students.map((s) => s.id);
    if (!ids.length) {
      toast.info('No students to refresh');
      return;
    }
    setAutoScraping(true);
    setScrapingProgress({ completed: 0, total: ids.length });
    let queued = 0;
    for (const id of ids) {
      try {
        await rescrape.mutateAsync(id);
        queued++;
      } catch {
        // One student failing to queue must not abort the rest.
      }
      setScrapingProgress({ completed: queued, total: ids.length });
    }
    setAutoScraping(false);
    toast.success(`Queued ${queued} student(s) for the next scraper run`);
  };


  // Extract metric value based on platform
  const getMetricValue = (student, boardId) => {
    const board = boards.find(b => b.id === boardId);
    if (!board) return 0;

    const platformData = student.platformData?.[board.dataField];
    const scrapingStatus = student.scrapingStatus?.[board.dataField];
    
    if (scrapingStatus !== 'completed' || !platformData) {
      return 0;
    }

    return platformData[board.metricField] || 0;
  };

  // Get scraping status
  const getScrapingStatus = (student, boardId) => {
    const board = boards.find(b => b.id === boardId);
    if (!board) return 'unknown';
    return student.scrapingStatus?.[board.dataField] || 'not_started';
  };

  // Get unique departments
  const departments = ['all', ...new Set(students.map(s => s.department).filter(Boolean))];

  // Filter and sort students
  const filteredAndSortedStudents = students
    .filter(s => {
      const departmentMatch = departmentFilter === 'all' || s.department === departmentFilter;
      const collegeMatch = collegeFilter === 'all' || s.college === collegeFilter;
      return departmentMatch && collegeMatch;
    })
    .map(s => ({
      ...s,
      metricValue: getMetricValue(s, activeBoard),
      scrapingStatus: getScrapingStatus(s, activeBoard)
    }))
    .sort((a, b) => {
      if (b.metricValue !== a.metricValue) {
        return b.metricValue - a.metricValue;
      }
      return (a.name || '').localeCompare(b.name || '');
    });

  // Pagination calculations
  const activeStudents = filteredAndSortedStudents.filter(s => s.metricValue > 0);
  const totalPages = Math.ceil(activeStudents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentStudents = activeStudents.slice(startIndex, endIndex);

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

  // Get status style
  const getStatusStyle = (status) => {
    switch (status) {
      case 'completed':
        return { 
          label: 'Updated',
          className: 'bg-green-100 text-green-800 border-green-200'
        };
      case 'failed':
        return { 
          label: 'Failed',
          className: 'bg-red-100 text-red-800 border-red-200'
        };
      case 'in_progress':
        return { 
          label: 'Updating',
          className: 'bg-blue-100 text-blue-800 border-blue-200'
        };
      default:
        return { 
          label: 'Not Started',
          className: 'bg-gray-100 text-gray-800 border-gray-200'
        };
    }
  };

  // Calculate statistics
  const platformStats = {
    totalStudents: students.length,
    activeStudents: activeStudents.length,
    departments: departments.length - 1,
    totalMetric: activeStudents.reduce((sum, s) => sum + s.metricValue, 0),
    averageMetric: activeStudents.length > 0 
      ? Math.round(activeStudents.reduce((sum, s) => sum + s.metricValue, 0) / activeStudents.length)
      : 0,
    scrapingStats: {
      completed: activeStudents.filter(s => s.scrapingStatus === 'completed').length,
      failed: activeStudents.filter(s => s.scrapingStatus === 'failed').length,
      in_progress: activeStudents.filter(s => s.scrapingStatus === 'in_progress').length,
    },
    collegeStats: {
      engineering: students.filter(s => s.college === 'Engineering').length,
      technology: students.filter(s => s.college === 'Technology').length
    }
  };

  const currentBoard = boards.find(b => b.id === activeBoard);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100
      }
    }
  };

  const cardVariants = {
    hidden: { scale: 0.9, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 200
      }
    },
    hover: {
      scale: 1.02,
      transition: {
        type: "spring",
        stiffness: 400
      }
    }
  };

  return (
    <>
      <BackButton to="/admin/dashboard" />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto" ref={containerRef}>
        {/* Header Section */}
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100 }}
          className="mb-12 text-center"
        >
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-4 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
            Leaderboards
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Real-time tracking of student performance across competitive programming platforms
          </p>
        </motion.div>

        

        {/* Last Updated Info */}
        {lastScraped && !autoScraping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-green-50 border border-green-200 rounded-xl p-4 mb-8"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-800 font-medium">Data automatically updated</span>
              </div>
              <span className="text-green-700 text-sm">Last scraped: {lastScraped}</span>
            </div>
          </motion.div>
        )}

        {/* Stats Overview */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-12"
        >
          {[
            { label: 'Total Students', value: platformStats.totalStudents, color: 'from-blue-500 to-blue-600' },
            { label: `Active on ${currentBoard.name}`, value: platformStats.activeStudents, color: 'from-green-500 to-green-600' },
            { label: 'Departments', value: platformStats.departments, color: 'from-purple-500 to-purple-600' },
            { label: 'Top Score', value: activeStudents[0]?.metricValue || 0, color: 'from-orange-500 to-orange-600' }
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200 relative overflow-hidden group"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
              <p className="text-sm font-semibold text-gray-600 mb-2">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-900">{stat.value.toLocaleString()}</p>
              <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-gray-200 to-gray-300" />
            </motion.div>
          ))}
        </motion.div>

       

        {/* Platform Selection & Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-lg p-8 mb-8 border border-gray-200"
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Platform Selection</h2>
              <p className="text-gray-600">Choose a platform to view rankings</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                  Department:
                </label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
                >
                  {departments.map(dept => (
                    <option key={dept} value={dept}>
                      {dept === 'all' ? 'All Departments' : dept}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-4">
                <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                  College:
                </label>
                <select
                  value={collegeFilter}
                  onChange={(e) => setCollegeFilter(e.target.value)}
                  className="px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
                >
                  {collegeOptions.map(college => (
                    <option key={college.id} value={college.id}>
                      {college.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {boards.map((board, index) => (
              <motion.button
                key={board.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveBoard(board.id)}
                className={`p-6 rounded-xl border-2 transition-all duration-300 text-left group ${
                  activeBoard === board.id
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-lg font-bold transition-colors ${
                    activeBoard === board.id ? 'text-blue-700' : 'text-gray-700'
                  }`}>
                    {board.name}
                  </span>
                  <div className={`w-3 h-3 rounded-full transition-colors ${
                    activeBoard === board.id ? 'bg-blue-500' : 'bg-gray-300'
                  }`} />
                </div>
                <div className="text-sm text-gray-500 mb-2">
                  {board.metricLabel}
                </div>
                <div className="text-xs text-gray-400">
                  {students.filter(s => getScrapingStatus(s, board.id) === 'completed').length} students
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
       

        {/* Leaderboard Table */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200"
        >
          <div className="p-8 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {currentBoard.name} Rankings
                </h2>
                <p className="text-gray-600">
                  {platformStats.activeStudents} active students • 
                  Average score: {platformStats.averageMetric.toLocaleString()} • 
                  {collegeFilter === 'all' ? ' All Colleges' : ` ${collegeOptions.find(c => c.id === collegeFilter)?.name}`}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                  Total: {platformStats.totalMetric.toLocaleString()} {currentBoard.metricLabel.toLowerCase()}
                </span>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {loading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-16 text-center"
              >
                <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-blue-600 mb-4"></div>
                <p className="text-gray-600 font-semibold text-lg">Loading leaderboard data...</p>
              </motion.div>
            ) : platformStats.activeStudents === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="p-16 text-center"
              >
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">No Data Available</h3>
                <p className="text-gray-600 mb-4">
                  No students found for the selected filters on {currentBoard.name}.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={() => {
                      setDepartmentFilter('all');
                      setCollegeFilter('all');
                    }}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold"
                  >
                    Reset Filters
                  </button>
                  <Link
                    to="/admin/students"
                    className="px-6 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-colors font-semibold"
                  >
                    Manage Students
                  </Link>
                </div>
              </motion.div>
            ) : (
              <>
                {/* Pagination Controls - Top */}
                <div className="flex flex-col sm:flex-row justify-between items-center p-6 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center gap-4 mb-4 sm:mb-0">
                    <span className="text-sm text-gray-700 font-medium">
                      Showing {startIndex + 1}-{Math.min(endIndex, activeStudents.length)} of {activeStudents.length} students
                    </span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                    >
                      {itemsPerPageOptions.map(option => (
                        <option key={option} value={option}>
                          {option} per page
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={goToPrevPage}
                      disabled={currentPage === 1}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        currentPage === 1
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
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
                      
                      {totalPages > 5 && currentPage < totalPages - 2 && (
                        <>
                          <span className="px-2 text-gray-500">...</span>
                          <button
                            onClick={() => goToPage(totalPages)}
                            className="w-10 h-10 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50"
                          >
                            {totalPages}
                          </button>
                        </>
                      )}
                    </div>
                    
                    <button
                      onClick={goToNextPage}
                      disabled={currentPage === totalPages}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        currentPage === totalPages
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>

                {/* Table Container - No Scroll */}
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  ref={tableContainerRef}
                  className="overflow-x-auto relative"
                >
                  <table className="w-full">
                    <thead className="sticky top-0 bg-gray-50 z-10">
                      <tr className="border-b border-gray-200">
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider bg-gray-50">
                          Rank
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider bg-gray-50">
                          Student
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider bg-gray-50 hidden lg:table-cell">
                          Department
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider bg-gray-50 hidden md:table-cell">
                          College
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider bg-gray-50">
                          {currentBoard.metricLabel}
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider bg-gray-50">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      <AnimatePresence>
                        {currentStudents.map((student, index) => {
                          const globalRank = startIndex + index + 1;
                          const statusStyle = getStatusStyle(student.scrapingStatus);
                          const isTopThree = globalRank <= 3;
                          
                          return (
                            <motion.tr
                              key={student.id}
                              variants={itemVariants}
                              initial="hidden"
                              animate="visible"
                              exit="hidden"
                              whileHover={{ 
                                scale: 1.01,
                                backgroundColor: "rgba(249, 250, 251, 0.8)",
                                transition: { type: "spring", stiffness: 400 }
                              }}
                              onHoverStart={() => setHoveredStudent(student.id)}
                              onHoverEnd={() => setHoveredStudent(null)}
                              className={`relative transition-all duration-300 ${
                                isTopThree ? 'bg-gradient-to-r from-gray-50 to-white' : ''
                              }`}
                            >
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
                                </motion.div>
                              </td>
                              
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-4">
                                  <motion.div
                                    whileHover={{ scale: 1.1, rotate: 5 }}
                                    className="relative"
                                  >
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                      {student.name?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                    {isTopThree && (
                                      <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center"
                                      >
                                        <span className="text-xs font-bold text-white">★</span>
                                      </motion.div>
                                    )}
                                  </motion.div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-base font-bold text-gray-900 truncate">
                                      {student.name}
                                    </div>
                                    <div className="text-sm text-gray-500 truncate">
                                      {student.email}
                                    </div>
                                    <div className="text-xs text-gray-400 lg:hidden">
                                      {student.department} • {student.college}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              
                              <td className="px-6 py-4 hidden lg:table-cell">
                                <div className="text-sm font-semibold text-gray-900">
                                  {student.department || 'N/A'}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Year {student.year || 'N/A'}
                                </div>
                              </td>

                              <td className="px-6 py-4 hidden md:table-cell">
                                <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                  student.college === 'Engineering' 
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : 'bg-green-100 text-green-800 border border-green-200'
                                }`}>
                                  {student.college}
                                </div>
                              </td>
                              
                              <td className="px-6 py-4 text-right">
                                <motion.div
                                  initial={{ scale: 0.8 }}
                                  animate={{ scale: 1 }}
                                  className="text-xl font-bold text-gray-900"
                                >
                                  {student.metricValue.toLocaleString()}
                                </motion.div>
                                {isTopThree && (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className="text-xs text-yellow-600 font-semibold mt-1"
                                  >
                                    Top Performer
                                  </motion.div>
                                )}
                              </td>
                              
                              <td className="px-6 py-4">
                                <div className="flex justify-end gap-2">
                                  <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setSelectedStudent(student)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold shadow-md"
                                  >
                                    View Details
                                  </motion.button>
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </motion.div>

                {/* Pagination Controls - Bottom */}
                <div className="flex flex-col sm:flex-row justify-between items-center p-6 border-t border-gray-200 bg-gray-50">
                  <div className="text-sm text-gray-700 mb-4 sm:mb-0">
                    Showing {startIndex + 1}-{Math.min(endIndex, activeStudents.length)} of {activeStudents.length} students
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={goToPrevPage}
                      disabled={currentPage === 1}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        currentPage === 1
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
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
                      
                      {totalPages > 5 && currentPage < totalPages - 2 && (
                        <>
                          <span className="px-2 text-gray-500">...</span>
                          <button
                            onClick={() => goToPage(totalPages)}
                            className="w-10 h-10 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50"
                          >
                            {totalPages}
                          </button>
                        </>
                      )}
                    </div>
                    
                    <button
                      onClick={goToNextPage}
                      disabled={currentPage === totalPages}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        currentPage === totalPages
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Top Performers Section */}
        {!loading && platformStats.activeStudents > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="mt-12 bg-white rounded-2xl shadow-lg p-8 border border-gray-200"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Top Performers</h3>
                <p className="text-gray-600">
                  Celebrating excellence in {currentBoard.name} • 
                  {collegeFilter === 'all' ? ' All Colleges' : ` ${collegeOptions.find(c => c.id === collegeFilter)?.name}`}
                </p>
              </div>
              <div className="text-sm text-gray-500 bg-gray-100 px-4 py-2 rounded-full">
                {departmentFilter === 'all' ? 'All Departments' : departmentFilter}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {activeStudents
                .slice(0, 3)
                .map((student, index) => {
                  const rank = index + 1;
                  const statusStyle = getStatusStyle(student.scrapingStatus);
                  
                  return (
                    <motion.div
                      key={student.id}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      whileHover="hover"
                      className={`p-8 rounded-2xl border-2 text-center relative overflow-hidden ${
                        rank === 1 
                          ? 'border-yellow-400 bg-gradient-to-br from-yellow-50 to-yellow-100 shadow-xl' 
                          : rank === 2
                          ? 'border-gray-300 bg-gradient-to-br from-gray-50 to-gray-100 shadow-lg'
                          : 'border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100 shadow-md'
                      }`}
                    >
                      {/* Rank Badge */}
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 200, delay: index * 0.2 }}
                        className={`absolute -top-4 -right-4 w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg ${
                          rank === 1 ? 'bg-yellow-500' :
                          rank === 2 ? 'bg-gray-500' :
                          'bg-orange-500'
                        }`}
                      >
                        #{rank}
                      </motion.div>
                      
                      {/* Student Info */}
                      <h4 className="text-xl font-bold text-gray-900 mb-2 truncate">
                        {student.name}
                      </h4>
                      <p className="text-sm text-gray-600 mb-1 truncate">
                        {student.department}
                      </p>
                      <p className="text-xs text-gray-500 mb-4">
                        {student.college} • Year {student.year}
                      </p>
                      
                      {/* Status */}
                      <motion.span
                        whileHover={{ scale: 1.05 }}
                        className={`inline-flex items-center px-4 py-1 rounded-full text-sm font-semibold border mb-4 ${statusStyle.className}`}
                      >
                        {statusStyle.label}
                      </motion.span>
                      
                      {/* Metric */}
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.5 + index * 0.1 }}
                        className={`text-4xl font-bold mb-2 ${
                          rank === 1 ? 'text-yellow-600' :
                          rank === 2 ? 'text-gray-600' :
                          'text-orange-600'
                        }`}
                      >
                        {student.metricValue.toLocaleString()}
                      </motion.div>
                      <p className="text-sm text-gray-500 mb-6">
                        {currentBoard.metricLabel.toLowerCase()}
                      </p>
                      
                      {/* Action Button */}
                      <motion.button
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSelectedStudent(student)}
                        className="w-full px-6 py-3 bg-white text-gray-700 border border-gray-300 rounded-xl hover:border-blue-500 hover:text-blue-600 transition-all font-semibold shadow-sm hover:shadow-md"
                      >
                        View Full Profile
                      </motion.button>
                    </motion.div>
                  );
                })}
            </div>
          </motion.div>
        )}

        {/* Quick Actions */}
        {!loading && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            <motion.div
              whileHover={{ scale: 1.02, y: -5 }}
              className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200 text-center group cursor-pointer"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-3">Manage Students</h3>
              <p className="text-gray-600 mb-6">View and edit all student profiles and data</p>
              <Link
                to="/admin/students"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold shadow-lg hover:shadow-xl"
              >
                View Students
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Link>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02, y: -5 }}
              className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200 text-center group cursor-pointer"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-3">Add Student</h3>
              <p className="text-gray-600 mb-6">Register new students to the platform</p>
              <Link
                to="/admin/add-student"
                className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold shadow-lg hover:shadow-xl"
              >
                Add New
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </Link>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02, y: -5 }}
              className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200 text-center group cursor-pointer"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-3">Refresh Data</h3>
              <p className="text-gray-600 mb-6">Update all platform data with latest scraping</p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleManualRefresh}
                disabled={autoScraping}
                className={`inline-flex items-center gap-2 px-6 py-3 font-semibold shadow-lg hover:shadow-xl rounded-xl transition-colors ${
                  autoScraping 
                    ? 'bg-gray-400 text-white cursor-not-allowed' 
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {autoScraping ? 'Scraping...' : 'Refresh Now'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* Student Details Modal */}
      <AnimatePresence>
        {selectedStudent && (
          <StudentViewDetails 
            student={selectedStudent} 
            onClose={() => setSelectedStudent(null)}
          />
        )}
      </AnimatePresence>
      </div>
    </>
  );
};

export default AdminLeaderboard;