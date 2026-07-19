import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { contestsApi } from '../services/api';
import ThemeToggle from './ui/ThemeToggle';

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [contests, setContests] = useState([]);
  const [contestsLoading, setContestsLoading] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedContest, setSelectedContest] = useState(null);
  const navigate = useNavigate();
  const { currentUser, userData, loading: authLoading, logout } = useAuth();
  const location = useLocation();
  const dropdownRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const hamburgerRef = useRef(null);
  
  // Track scroll position for header styling
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close dropdown and mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Close dropdown if clicked outside
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
      
      // Close mobile menu if clicked outside of menu and hamburger button
      if (mobileMenuRef.current && 
          !mobileMenuRef.current.contains(event.target) &&
          hamburgerRef.current && 
          !hamburgerRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Fetch contests when calendar is opened
  const fetchContests = async () => {
    if (contests.length > 0) return; // Don't fetch if already loaded
    
    setContestsLoading(true);
    try {
      // Via the API layer so the Supabase token is attached — /api/email/*
      // requires auth now (SEC-01). A bare fetch() here would 401.
      setContests(await contestsApi.upcoming());
    } catch (error) {
      console.error('Error fetching contests:', error);
    } finally {
      setContestsLoading(false);
    }
  };

  const handleCalendarClick = () => {
    setShowCalendar(true);
    fetchContests();
  };

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  // Derive the header's user from the auth context instead of fetching and
  // hand-syncing it into local state.
  //
  // The old version had a `role: 'student'` fallback for when the profile read
  // failed — which meant a network blip silently relabelled an admin as a
  // student and changed the menu under them. There is no fallback now: if we
  // don't know who someone is, we don't guess.
  useEffect(() => {
    if (authLoading || isSigningOut) return;

    if (!currentUser) {
      navigate('/');
      return;
    }

    setUser(
      userData
        ? {
            uid: userData.id,
            name: userData.name || userData.displayName || 'User',
            email: userData.email,
            photoURL: userData.photoURL || null,
            role: userData.role,
            department: userData.department,
            registerNumber: userData.registerNumber,
            streak: userData.streak || 0,
          }
        : null
    );
    setLoading(false);
  }, [authLoading, currentUser, userData, isSigningOut, navigate]);

  // Reset image error when user changes
  useEffect(() => {
    setImageError(false);
  }, [user]);

  // Handle sign out
  // const handleSignOut = async () => {
  //   try {
  //     setIsSigningOut(true);
  //     setIsDropdownOpen(false);
  //     setIsMobileMenuOpen(false);
      
  //     const { success, error } = await logOut();
      
  //     if (success) {
  //       setUser(null);
  //       console.log('Sign out successful, navigating to landing page');
  //       navigate('/', { replace: true });
  //     } else {
  //       console.error("Sign out error:", error);
  //       navigate('/', { replace: true });
  //     }
  //   } catch (error) {
  //     console.error("Error signing out:", error);
  //     navigate('/', { replace: true });
  //   } finally {
  //     setTimeout(() => setIsSigningOut(false), 1000);
  //   }
  // };



  // Handle sign out
  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      setIsDropdownOpen(false);
      setIsMobileMenuOpen(false);
      
      setUser(null);

      // logout() ends the Supabase session AND clears the React Query cache, so
      // the next person to sign in on this browser can't be served the previous
      // user's students out of memory. It also flips the SSE hook's `enabled`
      // to false, which aborts the event stream.
      await logout();
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      // A hard navigation, not navigate(): it guarantees every component's
      // in-memory state is gone, which is the behaviour you want from sign-out
      // even if something above threw.
      window.location.href = '/';
    }
  };

  // Get display name (first name only)
  const getDisplayName = (name) => {
    if (!name || name === 'User') return 'User';
    return name.split(' ')[0];
  };

  // Toggle dropdown menu
  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  // Toggle mobile menu
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // Close mobile menu
  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Calendar helper functions
  const getPlatformColor = (platform) => {
    const colors = {
      'Codeforces': { bg: 'bg-red-500' },
      'LeetCode': { bg: 'bg-yellow-500' },
      'CodeChef': { bg: 'bg-green-500' },
      'AtCoder': { bg: 'bg-blue-500' },
      'HackerRank': { bg: 'bg-purple-500' }
    };
    return colors[platform] || { bg: 'bg-gray-500' };
  };

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getContestsForDate = (day) => {
    const dateStr = `${day.toString().padStart(2, '0')}/${(currentDate.getMonth() + 1).toString().padStart(2, '0')}/${currentDate.getFullYear()}`;
    return contests.filter(contest => contest.date === dateStr);
  };

  const navigateMonth = (direction) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(
        <div key={`empty-${i}`} className="h-16 border border-edge"></div>
      );
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dayContests = getContestsForDate(day);
      const isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toDateString();

      days.push(
        <motion.div
          key={day}
          className={`h-16 border border-edge p-1 relative overflow-hidden cursor-pointer ${
            isToday ? 'bg-blue-50 border-blue-200' : 'hover:bg-surface-2'
          }`}
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          <div className={`text-xs font-medium mb-1 ${isToday ? 'text-blue-600' : 'text-fg-muted'}`}>
            {day}
          </div>
          
          <div className="space-y-0.5">
            {dayContests.slice(0, 1).map((contest, index) => {
              const colors = getPlatformColor(contest.platform);
              return (
                <motion.div
                  key={index}
                  className={`text-xs px-1 py-0.5 rounded cursor-pointer ${colors.bg} text-white truncate`}
                  whileHover={{ scale: 1.05 }}
                  onClick={() => setSelectedContest(contest)}
                  title={contest.name}
                >
                  {contest.name.substring(0, 8)}...
                </motion.div>
              );
            })}
            
            {dayContests.length > 1 && (
              <div className="text-xs text-fg-subtle font-medium">
                +{dayContests.length - 1}
              </div>
            )}
          </div>
        </motion.div>
      );
    }

    return days;
  };

  // Account SVG Icon Component
  const AccountIcon = ({ className = "h-6 w-6" }) => (
    <svg 
      className={className} 
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" 
      />
    </svg>
  );

  // Navigation items.
  //
  // 'Achievements' -> '/achievements' was still listed here after the route was
  // deleted in the Firebase purge (App.jsx documents why: it ranked students by
  // a field nothing ever wrote, so every rank came out 0). Nothing removed the
  // link, so a quarter of the student nav bar led straight to the 404 page.
  // Verified: zero routes in App.jsx match '/achievements'.
  const navItems = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Leaderboard', path: '/leaderboard' },
    { name: 'Activity', path: '/activity' },
    { name: 'Achievements', path: '/achievements' },
  ];

  // Check if current path is active
  const isActive = (path) => {
    return location.pathname === path;
  };

  if (loading) {
    return (
      <header className="h-16 bg-surface shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-full">
          <div className="animate-pulse h-8 w-32 bg-surface-3 rounded"></div>
          <div className="flex items-center space-x-4">
            <div className="animate-pulse h-8 w-24 bg-surface-3 rounded"></div>
            <div className="animate-pulse h-8 w-8 bg-surface-3 rounded-full"></div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <motion.header 
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-surface shadow-md py-2' : 'bg-surface py-3'
      }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center">
            <motion.div 
              className="cursor-pointer"
              whileHover={{ scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 400, damping: 10 }}
              onClick={() => navigate('/dashboard')}
            >
              <img
                src="/Codekrack - Big.jpg"
                alt="CodeKrack"
                className="h-10 w-auto object-contain"
                style={{ maxWidth: '150px' }}
              />
            </motion.div>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <nav className="hidden md:flex space-x-8">
              {navItems.map((item) => (
                <motion.button
                  key={item.name}
                  onClick={() => navigate(item.path)}
                  className={`font-medium transition-colors duration-200 ${
                    isActive(item.path)
                      ? 'text-blue-600'
                      : 'text-fg-muted hover:text-blue-600'
                  }`}
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 0 }}
                >
                  {item.name}
                </motion.button>
              ))}
            </nav>
            
            {/* Calendar Icon */}
            <motion.button
              onClick={handleCalendarClick}
              className="p-2 text-fg-muted hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Contest Calendar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </motion.button>
            
            {/* Theme Toggle Button */}
            <ThemeToggle className="ml-1 shadow-sm border-edge-strong flex shrink-0" />
            
            {user && (
              <div className="relative" ref={dropdownRef}>
                <motion.div 
                  className="flex items-center space-x-2 cursor-pointer rounded-full hover:bg-surface-3 p-1.5 pr-3 transition-colors duration-200"
                  onClick={toggleDropdown}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring' }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {/* User Avatar */}
                  <div className="relative">
                    {user.photoURL && !imageError ? (
                      <img 
                        src={user.photoURL} 
                        alt={user.name} 
                        className="h-8 w-8 rounded-full object-cover ring-2 ring-white shadow-sm"
                        onError={() => setImageError(true)}
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-surface-2 border-2 border-edge flex items-center justify-center shadow-sm">
                        <AccountIcon className="h-4 w-4 text-fg-subtle" />
                      </div>
                    )}
                  </div>
                  
                  <div className="hidden sm:block">
                    <p className="text-sm font-semibold text-fg-muted line-clamp-1">
                      {getDisplayName(user.name)}
                    </p>
                    {user.streak > 0 && (
                      <p className="text-xs text-orange-600 font-medium">
                        🔥 {user.streak} day streak
                      </p>
                    )}
                  </div>
                  <svg 
                    className={`h-5 w-5 text-fg-subtle transition-transform duration-200 ease-in-out ${isDropdownOpen ? 'rotate-180' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </motion.div>
                
                {/* Enhanced Dropdown Menu */}
                <AnimatePresence>
                  {isDropdownOpen && (
                    <motion.div 
                      className="absolute right-0 mt-2 w-64 bg-surface rounded-xl shadow-lg overflow-hidden z-10 border border-edge"
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      style={{ 
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
                      }}
                    >
                      {/* User info section */}
                      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50">
                        <div className="flex items-center">
                          <div className="relative">
                            {user.photoURL && !imageError ? (
                              <img 
                                src={user.photoURL} 
                                alt={user.name} 
                                className="h-10 w-10 rounded-full object-cover border-2 border-white shadow"
                                onError={() => setImageError(true)}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-surface-2 border-2 border-white flex items-center justify-center shadow">
                                <AccountIcon className="h-5 w-5 text-fg-subtle" />
                              </div>
                            )}
                          </div>
                          <div className="ml-3 overflow-hidden">
                            <p className="text-sm font-bold text-fg truncate">{user.name}</p>
                            <p className="text-xs text-fg-subtle truncate">{user.email}</p>
                            {user.department && (
                              <p className="text-xs text-blue-600 font-medium truncate">
                                {user.department}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Menu items */}
                      <div className="py-1">
                        {/* <button 
                          onClick={() => {
                            setIsDropdownOpen(false);
                            navigate('/profile');
                          }}
                          className="flex items-center w-full px-4 py-2.5 text-sm text-fg-muted hover:bg-blue-50 transition-colors duration-200"
                        >
                          <AccountIcon className="w-4 h-4 mr-3 text-fg-subtle" />
                          Profile
                        </button> */}
                        
                        <button 
                          onClick={() => {
                            setIsDropdownOpen(false);
                            navigate('/settings');
                          }}
                          className="flex items-center w-full px-4 py-2.5 text-sm text-fg-muted hover:bg-blue-50 transition-colors duration-200"
                        >
                          <svg className="w-4 h-4 mr-3 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Settings
                        </button>
                      </div>
                      
                      {/* Divider */}
                      <div className="h-px bg-surface-3 mx-2"></div>
                      
                      {/* Additional user info */}
                      <div className="px-4 py-2 bg-surface-2">
                        <div className="flex justify-between text-xs text-fg-subtle">
                          <span>Role:</span>
                          <span className="font-medium capitalize">{user.role || 'student'}</span>
                        </div>
                        {user.registerNumber && (
                          <div className="flex justify-between text-xs text-fg-subtle mt-1">
                            <span>Reg No:</span>
                            <span className="font-medium">{user.registerNumber}</span>
                          </div>
                        )}
                        {user.streak > 0 && (
                          <div className="flex justify-between text-xs text-fg-subtle mt-1">
                            <span>Streak:</span>
                            <span className="font-medium text-orange-600">🔥 {user.streak} days</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Sign out button */}
                      <div className="py-1 px-2">
                        <motion.button 
                          onClick={handleSignOut} 
                          className="flex w-full items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-600 rounded-lg hover:from-red-600 hover:to-red-700 transition-colors duration-200"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Sign Out
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Mobile Menu Button and User Info */}
          <div className="flex md:hidden items-center space-x-3">
            {user && (
              <div className="flex items-center space-x-2">
                {/* User Avatar for mobile */}
                <div className="relative">
                  {user.photoURL && !imageError ? (
                    <img 
                      src={user.photoURL} 
                      alt={user.name} 
                      className="h-8 w-8 rounded-full object-cover ring-2 ring-white shadow-sm"
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-surface-2 border-2 border-edge flex items-center justify-center shadow-sm">
                      <AccountIcon className="h-4 w-4 text-fg-subtle" />
                    </div>
                  )}
                </div>
                
                {/* User info for mobile - only show on larger mobile screens */}
                <div className="hidden xs:block">
                  <p className="text-sm font-semibold text-fg-muted line-clamp-1">
                    {getDisplayName(user.name)}
                  </p>
                  {user.streak > 0 && (
                    <p className="text-xs text-orange-600 font-medium">
                      🔥 {user.streak} day streak
                    </p>
                  )}
                </div>
              </div>
            )}
            
            {/* Hamburger Menu Button */}
            <motion.button
              ref={hamburgerRef}
              onClick={toggleMobileMenu}
              className="p-2 rounded-md text-fg-muted hover:text-blue-600 hover:bg-surface-3 transition-colors duration-200"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Toggle menu"
            >
              <svg 
                className="h-6 w-6" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </motion.button>
          </div>
        </div>

        {/* Contest Calendar Modal */}
        <AnimatePresence>
          {showCalendar && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
              onClick={() => setShowCalendar(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-surface rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6">
                  {/* Calendar Header */}
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-fg">Contest Calendar</h2>
                    <div className="flex items-center gap-4">
                      <motion.button
                        onClick={() => navigateMonth(-1)}
                        className="p-2 rounded-lg hover:bg-surface-3 transition-colors"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <svg className="w-5 h-5 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </motion.button>
                      
                      <h3 className="text-xl font-semibold text-fg min-w-[200px] text-center">
                        {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                      </h3>
                      
                      <motion.button
                        onClick={() => navigateMonth(1)}
                        className="p-2 rounded-lg hover:bg-surface-3 transition-colors"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <svg className="w-5 h-5 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </motion.button>
                      
                      <button
                        onClick={() => setShowCalendar(false)}
                        className="p-2 text-fg-subtle hover:text-fg-muted"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {contestsLoading ? (
                    <div className="flex justify-center items-center h-64">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : (
                    <>
                      {/* Calendar Grid */}
                      <div className="grid grid-cols-7 gap-0 border border-edge rounded-lg overflow-hidden mb-4">
                        {/* Day Headers */}
                        {dayNames.map(day => (
                          <div key={day} className="bg-surface-2 p-2 text-center font-semibold text-fg-muted border-b border-edge text-sm">
                            {day}
                          </div>
                        ))}
                        
                        {/* Calendar Days */}
                        {renderCalendarDays()}
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap gap-4">
                        <h4 className="text-sm font-semibold text-fg-muted w-full">Platforms:</h4>
                        {['Codeforces', 'LeetCode', 'CodeChef', 'AtCoder', 'HackerRank'].map(platform => {
                          const colors = getPlatformColor(platform);
                          return (
                            <div key={platform} className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded ${colors.bg}`}></div>
                              <span className="text-sm text-fg-muted">{platform}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Contest Details Modal */}
        <AnimatePresence>
          {selectedContest && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
              onClick={() => setSelectedContest(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-surface rounded-xl p-6 max-w-md w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold text-fg">{selectedContest.name}</h3>
                  <button
                    onClick={() => setSelectedContest(null)}
                    className="text-fg-subtle hover:text-fg-muted"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 text-white text-sm font-medium rounded-full ${getPlatformColor(selectedContest.platform).bg}`}>
                      {selectedContest.platform}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-fg-subtle">Date:</span>
                      <p className="font-medium">{selectedContest.date}</p>
                    </div>
                    <div>
                      <span className="text-fg-subtle">Time:</span>
                      <p className="font-medium">{selectedContest.time}</p>
                    </div>
                    <div>
                      <span className="text-fg-subtle">Duration:</span>
                      <p className="font-medium">{selectedContest.duration}</p>
                    </div>
                    <div>
                      <span className="text-fg-subtle">Status:</span>
                      <p className="font-medium text-green-600">Upcoming</p>
                    </div>
                  </div>
                  
                  <motion.a
                    href={selectedContest.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-blue-600 text-white text-center py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    View Contest
                  </motion.a>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              {/* Backdrop Overlay */}
              <motion.div
                className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeMobileMenu}
              />
              
              {/* Mobile Menu Panel */}
              <motion.div
                ref={mobileMenuRef}
                className="fixed top-0 right-0 bottom-0 w-80 max-w-full bg-surface shadow-xl z-50 md:hidden overflow-y-auto"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              >
                {/* Header with Close Button */}
                <div className="flex items-center justify-between p-4 border-b border-edge bg-surface sticky top-0">
                  <h2 className="text-lg font-semibold text-fg">Menu</h2>
                  <div className="flex items-center gap-2">
                    <ThemeToggle className="shadow-sm border-edge-strong" />
                    <motion.button
                      onClick={closeMobileMenu}
                      className="p-2 rounded-full hover:bg-surface-3 transition-colors duration-200"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      aria-label="Close menu"
                    >
                      <svg className="h-5 w-5 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </motion.button>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* Navigation Links */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-fg-subtle uppercase tracking-wide px-2">Navigation</h3>
                    {navItems.map((item) => (
                      <motion.button
                        key={item.name}
                        onClick={() => navigate(item.path)}
                        className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-colors duration-200 flex items-center ${
                          isActive(item.path)
                            ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                            : 'text-fg-muted hover:bg-surface-2'
                        }`}
                        whileHover={{ x: 4 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="flex-1">{item.name}</span>
                        {isActive(item.path) && (
                          <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                  
                  {/* User Section */}
                  {user && (
                    <div className="border-t border-edge pt-4">
                      <h3 className="text-sm font-semibold text-fg-subtle uppercase tracking-wide px-2 mb-3">Account</h3>
                      
                      {/* User Profile Card */}
                      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg mb-3">
                        <div className="flex items-center">
                          <div className="relative">
                            {user.photoURL && !imageError ? (
                              <img 
                                src={user.photoURL} 
                                alt={user.name} 
                                className="h-12 w-12 rounded-full object-cover border-2 border-white shadow"
                                onError={() => setImageError(true)}
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-full bg-surface-2 border-2 border-white flex items-center justify-center shadow">
                                <AccountIcon className="h-6 w-6 text-fg-subtle" />
                              </div>
                            )}
                          </div>
                          <div className="ml-3 flex-1 min-w-0">
                            <p className="text-sm font-bold text-fg truncate">{user.name}</p>
                            <p className="text-xs text-fg-subtle truncate">{user.email}</p>
                            {user.department && (
                              <p className="text-xs text-blue-600 font-medium truncate">
                                {user.department}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Mobile User Actions */}
                      <div className="space-y-2 mb-3">
                        {/* <button 
                          onClick={() => {
                            closeMobileMenu();
                            navigate('/profile');
                          }}
                          className="flex items-center w-full px-4 py-3 text-sm text-fg-muted hover:bg-blue-50 rounded-lg transition-colors duration-200"
                        >
                          <AccountIcon className="w-4 h-4 mr-3 text-fg-subtle" />
                          Profile
                        </button> */}
                        
                        <button 
                          onClick={() => {
                            closeMobileMenu();
                            navigate('/settings');
                          }}
                          className="flex items-center w-full px-4 py-3 text-sm text-fg-muted hover:bg-blue-50 rounded-lg transition-colors duration-200"
                        >
                          <svg className="w-4 h-4 mr-3 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Settings
                        </button>
                      </div>
                      
                      {/* User Info */}
                      <div className="px-4 py-3 bg-surface-2 rounded-lg mb-3">
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-fg-subtle">
                            <span>Role:</span>
                            <span className="font-medium capitalize">{user.role || 'student'}</span>
                          </div>
                          {user.registerNumber && (
                            <div className="flex justify-between text-xs text-fg-subtle">
                              <span>Reg No:</span>
                              <span className="font-medium">{user.registerNumber}</span>
                            </div>
                          )}
                          {user.streak > 0 && (
                            <div className="flex justify-between text-xs text-fg-subtle">
                              <span>Streak:</span>
                              <span className="font-medium text-orange-600">🔥 {user.streak} days</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Sign Out Button */}
                      <motion.button 
                        onClick={handleSignOut} 
                        className="flex w-full items-center justify-center px-4 py-3 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-600 rounded-lg hover:from-red-600 hover:to-red-700 transition-colors duration-200"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign Out
                      </motion.button>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
};

export default Header;