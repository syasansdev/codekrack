import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { contestsApi } from '../services/api';

const ContestWidget = () => {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedContest, setSelectedContest] = useState(null);

  useEffect(() => {
    fetchContests();
  }, []);

  const fetchContests = async () => {
    try {
      // Via the API layer so the Supabase token is attached — /api/email/*
      // requires auth now (SEC-01). A bare fetch() here would 401.
      setContests(await contestsApi.upcoming());
    } catch (error) {
      console.error('Error fetching contests:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPlatformColor = (platform) => {
    const colors = {
      'Codeforces': { bg: 'bg-red-500', text: 'text-red-600', border: 'border-red-200' },
      'LeetCode': { bg: 'bg-yellow-500', text: 'text-yellow-600', border: 'border-yellow-200' },
      'CodeChef': { bg: 'bg-green-500', text: 'text-green-600', border: 'border-green-200' },
      'AtCoder': { bg: 'bg-blue-500', text: 'text-blue-600', border: 'border-blue-200' },
      'HackerRank': { bg: 'bg-purple-500', text: 'text-purple-600', border: 'border-purple-200' }
    };
    return colors[platform] || { bg: 'bg-gray-500', text: 'text-fg-muted', border: 'border-edge' };
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

  if (loading) {
    return (
      <div className="bg-surface rounded-xl border border-edge p-4 shadow-md">
        <div className="flex justify-center items-center h-32">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Contest Widget */}
      <motion.div 
        className="bg-surface rounded-xl border border-edge shadow-md overflow-hidden"
        whileHover={{ boxShadow: "0px 15px 25px -5px rgba(0,0,0,0.15)" }}
      >
        <div className="p-4 border-b border-edge">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-fg">Upcoming Contests</h3>
              <p className="text-sm text-fg-muted">{contests.length} contests this month</p>
            </div>
            <motion.button
              onClick={() => setShowCalendar(true)}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </motion.button>
          </div>
        </div>

        <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
          {contests.slice(0, 4).map((contest, index) => {
            const colors = getPlatformColor(contest.platform);
            return (
              <motion.div
                key={index}
                className="flex items-center justify-between p-3 bg-surface-2 rounded-lg hover:bg-surface-3 transition-colors cursor-pointer"
                whileHover={{ x: 5 }}
                onClick={() => setSelectedContest(contest)}
              >
                <div className="flex-1">
                  <h4 className="font-medium text-fg text-sm truncate">{contest.name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors.bg} text-white`}>
                      {contest.platform}
                    </span>
                    <span className="text-xs text-fg-muted">{contest.date} • {contest.time}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
          
          {contests.length > 4 && (
            <motion.button
              onClick={() => setShowCalendar(true)}
              className="w-full text-center text-sm text-blue-600 hover:text-blue-700 py-2"
              whileHover={{ scale: 1.02 }}
            >
              View all {contests.length} contests
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* Full Calendar Modal */}
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
    </>
  );
};

export default ContestWidget;