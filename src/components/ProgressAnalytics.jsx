import { useMyProfile } from '../hooks/queries/useStudents';

const ProgressAnalytics = () => {
  // Was: useState + useEffect + a direct Firestore read of users/{uid}.
  // The profile is already in the query cache (AuthContext fetches it), so this
  // is a cache hit rather than a second network call.
  const { data: userData, isLoading: loading } = useMyProfile();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-2 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="animate-pulse">
            <div className="h-8 bg-surface-3 rounded w-1/3 mb-4"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[1,2,3,4].map(i => (
                <div key={i} className="bg-surface rounded-xl shadow-lg p-6">
                  <div className="h-6 bg-surface-3 rounded w-1/2 mb-4"></div>
                  <div className="h-64 bg-surface-2 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }



  return (
    <div className="min-h-screen bg-surface-2 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <div className="mb-4">
            <h1 className="text-3xl font-bold text-fg mb-2">Progress Analytics</h1>
            <p className="text-fg-muted">
              Track your coding journey with detailed insights and trends
            </p>
          </div>
        </div>
        
        {/* Profile & Export Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Profile Completion */}
          <div className="bg-surface rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-fg mb-4">Profile Completion</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-fg-muted">Profile Status</span>
                <span className="text-sm font-medium">Active</span>
              </div>
              <div className="bg-surface-3 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all duration-1000" 
                  style={{ width: '100%' }}></div>
              </div>
              <div className="text-xs text-fg-subtle">
                ✅ Profile is active and ready!
              </div>
            </div>
          </div>

          {/* Export Data */}
          <div className="bg-surface rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold text-fg mb-4">Export Your Data</h3>
            <div className="space-y-4">
              <div className="bg-surface-2 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {/* <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      📈
                    </div> */}
                    <div>
                      <p className="text-sm font-medium text-fg">Progress Report</p>
                      <p className="text-xs text-fg-subtle">Complete coding statistics</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-fg-subtle">Format: CSV</p>
                    <p className="text-xs text-fg-subtle">{new Date().toLocaleDateString()}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    const csvData = [
                      `Date,${today}`,
                      `Export Type,Progress Report`,
                      `Status,Active`
                    ].join('\n');
                    const blob = new Blob([csvData], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `progress-report-${today}.csv`;
                    a.click();
                  }}
                  className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download CSV Report
                </button>
              </div>
              {/* <div className="text-xs text-fg-subtle bg-blue-50 p-3 rounded-lg">
                ℹ️ Includes: Date, total problems, platform breakdown, and progress metrics
              </div> */}
            </div>
          </div>
        </div>


      </div>
    </div>
  );
};

export default ProgressAnalytics;