// ============================================
// FILE: src/components/StudentList.jsx - COMPLETE FILE
// ============================================
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminScope } from '../hooks/useAdminScope';
import { useStudents, useRescrapeStudent } from '../hooks/queries/useStudents';
import { toast } from 'react-toastify';
import StudentViewDetails from './StudentViewDetails';
import { motion, AnimatePresence } from 'framer-motion';
import BackButton from './BackButton';

// Scraping is triggered here, but no longer PERFORMED here. The old version
// imported browser scrapers from ../utils/scrapers and called each platform's
// API from the admin's laptop, then wrote the results straight to Firestore.
// That approach had a few problems: it needed CORS proxies, it burned the
// admin's IP against each platform's rate limit, it only ran while someone had
// the tab open, and it let the browser write leaderboard numbers directly.
// It was also quietly broken — line ~111 called scrapeHackerRank(), which was
// commented out of the import above, so any student with a HackerRank URL hit a
// ReferenceError that the surrounding try/catch swallowed and reported as
// "failed". Now this just marks the platforms pending; the GitHub Action scrapes
// them server-side and the results arrive over SSE.

const StudentList = () => {
  // students / loading / isRefreshing now come from React Query below — they are
  // server state, and keeping a second copy in useState is what made them go
  // stale in the first place. Only genuine client state lives here.
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterCollege, setFilterCollege] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [scrapingStatus, setScrapingStatus] = useState({});
  
  // The server scopes this to the caller's institution; institutionId is only a
  // filter hint for super-admins.
  const { institutionId } = useAdminScope();
  const { data: students = [], isLoading: loading, isFetching, error, refetch } = useStudents({ institutionId });
  const rescrape = useRescrapeStudent();
  const isRefreshing = isFetching && !loading;

  if (error) toast.error('Failed to load students: ' + error.message);
  
  const handleInitiateScraping = async (studentId, platformUrls) => {
    if (!platformUrls || Object.values(platformUrls).every((url) => !url)) {
      toast.error('No profile URLs found for this student');
      return;
    }

    try {
      setScrapingStatus((prev) => ({ ...prev, [studentId]: 'scraping' }));
      // Mark this student's platforms pending. The GitHub Action picks them up
      // and writes the results to Postgres; a NOTIFY trigger then pushes an SSE
      // event and this list refreshes itself. Nothing is scraped in the browser.
      const res = await rescrape.mutateAsync(studentId);
      setScrapingStatus((prev) => ({ ...prev, [studentId]: 'queued' }));
      toast.success(
        `Queued ${res.queued} platform${res.queued === 1 ? '' : 's'} for the next scraper run`
      );
    } catch (error) {
      setScrapingStatus((prev) => ({ ...prev, [studentId]: 'failed' }));
      toast.error('Could not queue scraping: ' + error.message);
    }
  };

  // const handleViewDetails = (student) => {
  //   setSelectedStudent(student);
  //   setShowModal(true);
  // };

  // In your StudentList.jsx, update the handleViewDetails function:

