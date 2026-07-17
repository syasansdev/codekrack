import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useUpdateMyProfile } from '../hooks/queries/useStudents';
import ChangePassword from '../components/ChangePassword';

// --- Reusable SVG Icons for Tabs ---
const UserIcon = () => (
  <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const TABS = [
  { id: 'profile', label: 'Edit Profile', icon: <UserIcon /> },
  { id: 'security', label: 'Security', icon: <ShieldIcon /> },
];

const Profile = () => {
  // refreshUserData was destructured here but the context never exported it, so
  // `if (refreshUserData) await refreshUserData()` was always a no-op — the page
  // showed stale values until a reload. React Query's cache update replaces it.
  const { currentUser, userData } = useAuth();
  const updateProfile = useUpdateMyProfile();
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const loading = updateProfile.isPending;

  // NOTE: this form is intentionally local state — form inputs are CLIENT state
  // (what you're typing), not server state. React Query owns `userData`; this
  // owns the draft, and the two only meet on submit.
  const [formData, setFormData] = useState({
    name: '',
    department: '',
    year: '',
    college: '',
    phoneNumber: '',
    resumeUrl: '',
  });

  useEffect(() => {
    if (userData) {
      setFormData({
        name: userData.name || '',
        department: userData.department || '',
        year: userData.year || '',
        college: userData.college || '',
        // BUG FIX: this read userData.phone and saved to `phone`, while the rest
        // of the app (and the DB column) uses phoneNumber. The field always
        // rendered blank and every save wrote to a ghost field nothing read —
        // editing your phone number here has never worked.
        phoneNumber: userData.phoneNumber || '',
        resumeUrl: userData.platformUrls?.resume || '',
      });
    }
  }, [userData]);

  // Fixed handleInputChange function
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: value 
    }));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    try {
      // Send only `resume` — not the whole spread of userData.platformUrls. The
      // server ignores scraped platform URLs from a student anyway (they decide
      // leaderboard numbers), so echoing them back would be noise at best.
      await updateProfile.mutateAsync({
        name: formData.name,
        department: formData.department,
        year: formData.year,
        college: formData.college,
        phoneNumber: formData.phoneNumber,
        platformUrls: { resume: formData.resumeUrl },
      });

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      setIsEditing(false);
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.message || 'Failed to update profile. Please try again.',
      });
    }
  };

  const handleResetForm = () => {
    if (userData) {
      setFormData({
        name: userData.name || '',
        department: userData.department || '',
        year: userData.year || '',
        college: userData.college || '',
        phoneNumber: userData.phoneNumber || '',
        resumeUrl: userData.platformUrls?.resume || '',
      });
    }
    setMessage({ type: '', text: '' });
  };
  
  const contentVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: 'easeInOut' } },
    exit: { opacity: 0, x: -20, transition: { duration: 0.2, ease: 'easeInOut' } }
  };

  if (!userData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Account Settings</h1>
          <p className="text-gray-600 mt-2">
            Hello, <span className="font-semibold text-blue-600">{userData.name || 'User'}</span>! Manage your profile and security settings.
          </p>
        </motion.div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* --- Left Navigation Panel --- */}
          <div className="md:col-span-1">
            <nav className="flex flex-col space-y-2">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors relative ${
                    activeTab === tab.id 
                      ? 'text-white' 
                      : 'text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTabIndicator"
                      className="absolute inset-0 bg-blue-600 rounded-lg z-0"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  <div className="relative z-10 flex items-center">
                    {tab.icon}
                    {tab.label}
                  </div>
                </button>
              ))}
            </nav>
          </div>

          {/* --- Right Content Panel --- */}
          <div className="md:col-span-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                {activeTab === 'profile' && (
                  <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-200">
                      <h2 className="text-2xl font-semibold text-gray-900">Your Information</h2>
                      <p className="text-gray-500 mt-1">Update your personal details here.</p>
                    </div>
                    
                    <form onSubmit={handleSaveProfile} className="p-6 space-y-6">
                      {message.text && (
                        <div className={`p-4 rounded-lg text-sm ${
                          message.type === 'error' 
                            ? 'bg-red-50 text-red-700 border border-red-200' 
                            : 'bg-green-50 text-green-700 border border-green-200'
                        }`}>
                          {message.text}
                        </div>
                      )}
                      
                      {/* Name & Email */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Full Name
                          </label>
                          <input 
                            type="text" 
                            name="name" 
                            value={formData.name} 
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                            placeholder="Enter your full name"
                            required 
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Email Address
                          </label>
                          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
                            {currentUser?.email || 'No email available'}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                        </div>
                      </div>
                      
                      {/* Department & Year */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Department
                          </label>
                          <select 
                            name="department" 
                            value={formData.department} 
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                          >
                            <option value="">Select Department</option>
                            <option value="Computer Science">Computer Science</option>
                            <option value="Information Technology">Information Technology</option>
                            <option value="Computer Engineering">Computer Engineering</option>
                            <option value="Electronics and Communication">Electronics and Communication</option>
                            <option value="Mechanical Engineering">Mechanical Engineering</option>
                            <option value="Civil Engineering">Civil Engineering</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Academic Year
                          </label>
                          <select 
                            name="year" 
                            value={formData.year} 
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                          >
                            <option value="">Select Year</option>
                            <option value="1">First Year</option>
                            <option value="2">Second Year</option>
                            <option value="3">Third Year</option>
                            <option value="4">Fourth Year</option>
                          </select>
                        </div>
                      </div>
                      
                      {/* College & Phone */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            College
                          </label>
                          <input 
                            type="text" 
                            name="college" 
                            value={formData.college} 
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                            placeholder="Enter your college name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            name="phoneNumber"
                            value={formData.phoneNumber}
                            onChange={handleInputChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                            placeholder="Enter your phone number"
                          />
                        </div>
                      </div>
                      
                      {/* Resume URL */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Resume Drive URL
                        </label>
                        <input 
                          type="url" 
                          name="resumeUrl" 
                          value={formData.resumeUrl} 
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                          placeholder="https://drive.google.com/file/d/..."
                        />
                        <p className="text-xs text-gray-500 mt-1">Share your Google Drive resume link here</p>
                      </div>
                      
                      <div className="pt-6 border-t border-gray-200 flex justify-end gap-3">
                        <motion.button 
                          type="button" 
                          onClick={handleResetForm}
                          className="px-6 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition-colors duration-200"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          Reset Changes
                        </motion.button>
                        <motion.button 
                          type="submit" 
                          disabled={loading}
                          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                          whileHover={{ scale: loading ? 1 : 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {loading ? (
                            <span className="flex items-center">
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Saving...
                            </span>
                          ) : 'Save Changes'}
                        </motion.button>
                      </div>
                    </form>
                  </div>
                )}
                
                {activeTab === 'security' && (
                  <div className="bg-white rounded-xl shadow-lg border border-gray-200">
                    <div className="p-6 border-b border-gray-200">
                      <h2 className="text-2xl font-semibold text-gray-900">Password & Security</h2>
                      <p className="text-gray-500 mt-1">Manage your password to keep your account secure.</p>
                    </div>
                    
                    <div className="p-6 space-y-6">
                      <div className="flex flex-col sm:flex-row items-start p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4 sm:mb-0 sm:mr-4">
                          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                          </svg>
                        </div>
                        <div>
                          <h4 className="font-semibold text-blue-900">Security Tip</h4>
                          <p className="text-sm text-blue-800 mt-1">
                            For the best security, your new password should be at least 8 characters long and include a mix of letters, numbers, and symbols.
                          </p>
                        </div>
                      </div>
                      
                      <div className="pt-6 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-800 text-lg">Change Password</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Last changed on {userData.passwordLastChanged ? new Date(userData.passwordLastChanged.seconds * 1000).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                        <motion.button 
                          onClick={() => setIsChangePasswordOpen(true)} 
                          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors duration-200 whitespace-nowrap"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          Change Password
                        </motion.button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
      
      <ChangePassword 
        isOpen={isChangePasswordOpen} 
        onClose={() => setIsChangePasswordOpen(false)} 
      />
    </div>
  );
};

export default Profile;