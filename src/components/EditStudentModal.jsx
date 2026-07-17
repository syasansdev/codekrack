import { useState, useEffect } from 'react';
import { useUpdateStudent } from '../hooks/queries/useStudents';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';

const PlatformIcon = ({ platform }) => {
  const icons = {
    leetcode: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-yellow-600">
        <path fill="currentColor" d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 1.271 1.818l4.277 4.193.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .066-.523 2.545 2.545 0 0 1 .619-1.164L9.13 8.114c1.058-1.134 3.204-1.27 4.43-.278l3.501 2.831c.593.48 1.461.387 1.94-.207a1.384 1.384 0 0 0-.207-1.943l-3.5-2.831c-.8-.647-1.766-1.045-2.774-1.202l2.015-2.158A1.384 1.384 0 0 0 13.483 0zm-2.866 12.815a1.38 1.38 0 0 0-1.38 1.382 1.38 1.38 0 0 0 1.38 1.382H20.79a1.38 1.38 0 0 0 1.38-1.382 1.38 1.38 0 0 0-1.38-1.382z"/>
      </svg>
    ),
    codeforces: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-600">
        <path fill="currentColor" d="M4.5 7.5A1.5 1.5 0 0 1 6 9v10.5A1.5 1.5 0 0 1 4.5 21h-3A1.5 1.5 0 0 1 0 19.5V9a1.5 1.5 0 0 1 1.5-1.5h3zm9-4.5A1.5 1.5 0 0 1 15 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 19.5v-15A1.5 1.5 0 0 1 10.5 3h3zm9 7.5A1.5 1.5 0 0 1 24 12v7.5a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5h3z"/>
      </svg>
    ),
    atcoder: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-orange-600">
        <path fill="currentColor" d="M7.2 3.6c-.4 0-.8.2-1 .6L.4 16.8c-.4.6-.1 1.4.5 1.8.2.1.4.2.6.2h11.8c.7 0 1.2-.6 1.2-1.2 0-.2-.1-.4-.2-.6L8.5 4.4c-.3-.5-.8-.8-1.3-.8zm8.6 6c-.4 0-.8.2-1 .6l-3.6 6.6c-.4.6-.1 1.4.5 1.8.2.1.4.2.6.2h7.4c.7 0 1.2-.6 1.2-1.2 0-.2-.1-.4-.2-.6l-3.6-6.6c-.3-.5-.8-.8-1.3-.8z"/>
      </svg>
    ),
    github: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-fg">
        <path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    )
  };
  return icons[platform] || null;
};