const handleViewDetails = async (student) => {
  setSelectedStudent(student);
  setShowModal(true);
  
  // Auto-scrape data when viewing student details
  if (student.platformUrls && Object.values(student.platformUrls).some(url => url)) {
    await handleInitiateScraping(student.id, student.platformUrls);
  }
};

  const closeModal = () => {
    setShowModal(false);
    setSelectedStudent(null);
  };
  
  const filteredStudents = students.filter(student => {
    const matchesSearch = searchTerm === '' || 
      student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (student.registerNumber && student.registerNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (student.rollNumber && student.rollNumber.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesDepartment = filterDepartment === '' || student.department === filterDepartment;
    const matchesYear = filterYear === '' || student.year === filterYear;
    const matchesCollege = filterCollege === '' || student.college === filterCollege;
    
    return matchesSearch && matchesDepartment && matchesYear && matchesCollege;
  });
  
  const departments = [...new Set(students.map(s => s.department).filter(Boolean))];
  const years = [...new Set(students.map(s => s.year).filter(Boolean))].sort();
  const colleges = [...new Set(students.map(s => s.college).filter(Boolean))];

  const PlatformIcon = ({ platform }) => {
    const icons = {
      github: (
        <svg className="w-5 h-5" fill="#181717" viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
        </svg>
      ),
      leetcode: (
        <svg className="w-5 h-5" fill="#FFA116" viewBox="0 0 24 24">
          <path d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 1.271 1.818l4.277 4.193.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .066-.523 2.545 2.545 0 0 1 .619-1.164L9.13 8.114c1.058-1.134 3.204-1.27 4.43-.278l3.501 2.831c.593.48 1.461.387 1.94-.207a1.384 1.384 0 0 0-.207-1.943l-3.5-2.831c-.8-.647-1.766-1.045-2.774-1.202l2.015-2.158A1.384 1.384 0 0 0 13.483 0zm-2.866 12.815a1.38 1.38 0 0 0-1.38 1.382 1.38 1.38 0 0 0 1.38 1.382H20.79a1.38 1.38 0 0 0 1.38-1.382 1.38 1.38 0 0 0-1.38-1.382z"/>
        </svg>
      ),
      codeforces: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 7.5C5.328 7.5 6 8.172 6 9v10.5c0 .828-.672 1.5-1.5 1.5h-3C.672 21 0 20.328 0 19.5V9c0-.828.672-1.5 1.5-1.5h3Z" fill="#1F8ACB"/><path d="M13.5 3c.828 0 1.5.672 1.5 1.5v15c0 .828-.672 1.5-1.5 1.5h-3c-.828 0-1.5-.672-1.5-1.5v-15c0-.828.672-1.5 1.5-1.5h3Z" fill="#1F8ACB"/><path d="M22.5 10.5c.828 0 1.5.672 1.5 1.5v7.5c0 .828-.672 1.5-1.5 1.5h-3c-.828 0-1.5-.672-1.5-1.5V12c0-.828.672-1.5 1.5-1.5h3Z" fill="#1F8ACB"/></svg>
      ),
      hackerrank: (
        <svg className="w-5 h-5" fill="#00EA64" viewBox="0 0 24 24">
          <path d="M12 0c1.285 0 9.75 4.886 10.392 6 .645 1.115.645 10.885 0 12S13.287 24 12 24s-9.75-4.885-10.395-6c-.641-1.115-.641-10.885 0-12C2.25 4.886 10.715 0 12 0zm2.295 6.799c-.141 0-.258.115-.258.258v3.875H9.963V6.908c0-.141-.116-.258-.258-.258H8.279c-.141 0-.258.115-.258.258v10.018c0 .143.117.258.258.258h1.426c.142 0 .258-.115.258-.258v-4.09h4.074v4.09c0 .143.116.258.258.258h1.426c.141 0 .258-.115.258-.258V6.908c0-.141-.117-.258-.258-.258h-1.426z"/>
        </svg>
      ),
      atcoder: (
        <svg className="w-5 h-5" fill="#000000" viewBox="0 0 24 24">
          <path d="M12 0l-8 4v8l8 4 8-4V4l-8-4zm0 2.208L17.385 5 12 7.792 6.615 5 12 2.208zM5 6.5l6 3v7l-6-3v-7zm8 10v-7l6-3v7l-6 3z"/>
        </svg>
      ),
      linkedin: (
        <svg className="w-5 h-5" fill="#0A66C2" viewBox="0 0 24 24">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      )
    };
    
    return icons[platform] || null;
  };
  
  return (
    <motion.div
      className="min-h-screen bg-slate-50 p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="max-w-7xl mx-auto">
        <BackButton to="/admin/dashboard" />
        <motion.div 
          className="mb-8"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">Student Directory</h1>
              <p className="text-slate-600">Manage student profiles and track coding platform activities</p>
            </div>
            <div className="flex gap-3">
              <motion.button
                onClick={() => refetch()}
                className={`px-6 py-3 bg-white text-slate-700 border-2 border-slate-300 rounded-lg transition-all font-semibold flex items-center gap-2 hover:shadow-md ${isRefreshing ? 'border-blue-500' : 'hover:border-blue-500 hover:text-blue-600'}`}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                disabled={isRefreshing}
              >
                <motion.svg 
                  className={`w-5 h-5 ${isRefreshing ? 'text-blue-600' : 'text-slate-500'}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  animate={{ rotate: isRefreshing ? 360 : 0 }}
                  transition={{ 
                    duration: 1, 
                    repeat: isRefreshing ? Infinity : 0,
                    ease: "linear"
                  }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </motion.svg>
                {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
              </motion.button>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Link 
                  to="/admin/add-student"
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold shadow-lg flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add New Student
                </Link>
              </motion.div>
            </div>
          </div>
        </motion.div>
        
        <motion.div 
          className="bg-white border-2 border-slate-200 rounded-xl p-6 mb-8 shadow-sm hover:shadow-md transition-all"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <h3 className="text-lg font-bold text-slate-900 mb-4">Filter Students</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label htmlFor="search" className="block text-sm font-semibold text-slate-700 mb-2">
                Search Students
              </label>
              <motion.div whileHover={{ scale: 1.01 }} className="relative">
                <input
                  type="text"
                  id="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-3 pl-10 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Name, Email, Registration No..."
                />
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </motion.div>
            </div>
            <div>
              <label htmlFor="college" className="block text-sm font-semibold text-slate-700 mb-2">
                Filter by College
              </label>
              <motion.div whileHover={{ scale: 1.01 }} className="relative">
                <select
                  id="college"
                  value={filterCollege}
                  onChange={(e) => setFilterCollege(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors bg-white appearance-none"
                >
                  <option value="">All Colleges</option>
                  {colleges.map(college => (
                    <option key={college} value={college}>{college}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </motion.div>
            </div>
            
            <div>
              <label htmlFor="department" className="block text-sm font-semibold text-slate-700 mb-2">
                Filter by Department
              </label>
              <motion.div whileHover={{ scale: 1.01 }} className="relative">
                <select
                  id="department"
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors bg-white appearance-none"
                >
                  <option value="">All Departments</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </motion.div>
            </div>
            
            <div>
              <label htmlFor="year" className="block text-sm font-semibold text-slate-700 mb-2">
                Filter by Year
              </label>
              <motion.div whileHover={{ scale: 1.01 }} className="relative">
                <select
                  id="year"
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors bg-white appearance-none"
                >
                  <option value="">All Years</option>
                  {years.map(year => (
                    <option key={year} value={year}>Year {year}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </motion.div>
            </div>
          </div>
          
          <AnimatePresence>
            {(searchTerm || filterDepartment || filterYear || filterCollege) && (
              <motion.div 
                className="mt-4 flex justify-end"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <motion.button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterDepartment('');
                    setFilterYear('');
                    setFilterCollege('');
                  }}
                  className="px-4 py-2 text-sm font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear All Filters
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        
        <motion.div 
          className="bg-white border-2 border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          {loading ? (
            <div className="p-16 text-center">
              <motion.div 
                className="inline-block rounded-full h-16 w-16 border-4 border-slate-200 border-t-blue-600 mb-4"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <p className="text-slate-600 font-semibold text-lg">Loading student data...</p>
            </div>
          ) : students.length === 0 ? (
            <div className="p-16 text-center">
              <h3 className="text-2xl font-bold text-slate-900 mb-3">No Students Yet</h3>
              <p className="text-slate-600 mb-8">Start by adding your first student.</p>
              <Link to="/admin/add-student" className="inline-block px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
                Add First Student
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b-2 border-slate-200">
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Student</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Registration</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Academic</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase">Platforms</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-700 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <AnimatePresence>
                    {filteredStudents.length > 0 ? (
                      filteredStudents.map((student, index) => (
                        <motion.tr 
                          key={student.id} 
                          className="hover:bg-blue-50 transition-colors"
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          exit={{ opacity: 0, y: -20 }}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                                {student.name?.charAt(0).toUpperCase() || '?'}
                              </div>
                              <div className="ml-4">
                                <div className="text-base font-bold text-slate-900">{student.name || 'No Name'}</div>
                                <div className="text-sm text-slate-600">{student.email || 'No Email'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-slate-900">{student.registerNumber || 'N/A'}</div>
                            <div className="text-sm text-slate-600">Roll: {student.rollNumber || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-slate-900">{student.department || 'N/A'}</div>
                            <div className="text-sm text-slate-600">Year {student.year || 'N/A'}</div>
                            {student.college && (
                              <div className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                                {student.college}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2 flex-wrap">
                              {Object.entries(student.platformUrls || {}).map(([platform, url]) => (
                                url && (
                                  <motion.a 
                                    key={platform}
                                    href={url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all"
                                    title={platform.charAt(0).toUpperCase() + platform.slice(1)}
                                    whileHover={{ scale: 1.15 }}
                                    whileTap={{ scale: 0.95 }}
                                  >
                                    <PlatformIcon platform={platform} />
                                  </motion.a>
                                )
                              ))}
                              {(!student.platformUrls || Object.values(student.platformUrls).every(url => !url)) && (
                                <span className="text-xs text-slate-500 py-2">No profiles</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              <motion.button
                                onClick={() => handleViewDetails(student)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-sm flex items-center gap-1"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                View 
                              </motion.button>
                              
                              {/* <motion.button
                                onClick={() => handleInitiateScraping(student.id, student.platformUrls)}
                                className={`px-4 py-2 bg-white border-2 rounded-lg transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${
                                  scrapingStatus[student.id] === 'scraping' 
                                    ? 'border-blue-500 text-blue-600' 
                                    : 'border-slate-300 text-slate-700 hover:border-green-500 hover:text-green-600'
                                }`}
                                whileHover={!(!student.platformUrls || Object.values(student.platformUrls).every(url => !url)) && scrapingStatus[student.id] !== 'scraping' ? { scale: 1.05 } : {}}
                                whileTap={!(!student.platformUrls || Object.values(student.platformUrls).every(url => !url)) && scrapingStatus[student.id] !== 'scraping' ? { scale: 0.95 } : {}}
                                disabled={!student.platformUrls || Object.values(student.platformUrls).every(url => !url) || scrapingStatus[student.id] === 'scraping'}
                              >
                                <motion.svg 
                                  className="w-4 h-4" 
                                  fill="none" 
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24"
                                  animate={{ rotate: scrapingStatus[student.id] === 'scraping' ? 360 : 0 }}
                                  transition={{ 
                                    duration: 1, 
                                    repeat: scrapingStatus[student.id] === 'scraping' ? Infinity : 0,
                                    ease: "linear"
                                  }}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </motion.svg>
                                {scrapingStatus[student.id] === 'scraping' ? 'Scraping...' : 'Scrape'}
                              </motion.button> */}
                            </div>
                          </td>
                        </motion.tr>
                      ))
                    ) : (
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        <td colSpan="5" className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center">
                            <svg 
                              className="w-16 h-16 text-slate-300 mb-4"
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <p className="text-slate-600 mb-4 text-lg font-medium">No students match your search criteria</p>
                            <motion.button
                              onClick={() => {
                                setSearchTerm('');
                                setFilterDepartment('');
                                setFilterYear('');
                                setFilterCollege('');
                              }}
                              className="px-6 py-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-semibold rounded-lg transition-colors flex items-center gap-2"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Clear All Filters
                            </motion.button>
                          </div>
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
      
      <AnimatePresence>
        {showModal && selectedStudent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            aria-labelledby="modal-title"
            role="dialog"
            aria-modal="true"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={closeModal}></div>
            
            <motion.div
              className="relative z-10 w-full max-w-4xl"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 30 
              }}
            >
              <StudentViewDetails 
                student={selectedStudent} 
                onClose={closeModal}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default StudentList;