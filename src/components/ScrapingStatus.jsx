// src/components/ScrapingStatus.jsx
//
// Live view of where every student's scrape has got to. One of the two realtime
// surfaces: it updates itself as the GitHub Action works through the batch,
// with no polling and no listener.
import { useState, useEffect, useMemo } from 'react';
import { useAdminScope } from '../hooks/useAdminScope';
import { useScrapingStatus } from '../hooks/queries/useDashboard';
import { useRescrapeStudent } from '../hooks/queries/useStudents';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import BackButton from './BackButton';

const ScrapingStatus = () => {
  // students / loading / lastSyncTime are derived from the query below.
  const [filterStatus, setFilterStatus] = useState('all');
  const [isSyncing, setIsSyncing] = useState(false);

  // Institution admins only ever see their own institution's students — enforced
  // by the server; institutionId here is just a super-admin filter.
  const { institutionId } = useAdminScope();

  // SSE-backed: a platform_stats row changing anywhere (including from the
  // GitHub Action, in its own process) fires a Postgres NOTIFY, Express pushes
  // an `invalidate`, and this refetches. staleTime is Infinity because a timer
  // could never beat a push — see lib/queryClient.js.
  const {
    data: statusData,
    isLoading: loading,
    isFetching,
    error: statusError,
    dataUpdatedAt,
    refetch,
  } = useScrapingStatus({ institutionId });

  const rescrape = useRescrapeStudent();
  const { realtime } = useAuth();

  // Only students with at least one platform URL appear here — same rule as
  // before, but the server only sends rows that HAVE platform_stats, so this is
  // mostly belt and braces.
  const students = useMemo(() => {
    const list = (statusData?.statuses || []).filter(
      (s) => s.platformUrls && Object.values(s.platformUrls).some((u) => u)
    );
    // Most recently updated first.
    return list.sort((a, b) => {
      const ta = a.scrapingStatus?.lastUpdated ? new Date(a.scrapingStatus.lastUpdated).getTime() : 0;
      const tb = b.scrapingStatus?.lastUpdated ? new Date(b.scrapingStatus.lastUpdated).getTime() : 0;
      return tb - ta;
    });
  }, [statusData]);

  const lastSyncTime = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString() : null;

  useEffect(() => {
    if (statusError) toast.error('Failed to load scraping status');
  }, [statusError]);

  // ---------------------------------------------------------------------------
  // Retrying no longer scrapes in the browser.
  //
  // This screen used to import scrapeLeetCode/scrapeGitHub/... from
  // ../utils/scrapers and call each platform's API straight from the admin's
  // machine, then write the numbers to Firestore with updateDoc. That meant
  // CORS proxies, the admin's IP absorbing every platform's rate limit, results
  // only while a tab stayed open, and the browser writing leaderboard figures
  // directly. Now we mark the rows pending and let the GitHub Action do it; the
  // status flips to 'completed' here on its own, over SSE.
  // ---------------------------------------------------------------------------
  const handleRetryStudent = async (studentId) => {
    try {
      const res = await rescrape.mutateAsync(studentId);
      toast.success(`Queued ${res.queued} platform(s) — results will appear here automatically`);
    } catch (error) {
      toast.error('Could not queue: ' + error.message);
    }
  };

  const handleRetryAll = async () => {
    if (!students.length) {
      toast.info('No students to sync');
      return;
    }
    setIsSyncing(true);
    let queued = 0;
    for (const s of students) {
      try {
        await rescrape.mutateAsync(s.id);
        queued++;
      } catch {
        // Keep going — one failure shouldn't abort the batch.
      }
    }
    setIsSyncing(false);
    toast.success(`Queued ${queued} student(s) for the next scraper run`);
  };


  const getPlatformStatus = (student, platform) => {
    return student.scrapingStatus?.[platform] || 'not_started';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'success': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'pending': return 'bg-blue-500';
      case 'scraping': return 'bg-yellow-500';
      case 'in_progress': return 'bg-yellow-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'success': return 'Success';
      case 'failed': return 'Failed';
      case 'pending': return 'Pending';
      case 'scraping': return 'Scraping';
      case 'in_progress': return 'In Progress';
      default: return 'Not Started';
    }
  };

  const getStatusTextColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-700';
      case 'success': return 'text-green-700';
      case 'failed': return 'text-red-700';
      case 'pending': return 'text-blue-700';
      case 'scraping': return 'text-yellow-700';
      case 'in_progress': return 'text-yellow-700';
      default: return 'text-gray-700';
    }
  };

  const getPlatformStats = (student, platform) => {
    const data = student.platformData?.[platform];
    if (!data || data.error) return null;

    switch (platform) {
      case 'leetcode':
        return `${data.totalSolved || data.solved || 0} solved`;
      case 'codeforces':
        return `${data.problemsSolved || 0} problems`;
      case 'atcoder':
        return `${data.problemsSolved || 0} problems`;
      case 'github':
        return `${data.repositories || 0} repos`;
      default:
        return null;
    }
  };

  const filteredStudents = students.filter(student => {
    if (filterStatus === 'all') return true;
    
    const platformStatuses = Object.keys(student.platformUrls)
      .filter(platform => student.platformUrls[platform])
      .map(platform => getPlatformStatus(student, platform));

    switch (filterStatus) {
      case 'completed':
        return platformStatuses.some(status => status === 'completed' || status === 'success');
      case 'failed':
        return platformStatuses.some(status => status === 'failed');
      case 'in_progress':
        return platformStatuses.some(status => status === 'scraping' || status === 'in_progress' || status === 'pending');
      case 'not_started':
        return platformStatuses.every(status => !status || status === 'not_started');
      default:
        return true;
    }
  });

  // Calculate statistics
  const stats = {
    total: students.reduce((sum, student) => 
      sum + Object.values(student.platformUrls).filter(Boolean).length, 0
    ),
    completed: students.reduce((sum, student) => 
      sum + Object.keys(student.platformUrls).filter(platform => 
        student.platformUrls[platform] && 
        (getPlatformStatus(student, platform) === 'completed' || getPlatformStatus(student, platform) === 'success')
      ).length, 0
    ),
    failed: students.reduce((sum, student) => 
      sum + Object.keys(student.platformUrls).filter(platform => 
        student.platformUrls[platform] && getPlatformStatus(student, platform) === 'failed'
      ).length, 0
    ),
    inProgress: students.reduce((sum, student) => 
      sum + Object.keys(student.platformUrls).filter(platform => 
        student.platformUrls[platform] && 
        (getPlatformStatus(student, platform) === 'scraping' || 
         getPlatformStatus(student, platform) === 'in_progress' ||
         getPlatformStatus(student, platform) === 'pending')
      ).length, 0
    ),
    notStarted: students.reduce((sum, student) => 
      sum + Object.keys(student.platformUrls).filter(platform => 
        student.platformUrls[platform] && 
        (!getPlatformStatus(student, platform) || getPlatformStatus(student, platform) === 'not_started')
      ).length, 0
    )
  };

  const formatLastSync = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <BackButton to="/admin/dashboard" />
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Scraping Status</h1>
              <p className="mt-2 text-sm text-gray-600">
                Monitor and manage data synchronization from coding platforms
              </p>
            </div>
            
            <div className="mt-4 sm:mt-0 flex space-x-3">
              <button
                onClick={handleRetryAll}
                disabled={isSyncing}
                className={`px-4 py-2 rounded-md font-medium text-sm flex items-center space-x-2 ${
                  isSyncing
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isSyncing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Sync All Students</span>
                  </>
                )}
              </button>
              
              <button
                onClick={() => refetch()}
                disabled={isSyncing}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md font-medium text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Sync Status */}
          {isSyncing && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                <span className="text-sm font-medium text-blue-800">
                  Manual sync in progress... This may take several minutes.
                </span>
              </div>
            </div>
          )}

          {lastSyncTime && !isSyncing && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-sm font-medium text-green-800">
                    Last manual sync completed
                  </span>
                </div>
                <span className="text-xs text-green-600">
                  {formatLastSync(lastSyncTime)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Total Platforms', value: stats.total, color: 'bg-gray-100', textColor: 'text-gray-800', border: 'border-gray-300', filter: 'all' },
            { label: 'Completed', value: stats.completed, color: 'bg-green-100', textColor: 'text-green-800', border: 'border-green-300', filter: 'completed' },
            { label: 'In Progress', value: stats.inProgress, color: 'bg-yellow-100', textColor: 'text-yellow-800', border: 'border-yellow-300', filter: 'in_progress' },
            { label: 'Failed', value: stats.failed, color: 'bg-red-100', textColor: 'text-red-800', border: 'border-red-300', filter: 'failed' },
            { label: 'Not Started', value: stats.notStarted, color: 'bg-gray-100', textColor: 'text-gray-800', border: 'border-gray-300', filter: 'not_started' },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                filterStatus === stat.filter 
                  ? `${stat.border} ${stat.color} shadow-md` 
                  : 'bg-white border-gray-200 hover:shadow-sm'
              }`}
              onClick={() => setFilterStatus(stat.filter)}
            >
              <div className={`text-2xl font-bold ${stat.textColor}`}>
                {stat.value}
              </div>
              <div className="text-sm font-medium text-gray-600 mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Students Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Student Scraping Status</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {filteredStudents.length} of {students.length} students
                  {filterStatus !== 'all' && ` (filtered by ${filterStatus.replace('_', ' ')})`}
                </p>
              </div>
              
              {filterStatus !== 'all' && (
                <button
                  onClick={() => setFilterStatus('all')}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Clear Filter
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              <p className="mt-3 text-gray-500">Loading scraping status...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-gray-400 text-6xl mb-4">📊</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No students found</h3>
              <p className="text-gray-500">
                {students.length === 0 
                  ? "No students with platform URLs found." 
                  : "No students match the current filter."
                }
              </p>
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Platforms & Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Sync
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-800">
                              {student.name?.charAt(0).toUpperCase() || 'S'}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {student.name || 'Unknown Student'}
                            </div>
                            <div className="text-sm text-gray-500">
                              {student.email || 'No email'}
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          {Object.entries(student.platformUrls)
                            .filter(([_, url]) => url)
                            .map(([platform, url]) => {
                              const status = getPlatformStatus(student, platform);
                              const stats = getPlatformStats(student, platform);
                              
                              return (
                                <div key={platform} className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <span className="text-xs font-medium text-gray-700 capitalize min-w-20">
                                      {platform}
                                    </span>
                                    <div className="flex items-center space-x-2">
                                      <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`}></div>
                                      <span className={`text-xs font-medium ${getStatusTextColor(status)}`}>
                                        {getStatusText(status)}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {stats && (
                                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                      {stats}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatLastSync(student.lastUpdated)}
                        </div>
                        {student.lastAutoSync && (
                          <div className="text-xs text-gray-500">
                            Auto: {formatLastSync(student.lastAutoSync)}
                          </div>
                        )}
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleRetryStudent(student.id)}
                          disabled={isSyncing}
                          className={`text-blue-600 hover:text-blue-900 text-sm font-medium flex items-center space-x-1 ${
                            isSyncing ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Sync Now</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Information */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Click "Sync Now" to manually update student data from coding platforms
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Note: Syncing all students may take several minutes due to API rate limits
          </p>
        </div>
      </div>
    </div>
  );
};

export default ScrapingStatus;