const EditStudentModal = ({ student, onClose, onUpdate }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    registerNumber: '',
    rollNumber: '',
    department: '',
    year: '',
    phoneNumber: '',
    platformUrls: {
      leetcode: '',
      codeforces: '',
      atcoder: '',
      github: ''
    }
  });
  const updateStudent = useUpdateStudent();
  const loading = updateStudent.isPending;
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (student) {
      setFormData({
        name: student.name || '',
        email: student.email || '',
        registerNumber: student.registerNumber || '',
        rollNumber: student.rollNumber || '',
        department: student.department || '',
        year: student.year || '',
        phoneNumber: student.phoneNumber || '',
        platformUrls: {
          leetcode: student.platformUrls?.leetcode || '',
          codeforces: student.platformUrls?.codeforces || '',
          atcoder: student.platformUrls?.atcoder || '',
          github: student.platformUrls?.github || ''
        }
      });
    }
  }, [student]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    const urlPatterns = {
      leetcode: /^https?:\/\/(www\.)?leetcode\.com\/(u\/)?[a-zA-Z0-9_-]+\/?$/,
      codeforces: /^https?:\/\/(www\.)?codeforces\.com\/profile\/[a-zA-Z0-9_-]+\/?$/,
      atcoder: /^https?:\/\/(www\.)?atcoder\.jp\/users\/[a-zA-Z0-9_-]+\/?$/,
      github: /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/
    };

    Object.entries(formData.platformUrls).forEach(([platform, url]) => {
      if (url && !urlPatterns[platform].test(url)) {
        newErrors[`platformUrls.${platform}`] = `Invalid ${platform} URL format`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      // The server normalises URLs (adds https://), so we send them as typed.
      // `email` is NOT sent: changing it would have to change the auth login
      // too, and updateDoc only ever rewrote the profile copy — leaving the
      // student still signing in with the OLD address while the UI showed the
      // new one. It's read-only here until there's a proper change-email flow.
      const updated = await updateStudent.mutateAsync({
        id: student.id,
        name: formData.name.trim(),
        registerNumber: formData.registerNumber.trim(),
        rollNumber: formData.rollNumber.trim(),
        department: formData.department.trim(),
        year: formData.year.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        platformUrls: formData.platformUrls,
      });

      toast.success('Student updated successfully!');
      // The server returns the saved row, so the parent gets what was actually
      // persisted rather than an optimistic guess assembled from form state.
      onUpdate(updated);
      onClose();
    } catch (error) {
      toast.error('Failed to update student: ' + error.message);
    }
  };

  const handleInputChange = (field, value) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }

    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  const platformLabels = {
    leetcode: 'LeetCode',
    codeforces: 'Codeforces',
    atcoder: 'AtCoder',
    github: 'GitHub'
  };

  const platformPlaceholders = {
    leetcode: 'https://leetcode.com/username',
    codeforces: 'https://codeforces.com/profile/username',
    atcoder: 'https://atcoder.jp/users/username',
    github: 'https://github.com/username'
  };

  const getInitials = (name = '') => {
    const parts = name.split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-surface rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-8 py-6 border-b border-edge bg-surface-2">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center text-lg font-bold shadow-lg">
                  {getInitials(student?.name)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-fg tracking-tight">Edit Student Profile</h2>
                  <p className="text-sm text-fg-muted mt-1">Update student information and platform URLs</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-fg-subtle hover:text-fg-muted hover:bg-surface-3 rounded-full p-2 transition-all duration-200 hover:rotate-90"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(95vh-180px)]">
            <div className="p-8 space-y-8">
              {/* Basic Information */}
              <div className="bg-surface border border-edge rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  {/* <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div> */}
                  <h3 className="text-xl font-bold text-fg">Basic Information</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-fg-muted mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${errors.name ? 'border-red-400 bg-red-50' : 'border-edge-strong hover:border-edge-strong'}`}
                      placeholder="Enter student full name"
                    />
                    {errors.name && <p className="text-red-500 text-xs mt-2 flex items-center gap-1"><span>⚠️</span>{errors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-fg-muted mb-2">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${errors.email ? 'border-red-400 bg-red-50' : 'border-edge-strong hover:border-edge-strong'}`}
                      placeholder="student@example.com"
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-2 flex items-center gap-1"><span>⚠️</span>{errors.email}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-fg-muted mb-2">
                      Register Number
                    </label>
                    <input
                      type="text"
                      value={formData.registerNumber}
                      onChange={(e) => handleInputChange('registerNumber', e.target.value)}
                      className="w-full px-4 py-3 border border-edge-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-edge-strong transition-all duration-200"
                      placeholder="Enter register number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-fg-muted mb-2">
                      Roll Number
                    </label>
                    <input
                      type="text"
                      value={formData.rollNumber}
                      onChange={(e) => handleInputChange('rollNumber', e.target.value)}
                      className="w-full px-4 py-3 border border-edge-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-edge-strong transition-all duration-200"
                      placeholder="Enter roll number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-fg-muted mb-2">
                      Department
                    </label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => handleInputChange('department', e.target.value)}
                      className="w-full px-4 py-3 border border-edge-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-edge-strong transition-all duration-200"
                      placeholder="Computer Science"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-fg-muted mb-2">
                      Academic Year
                    </label>
                    <select
                      value={formData.year}
                      onChange={(e) => handleInputChange('year', e.target.value)}
                      className="w-full px-4 py-3 border border-edge-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-edge-strong transition-all duration-200 bg-surface"
                    >
                      <option value="">Select Year</option>
                      <option value="1">1st Year</option>
                      <option value="2">2nd Year</option>
                      <option value="3">3rd Year</option>
                      <option value="4">4th Year</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6">
                  <label className="block text-sm font-semibold text-fg-muted mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                    className="w-full px-4 py-3 border border-edge-strong rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-edge-strong transition-all duration-200"
                    placeholder="+91 9876543210"
                  />
                </div>
              </div>

              {/* Platform URLs */}
              <div className="bg-surface border border-edge rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-fg">Platform URLs</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {Object.entries(platformLabels).map(([platform, label]) => (
                    <div key={platform} className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
                        <PlatformIcon platform={platform} />
                        {label} Profile URL
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <div className="w-[25px] h-[25px] bg-surface-3 rounded flex items-center justify-center">
                            <svg className="w-4 h-4 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          </div>
                        </div>
                        <input
                          type="url"
                          value={formData.platformUrls[platform]}
                          onChange={(e) => handleInputChange(`platformUrls.${platform}`, e.target.value)}
                          className={`w-full pl-12 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${errors[`platformUrls.${platform}`] ? 'border-red-400 bg-red-50' : 'border-edge-strong hover:border-edge-strong'}`}
                          placeholder={platformPlaceholders[platform]}
                        />
                      </div>
                      {errors[`platformUrls.${platform}`] && (
                        <p className="text-red-500 text-xs flex items-center gap-1"><span>⚠️</span>{errors[`platformUrls.${platform}`]}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-6 border-t border-edge bg-surface-2 flex justify-between items-center">
              <div className="text-sm text-fg-subtle">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  All changes will be saved immediately
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-6 py-3 text-fg-muted bg-surface border border-edge-strong rounded-xl hover:bg-surface-2 disabled:opacity-50 transition-all duration-200 font-medium hover:scale-105 transform"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 font-medium shadow-lg hover:shadow-xl hover:scale-105 transform"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Updating Profile...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Update Student Profile
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EditStudentModal;