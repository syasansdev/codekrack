import { useState, useEffect } from 'react';
import { contestsApi } from '../services/api';
import { motion } from 'framer-motion';

const WeeklyScheduler = () => {
  const [status, setStatus] = useState(null);
  const [weeklyContests, setWeeklyContests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    fetchStatus();
    fetchWeeklyContests();
  }, []);

  const fetchStatus = async () => {
    try {
      const data = await contestsApi.schedulerStatus();
      if (data.success) setStatus(data);
    } catch (error) {
      console.error('Error fetching scheduler status:', error);
    }
  };

  const fetchWeeklyContests = async () => {
    setLoading(true);
    try {
      const data = await contestsApi.weekly();
      if (data.success) setWeeklyContests(data.contests);
    } catch (error) {
      console.error('Error fetching weekly contests:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleScheduler = async () => {
    try {
      const data = status?.isRunning
        ? await contestsApi.stopScheduler()
        : await contestsApi.startScheduler();
      if (data.success) setStatus(data.status);
    } catch (error) {
      console.error('Error toggling scheduler:', error);
    }
  };

  const triggerManualEmail = async () => {
    setTriggering(true);
    try {
      // Admin-only and rate limited to 5/hr — this mails every student.
      const data = await contestsApi.triggerScheduler();
      alert(data.success ? `✅ ${data.message}` : `❌ ${data.message}`);
    } catch (error) {
      // Surface the real reason (e.g. the hourly send limit) instead of a
      // blanket "failed", which sends people hunting for a bug that isn't there.
      alert(`❌ ${error.message || 'Failed to send test email'}`);
    } finally {
      setTriggering(false);
    }
  };

  const getPlatformColor = (platform) => {
    const colors = {
      'Codeforces': 'bg-red-500',
      'LeetCode': 'bg-yellow-500',
      'CodeChef': 'bg-green-500',
      'AtCoder': 'bg-blue-500',
      'HackerRank': 'bg-purple-500'
    };
    return colors[platform] || 'bg-blue-500';
  };

  return (
    <div className="bg-surface rounded-xl shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-fg">Weekly Contest Scheduler</h2>
          <p className="text-fg-muted">Automated weekly contest notifications every Monday at 9:00 AM</p>
        </div>
        
        <div className="flex gap-3">
          <motion.button
            onClick={triggerManualEmail}
            disabled={triggering || weeklyContests.length === 0}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
              triggering || weeklyContests.length === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            } text-white transition-colors`}
            whileHover={!triggering && weeklyContests.length > 0 ? { scale: 1.05 } : {}}
            whileTap={!triggering && weeklyContests.length > 0 ? { scale: 0.95 } : {}}
          >
            {triggering ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Sending...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Test Send Now
              </>
            )}
          </motion.button>

          <motion.button
            onClick={toggleScheduler}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
              status?.isRunning 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white transition-colors`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {status?.isRunning ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Stop Scheduler
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M15 14h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Scheduler
              </>
            )}
          </motion.button>
        </div>
      </div>

      {/* Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface-2 rounded-lg p-4">
          <h3 className="font-semibold text-fg mb-2">Status</h3>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${status?.isRunning ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm font-medium">
              {status?.isRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>

        <div className="bg-surface-2 rounded-lg p-4">
          <h3 className="font-semibold text-fg mb-2">Next Run</h3>
          <p className="text-sm text-fg-muted">{status?.nextRun || 'Not scheduled'}</p>
        </div>

        <div className="bg-surface-2 rounded-lg p-4">
          <h3 className="font-semibold text-fg mb-2">This Week's Contests</h3>
          <p className="text-sm text-fg-muted">{weeklyContests.length} contests found</p>
        </div>
      </div>

      {/* Weekly Contests Preview */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-fg">This Week's Contests</h3>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : weeklyContests.length === 0 ? (
          <div className="text-center py-8 text-fg-subtle">
            <svg className="w-12 h-12 mx-auto mb-4 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p>No contests scheduled for this week</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {weeklyContests.map((contest, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="border border-edge rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-semibold text-fg text-lg">{contest.name}</h4>
                  <span className={`px-3 py-1 text-white text-sm font-medium rounded-full ${getPlatformColor(contest.platform)}`}>
                    {contest.platform}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-fg-muted">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                    </svg>
                    <span>{contest.date}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    <span>{contest.time}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    <span>{contest.duration}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>This Week</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <h4 className="font-semibold text-blue-800 mb-1">Automated Weekly Emails</h4>
            <p className="text-sm text-blue-700">
              When the scheduler is running, emails will be automatically sent every Monday at 9:00 AM IST 
              containing all contests for the upcoming week. Use "Test Send Now" to preview the email immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeeklyScheduler;