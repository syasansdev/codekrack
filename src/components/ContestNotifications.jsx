import { useState, useEffect } from 'react';
import { contestsApi } from '../services/api';
import { motion } from 'framer-motion';

const ContestNotifications = () => {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetchContests();
  }, []);

  const fetchContests = async () => {
    setLoading(true);
    try {
      setContests(await contestsApi.upcoming());
    } catch (error) {
      console.error('Error fetching contests:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendNotifications = async () => {
    setSending(true);
    setResult(null);

    try {
      // Now admin-only AND rate limited to 5/hr per admin: this mails every
      // student, and Gmail suspends accounts that exceed their daily quota.
      setResult(await contestsApi.sendNotifications());
    } catch (error) {
      setResult({
        success: false,
        message:
          error.code === 'EMAIL_RATE_LIMITED'
            ? error.message
            : error.message || 'Failed to send notifications',
      });
    } finally {
      setSending(false);
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
          <h2 className="text-2xl font-bold text-fg">Contest Notifications</h2>
          <p className="text-fg-muted">Send upcoming contest alerts to all students</p>
        </div>
        <motion.button
          onClick={sendNotifications}
          disabled={sending || contests.length === 0}
          className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 ${
            sending || contests.length === 0
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          } text-white transition-colors`}
          whileHover={!sending && contests.length > 0 ? { scale: 1.05 } : {}}
          whileTap={!sending && contests.length > 0 ? { scale: 0.95 } : {}}
        >
          {sending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Sending...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Send Notifications
            </>
          )}
        </motion.button>
      </div>

      {/* Result Message */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-lg mb-6 ${
            result.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {result.success ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            )}
            <span className="font-medium">{result.message}</span>
          </div>
          {result.success && result.results && (
            <div className="mt-2 text-sm">
              <p>Total: {result.results.total} | Successful: {result.results.successful} | Failed: {result.results.failed}</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Contests Preview */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-fg">Upcoming Contests ({contests.length})</h3>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : contests.length === 0 ? (
          <div className="text-center py-8 text-fg-subtle">
            <svg className="w-12 h-12 mx-auto mb-4 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p>No upcoming contests found</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {contests.map((contest, index) => (
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
                    <span>Upcoming</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContestNotifications;