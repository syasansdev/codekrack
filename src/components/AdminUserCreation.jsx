import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';import * as XLSX from 'xlsx';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { useAdminScope } from '../hooks/useAdminScope';
import { useInstitutions } from '../hooks/queries/useInstitutions';
import { useCreateStudent } from '../hooks/queries/useStudents';

const AdminUserCreation = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formStep, setFormStep] = useState(1);

  // Institution assignment: super-admins pick one; institution admins are locked
  // to their own. Note this is a UI convenience only — the server re-derives the
  // institution from the caller's profile and IGNORES what's sent, so a tampered
  // dropdown can't place a student in another college.
  const { isSuperAdmin, institutionId: scopedInstitutionId } = useAdminScope();
  const { data: institutions = [] } = useInstitutions();
  const createStudentMutation = useCreateStudent();
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');

  useEffect(() => {
    if (!isSuperAdmin && scopedInstitutionId) {
      setSelectedInstitutionId(scopedInstitutionId);
    } else if (institutions.length === 1) {
      setSelectedInstitutionId(institutions[0].id);
    }
  }, [isSuperAdmin, scopedInstitutionId, institutions]);
  const [uploadMode, setUploadMode] = useState('single'); // 'single' or 'bulk'
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkData, setBulkData] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkResults, setBulkResults] = useState({ success: [], failed: [] });
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0, currentStudent: '' });
  const [studentData, setStudentData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    registerNumber: '',
    rollNumber: '',
    department: '',
    year: '',
    college: '',
    tenthPercentage: '',
    twelfthPercentage: '',
    platformUrls: {
      github: '',
      leetcode: '',
      codeforces: '',
      atcoder: '',
      hackerrank: '',
      linkedin: '',
      resume: ''
    }
  });

  const [formErrors, setFormErrors] = useState({
    name: '',
    email: '',
  });

  // Smart Excel Processing with AI fallback
  const processExcelWithAI = async (excelData) => {
    try {
      // Try AI processing first
      if (import.meta.env.VITE_GEMINI_API_KEY) {
        const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' });
        
        const prompt = `
Analyze this Excel data and extract student information. Map the data to these exact fields:
- name (full name)
- email (email address)
- phoneNumber (phone/mobile number)
- registerNumber (registration/reg number)
- rollNumber (roll number)
- department (department/branch)
- year (year of study, convert to number 1-4)
- college (college name)
- tenthPercentage (10th percentage, number only)
- twelfthPercentage (12th percentage, number only)
- github (GitHub URL, extract from any text)
- leetcode (LeetCode URL, extract from any text)
- codeforces (Codeforces URL, extract from any text)
- atcoder (AtCoder URL, extract from any text)
- hackerrank (HackerRank URL, extract from any text)
- linkedin (LinkedIn URL, extract from any text)
- resume (Resume/Drive URL, extract from any text)

For URLs that contain additional text, extract only the URL part.
Return ONLY a valid JSON array of objects with the above fields.
If a field is not found, use empty string "".

Excel Data:
${JSON.stringify(excelData, null, 2)}
        `;
        
        const result = await model.generateContent(prompt);
        const response = result.response.text();
        
        const jsonMatch = response.match(/\[.*\]/s);
        if (!jsonMatch) {
          throw new Error('No valid JSON found in AI response');
        }
        
        const parsedData = JSON.parse(jsonMatch[0]);
        return parsedData;
      }
    } catch (error) {
      console.warn('AI processing failed, using fallback:', error.message);
    }
    
    // Fallback: Smart column mapping
    return processExcelFallback(excelData);
  };
  
  // Fallback Excel processing without AI
  const processExcelFallback = (excelData) => {
    const fieldMappings = {
      name: ['name', 'student name', 'full name', 'student_name', 'fullname', 'student'],
      email: ['email', 'email address', 'email_address', 'mail', 'e-mail', 'gmail'],
      phoneNumber: ['phone', 'mobile', 'phone number', 'mobile number', 'contact', 'cell'],
      registerNumber: ['register', 'reg', 'register number', 'registration', 'reg_no', 'regno'],
      rollNumber: ['roll', 'roll number', 'roll_no', 'rollno', 'roll no', 'student roll', 'student_roll', 'admission', 'admission number', 'student id', 'id', 'student number'],
      department: ['department', 'dept', 'branch', 'stream', 'course'],
      year: ['year', 'academic year', 'study year', 'class', 'yr', 'sem', 'semester', 'batch'],
      college: ['college', 'institution', 'university', 'school'],
      tenthPercentage: ['10th', 'tenth', '10th percentage', 'sslc', '10th%'],
      twelfthPercentage: ['12th', 'twelfth', '12th percentage', 'hsc', 'puc', '12th%'],
      github: ['github', 'git', 'github profile', 'github url', 'github link'],
      leetcode: ['leetcode', 'leet', 'leetcode profile', 'leetcode url', 'leetcode link'],
      codeforces: ['codeforces', 'cf', 'codeforces profile', 'codeforces url'],
      atcoder: ['atcoder', 'at', 'atcoder profile', 'atcoder url'],
      hackerrank: ['hackerrank', 'hr', 'hackerrank profile', 'hackerrank url'],
      linkedin: ['linkedin', 'li', 'linkedin profile', 'linkedin url'],
      resume: ['resume', 'cv', 'drive', 'resume url', 'drive url', 'portfolio']
    };
    
    const extractUrl = (text) => {
      if (!text) return '';
      const urlRegex = /(https?:\/\/[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*)/g;
      const matches = text.toString().match(urlRegex);
      return matches ? matches[0] : text.toString().trim();
    };
    
    const detectUrlByContent = (text) => {
      if (!text) return null;
      const str = text.toString().toLowerCase();
      if (str.includes('leetcode.com')) return 'leetcode';
      if (str.includes('github.com')) return 'github';
      if (str.includes('codeforces.com')) return 'codeforces';
      if (str.includes('atcoder.jp')) return 'atcoder';
      if (str.includes('hackerrank.com')) return 'hackerrank';
      if (str.includes('linkedin.com')) return 'linkedin';
      if (str.includes('drive.google.com') || str.includes('docs.google.com')) return 'resume';
      return null;
    };
    
    // Filter out rows that are likely headers or empty
    const validData = excelData.filter(row => {
      const values = Object.values(row);
      const hasEmail = values.some(val => val && val.toString().includes('@'));
      const hasName = values.some(val => val && val.toString().length > 2 && !val.toString().toLowerCase().includes('name'));
      return hasEmail && hasName;
    });
    
    return validData.map(row => {
      const student = {};
      const rowKeys = Object.keys(row).map(k => k.toLowerCase().trim());
      
      // First pass: Map by column names
      Object.entries(fieldMappings).forEach(([field, possibleNames]) => {
        let value = '';
        
        for (const possibleName of possibleNames) {
          const matchingKey = rowKeys.find(key => key.includes(possibleName));
          if (matchingKey) {
            const originalKey = Object.keys(row).find(k => k.toLowerCase().trim() === matchingKey);
            value = row[originalKey];
            break;
          }
        }
        
        if (['github', 'leetcode', 'codeforces', 'atcoder', 'hackerrank', 'linkedin', 'resume'].includes(field)) {
          student[field] = extractUrl(value);
        } else {
          student[field] = value ? value.toString().trim() : '';
        }
      });
      
      // Second pass: Detect URLs by content in any column
      Object.entries(row).forEach(([key, value]) => {
        if (value) {
          const platform = detectUrlByContent(value);
          if (platform && !student[platform]) {
            student[platform] = extractUrl(value);
          }
        }
      });
      
      // Third pass: Fallback logic for missing fields
      // If no roll number found, try to use register number or look for numeric patterns
      if (!student.rollNumber && student.registerNumber) {
        student.rollNumber = student.registerNumber;
      }
      
      // If still no roll number, look for any numeric value that could be a roll number
      if (!student.rollNumber) {
        Object.entries(row).forEach(([key, value]) => {
          if (value && !student.rollNumber) {
            const str = value.toString().trim();
            // Look for patterns like numbers, alphanumeric codes
            if (/^[A-Za-z0-9]{3,15}$/.test(str) && str !== student.registerNumber && str !== student.name && !str.includes('@')) {
              const keyLower = key.toLowerCase();
              // Avoid mapping URLs or other obvious non-roll-number fields
              if (!keyLower.includes('http') && !keyLower.includes('www') && !keyLower.includes('percentage') && !keyLower.includes('phone')) {
                student.rollNumber = str;
              }
            }
          }
        });
      }
      
      return student;
    });
  };

  // Handle bulk file upload
  const handleBulkFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setBulkFile(file);
    setBulkProcessing(true);
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet);
      
      if (rawData.length === 0) {
        throw new Error('Excel file is empty');
      }
      
      toast.info('Processing Excel with AI...', { autoClose: 3000 });
      
      // Process with Gemini AI
      const processedData = await processExcelWithAI(rawData);
      
      if (!Array.isArray(processedData) || processedData.length === 0) {
        throw new Error('AI failed to extract valid student data');
      }
      
      setBulkData(processedData);
      toast.success(`Successfully processed ${processedData.length} students from Excel`);
      
    } catch (error) {
      console.error('Bulk upload error:', error);
      toast.error(error.message || 'Failed to process Excel file');
      setBulkFile(null);
    } finally {
      setBulkProcessing(false);
    }
  };

  // Process bulk upload
  const processBulkUpload = async () => {
    if (!selectedInstitutionId) {
      toast.error('Select an institution before adding students');
      return;
    }
    if (bulkData.length === 0) {
      toast.error('No data to process');
      return;
    }
    
    setBulkProcessing(true);
    const results = { success: [], failed: [] };
    setProcessingProgress({ current: 0, total: bulkData.length, currentStudent: '' });
    
    for (let i = 0; i < bulkData.length; i++) {
      const student = bulkData[i];
      
      // Update progress
      setProcessingProgress({ 
        current: i + 1, 
        total: bulkData.length, 
        currentStudent: student.name || 'Unknown Student' 
      });
      
      try {
        // Validate required fields
        if (!student.name || !student.email) {
          throw new Error('Missing required fields: name or email');
        }
        
        // Check for duplicate email
        const isDuplicate = await checkDuplicateEmail(student.email);
        if (isDuplicate) {
          throw new Error('Email already exists');
        }
        
        // Format platform URLs
        const platformUrls = {};
        ['github', 'leetcode', 'codeforces', 'atcoder', 'hackerrank', 'linkedin', 'resume'].forEach(platform => {
          if (student[platform]) {
            let url = student[platform].toString().trim();
            if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
              url = `https://${url}`;
            }
            platformUrls[platform] = url;
          }
        });
        
        // Created server-side: the backend owns role/institutionId and emails the
        // student a set-password link. (Creating client-side would sign us in as
        // each new student in turn and destroy the admin's session.)
        // No password comes back — there isn't one to come back.
        const { invited, inviteError } = await createStudentMutation.mutateAsync({
          name: student.name.trim(),
          email: student.email.toLowerCase().trim(),
          phoneNumber: student.phoneNumber?.toString().trim() || '',
          registerNumber: student.registerNumber?.toString().trim() || '',
          rollNumber: student.rollNumber?.toString().trim() || '',
          department: student.department || '',
          year: student.year?.toString() || '',
          college: student.college || '',
          tenthPercentage: student.tenthPercentage?.toString() || '',
          twelfthPercentage: student.twelfthPercentage?.toString() || '',
          platformUrls,
          institutionId: selectedInstitutionId || null,
        });

        results.success.push({
          name: student.name,
          email: student.email,
          rollNumber: student.rollNumber,
          department: student.department,
          college: student.college,
          // The account is fine either way; `invited` only says whether the
          // email went out. A false here is worth surfacing — that student can't
          // sign in until someone re-sends from Student Access.
          invited,
          inviteError,
        });
        
      } catch (error) {
        console.error(`Error processing student ${student.name}:`, error);
        results.failed.push({
          name: student.name || 'Unknown',
          email: student.email || 'Unknown',
          error: error.message
        });
      }
    }
    
    setBulkResults(results);
    setBulkProcessing(false);
    setProcessingProgress({ current: 0, total: 0, currentStudent: '' });
    
    // Show results
    if (results.success.length > 0) {
      toast.success(`Successfully added ${results.success.length} students`);
    }
    if (results.failed.length > 0) {
      toast.error(`Failed to add ${results.failed.length} students`);
    }
    
    // Show detailed results modal
    showBulkResultsModal(results);
  };

  // The password export is gone, along with the passwords.
  //
  // This block used to build an .xlsx / .csv / clipboard dump of every new
  // student's password, behind a banner reading "Share Passwords Securely" —
  // which is a contradiction. Once a credential is in a spreadsheet it is in
  // Downloads, in WhatsApp, in an inbox, and in a backup, forever. There is
  // nothing secure to do with that file.
  //
  // Students now get a single-use link by email and choose their own password.
  // The roster export below carries names and emails only: useful for
  // record-keeping, worthless to steal.
  const downloadRosterExcel = (results) => {
    const data = results.success.map((s) => ({
      'Student Name': s.name,
      Email: s.email,
      'Roll Number': s.rollNumber || '',
      Department: s.department || '',
      College: s.college || '',
      'Invite emailed': s.invited ? 'Yes' : 'NO — re-send from Student Access',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students Added');
    XLSX.writeFile(wb, `Students_Added_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const showBulkResultsModal = (results) => {
    const failedInvites = results.success.filter((s) => !s.invited);
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
      <div class="bg-surface rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl mx-4">
        <div class="p-6 border-b border-edge">
          <h3 class="text-xl font-bold text-fg">Bulk Upload Results</h3>
          <p class="text-sm text-fg-muted mt-1">
            Added: ${results.success.length} &nbsp;|&nbsp; Failed: ${results.failed.length}
          </p>
          ${
            results.success.length > 0
              ? `<div class="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                   <p class="text-sm font-semibold text-blue-900">Students set their own passwords</p>
                   <p class="text-xs text-blue-700 mt-1">
                     Each student has been emailed a link to choose a password. Nothing needs to be
                     shared by hand, and no password exists for anyone to pass on.
                   </p>
                 </div>`
              : ''
          }
          ${
            failedInvites.length > 0
              ? `<div class="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                   <p class="text-sm font-semibold text-amber-900">${failedInvites.length} invite email(s) failed to send</p>
                   <p class="text-xs text-amber-800 mt-1">
                     Those accounts exist but cannot be signed into yet. Re-send from
                     Admin → Student Access.
                   </p>
                 </div>`
              : ''
          }
        </div>

        <div class="p-6 overflow-y-auto max-h-[50vh]">
          ${
            results.success.length > 0
              ? `<div class="mb-6">
                   <h4 class="text-lg font-semibold text-green-700 mb-3">Added (${results.success.length})</h4>
                   <div class="space-y-2 max-h-48 overflow-y-auto">
                     ${results.success
                       .map(
                         (s) => `
                       <div class="bg-green-50 border border-green-200 rounded-lg p-3 flex justify-between items-center">
                         <div>
                           <p class="font-medium text-green-900">${s.name}</p>
                           <p class="text-sm text-green-700">${s.email}</p>
                         </div>
                         <span class="text-xs ${s.invited ? 'text-green-600' : 'text-amber-700 font-semibold'}">
                           ${s.invited ? 'invite sent' : 'invite FAILED'}
                         </span>
                       </div>`
                       )
                       .join('')}
                   </div>
                 </div>`
              : ''
          }
          ${
            results.failed.length > 0
              ? `<div>
                   <h4 class="text-lg font-semibold text-red-700 mb-3">Not added (${results.failed.length})</h4>
                   <div class="space-y-2 max-h-40 overflow-y-auto">
                     ${results.failed
                       .map(
                         (f) => `
                       <div class="bg-red-50 border border-red-200 rounded-lg p-3">
                         <p class="font-medium text-red-900">${f.name}</p>
                         <p class="text-sm text-red-700">${f.email}</p>
                         <p class="text-xs text-red-600 mt-1">${f.error}</p>
                       </div>`
                       )
                       .join('')}
                   </div>
                 </div>`
              : ''
          }
        </div>

        <div class="p-6 border-t border-edge flex gap-3">
          ${
            results.success.length > 0
              ? `<button id="ck-roster" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                   Download roster (.xlsx)
                 </button>`
              : ''
          }
          <button id="ck-close" class="flex-1 px-4 py-2 text-fg-muted bg-surface-2 rounded-lg hover:bg-surface-3 font-medium">Close</button>
          <button id="ck-students" class="flex-1 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium">View students</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    // Wired with real listeners rather than inline onclick + a window.XLSX
    // global. The old modal hung XLSX off window so its inline handlers could
    // reach it — that leaked the whole library onto the global object for the
    // life of the page.
    modal.querySelector('#ck-roster')?.addEventListener('click', () => downloadRosterExcel(results));
    modal.querySelector('#ck-close')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#ck-students')?.addEventListener('click', () => {
      modal.remove();
      navigate('/admin/students');
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  };

  // NOTE: temp passwords are now generated on the backend with a CSPRNG
  // (crypto.randomBytes) — see backend/routes/studentRoutes.js. The old
  // Math.random() generator that lived here was removed.

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setStudentData({
        ...studentData,
        [parent]: {
          ...studentData[parent],
          [child]: value
        }
      });
    } else {
      setStudentData({
        ...studentData,
        [name]: value
      });
    }
    
    // Clear any errors for the field being edited
    if (formErrors[name]) {
      setFormErrors({
        ...formErrors,
        [name]: ''
      });
    }
  };

  const validateUrls = () => {
    return true;
  };

  // Duplicate emails are now the SERVER's call, and it is the only one that can
  // answer correctly. This used to query Firestore for the email — which an
  // institution admin cannot even see outside their own scope, so a clashing
  // address in another college looked "available" and the create failed anyway.
  // POST /api/students checks against the whole table and returns a clean 400.
  const checkDuplicateEmail = async () => false;

  const validateForm = () => {
    const errors = {};
    
    if (!studentData.name.trim()) {
      errors.name = 'Name is required';
    }
    
    if (!studentData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(studentData.email)) {
      errors.email = 'Email is invalid';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    if (!selectedInstitutionId) {
      e.preventDefault();
      toast.error('Select an institution before adding a student');
      return;
    }
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }
    
    if (!validateUrls()) {
      return;
    }
    
    const isDuplicate = await checkDuplicateEmail(studentData.email);
    if (isDuplicate) {
      toast.error('A student with this email already exists');
      setFormErrors({
        ...formErrors,
        email: 'This email is already in use'
      });
      return;
    }
    
    try {
      setLoading(true);
      console.log('Creating student account...');
      
      const formattedUrls = {};
      Object.entries(studentData.platformUrls).forEach(([platform, url]) => {
        if (!url) return;
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          formattedUrls[platform] = `https://${url}`;
        } else {
          formattedUrls[platform] = url;
        }
      });
      
      // Created server-side. The backend owns role/isAdmin/institutionId, creates
      // the account with an unusable password, and emails the student a link to
      // set their own. Creating the account with the client SDK here would sign
      // the admin out and in as the new student.
      const { uid: userId, invited, inviteError } = await createStudentMutation.mutateAsync({
        name: studentData.name.trim(),
        email: studentData.email.toLowerCase().trim(),
        phoneNumber: studentData.phoneNumber.trim() || '',
        registerNumber: studentData.registerNumber.trim() || '',
        rollNumber: studentData.rollNumber.trim() || '',
        department: studentData.department || '',
        year: studentData.year || '',
        college: studentData.college || '',
        tenthPercentage: studentData.tenthPercentage || '',
        twelfthPercentage: studentData.twelfthPercentage || '',
        platformUrls: formattedUrls,
        institutionId: selectedInstitutionId || null,
      });

      // There is no password to show, copy, or "share securely" — the student
      // picks their own from the emailed link. What the admin needs to know is
      // simply whether that email actually went out.
      if (invited) {
        toast.success(`${studentData.name} added — set-password email sent to ${studentData.email}`, {
          autoClose: 6000,
        });
      } else {
        toast.warning(
          `${studentData.name} was added, but the invite email failed${inviteError ? ` (${inviteError})` : ''}. ` +
            `They cannot sign in yet — re-send it from Admin → Student Access.`,
          { autoClose: false }
        );
      }

      if (Object.keys(formattedUrls).length > 0) {
        toast.info('Profile scraping will be initiated by the backend', { autoClose: 5000 });
      }
      
      // Reset form after successful creation
      setTimeout(() => {
        handleReset();
        setFormStep(1);
      }, 3000);
      
    } catch (error) {
      // These used to branch on Firebase codes ('auth/email-already-in-use',
      // 'auth/weak-password', ...). Nothing raises those any more — the account
      // is created by our API, which returns a plain message — so every one of
      // those branches was dead and every real error fell through to the generic
      // catch-all. Matching on the server's actual message restores the useful
      // inline field error.
      const msg = error.message || 'Error adding student';
      if (/already registered|already exists/i.test(msg)) {
        toast.error('That email is already registered');
        setFormErrors({ ...formErrors, email: 'This email is already registered' });
      } else if (/valid email|invalid email/i.test(msg)) {
        toast.error('Invalid email format');
        setFormErrors({ ...formErrors, email: 'Invalid email format' });
      } else if (/institution/i.test(msg)) {
        toast.error(msg);
        setFormErrors({ ...formErrors, institution: msg });
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStudentData({
      name: '',
      email: '',
      phoneNumber: '',
      registerNumber: '',
      rollNumber: '',
      department: '',
      year: '',
      college: '',
      tenthPercentage: '',
      twelfthPercentage: '',
      platformUrls: {
        github: '',
        leetcode: '',
        codeforces: '',
        atcoder: '',
        hackerrank: '',
        linkedin: '',
        resume: ''
      }
    });
    setFormErrors({});
  };

  const platformIcons = {
    github: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
      </svg>
    ),
    leetcode: (
      <svg className="w-5 h-5" fill="#FFA116" viewBox="0 0 24 24">
        <path d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104a5.35 5.35 0 0 0-.125.513a5.527 5.527 0 0 0 .062 2.362a5.83 5.83 0 0 0 .349 1.017a5.938 5.938 0 0 0 1.271 1.818l4.277 4.193l.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .066-.523a2.545 2.545 0 0 1 .619-1.164L9.13 8.114c1.058-1.134 3.204-1.27 4.43-.278l3.501 2.831c.593.48 1.461.387 1.94-.207a1.384 1.384 0 0 0-.207-1.943l-3.5-2.831c-.8-.647-1.766-1.045-2.774-1.202l2.015-2.158A1.384 1.384 0 0 0 13.483 0zm-2.866 12.815a1.38 1.38 0 0 0-1.38 1.382 1.38 1.38 0 0 0 1.38 1.382H20.79a1.38 1.38 0 0 0 1.38-1.382 1.38 1.38 0 0 0-1.38-1.382z"/>
      </svg>
    ),
    codeforces: (
      <svg className="w-5 h-5" fill="#1F8ACB" viewBox="0 0 24 24">
        <path d="M4.5 7.5C5.328 7.5 6 8.172 6 9v10.5c0 .828-.672 1.5-1.5 1.5h-3C.672 21 0 20.328 0 19.5V9c0-.828.672-1.5 1.5-1.5h3zm9-4.5c.828 0 1.5.672 1.5 1.5v15c0 .828-.672 1.5-1.5 1.5h-3c-.828 0-1.5-.672-1.5-1.5v-15c0-.828.672-1.5 1.5-1.5h3zm9 7.5c.828 0 1.5.672 1.5 1.5v7.5c0 .828-.672 1.5-1.5 1.5h-3c-.828 0-1.5-.672-1.5-1.5V12c0-.828.672-1.5 1.5-1.5h3z"/>
      </svg>
    ),
    atcoder: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0l-8 4v8l8 4 8-4V4l-8-4zm0 2.208L17.385 5 12 7.792 6.615 5 12 2.208zM5 6.5l6 3v7l-6-3v-7zm8 10v-7l6-3v7l-6 3zm-1-12.5l5 2.5-5 2.5-5-2.5 5-2.5z"/>
      </svg>
    ),
    hackerrank: (
      <svg className="w-5 h-5" fill="#00EA64" viewBox="0 0 24 24">
        <path d="M12 0c1.285 0 9.75 4.886 10.392 6 .645 1.115.645 10.885 0 12S13.287 24 12 24s-9.75-4.885-10.395-6c-.641-1.115-.641-10.885 0-12C2.25 4.886 10.715 0 12 0zm2.295 6.799c-.141 0-.258.115-.258.258v3.875H9.963V6.908c0-.141-.116-.258-.258-.258H8.279c-.141 0-.258.115-.258.258v10.018c0 .143.117.258.258.258h1.426c.142 0 .258-.115.258-.258v-4.09h4.074v4.09c0 .143.116.258.258.258h1.426c.141 0 .258-.115.258-.258V6.908c0-.141-.117-.258-.258-.258h-1.426z"/>
      </svg>
    ),
    linkedin: (
      <svg className="w-5 h-5" fill="#0A66C2" viewBox="0 0 24 24">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    )
  };

  // Step indicator component
  const StepIndicator = () => (
    <div className="mb-8">
      <div className="flex justify-center">
        <div className="w-full max-w-md flex items-center">
          {/* Progress line */}
          <div className="w-full bg-surface-3 rounded h-1 flex items-center">
            <div 
              className="h-1 bg-blue-500 rounded transition-all duration-300" 
              style={{ width: formStep === 1 ? '50%' : '100%' }}
            ></div>
          </div>
          
          {/* Step markers overlaid on the line */}
          
        </div>
      </div>
      
      {/* Step labels */}
      <div className="flex justify-between max-w-md mx-auto text-xs mt-2 px-1 font-medium text-fg-muted">
        <span className={formStep >= 1 ? "text-blue-600" : ""}>Personal Info</span>
        <span className={formStep >= 2 ? "text-blue-600" : ""}>Coding Profiles</span>
      </div>
    </div>
  );

  return (
    <div>
      <div className="container mx-auto max-w-5xl h-full flex flex-col">        <div className="bg-surface rounded-xl overflow-hidden shadow-md border border-edge flex-1 flex flex-col max-h-[calc(100vh-2rem)]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-edge bg-surface-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-fg">Add New Student</h2>
            
            {/* Mode Toggle */}
            <div className="flex bg-surface-2 rounded-lg p-1">
              <button
                onClick={() => setUploadMode('single')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  uploadMode === 'single'
                    ? 'bg-surface text-blue-600 shadow-sm'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                Single Student
              </button>
              <button
                onClick={() => setUploadMode('bulk')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  uploadMode === 'bulk'
                    ? 'bg-surface text-blue-600 shadow-sm'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                Bulk Upload
              </button>
            </div>
          </div>
        </div>
        
        {/* Institution assignment — applies to both single and bulk */}
        <div className="px-5 sm:px-6 py-4 border-b border-edge bg-blue-50/40">
          <label className="block text-sm font-medium text-fg-muted mb-1">
            Institution <span className="text-red-500">*</span>
          </label>
          {isSuperAdmin ? (
            <>
              <select
                value={selectedInstitutionId}
                onChange={(e) => setSelectedInstitutionId(e.target.value)}
                className="w-full sm:max-w-md px-3 py-2 border border-edge-strong rounded-lg bg-surface focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">— Select an institution —</option>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.code ? ` (${i.code})` : ''}
                  </option>
                ))}
              </select>
              {institutions.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  No institutions yet — create one on the Institutions page first.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-fg-muted bg-surface border border-edge rounded-lg px-3 py-2 w-full sm:max-w-md">
              {institutions.find((i) => i.id === selectedInstitutionId)?.name || 'Your institution'}
              <span className="text-xs text-fg-subtle ml-2">(assigned automatically)</span>
            </p>
          )}
          <p className="text-xs text-fg-subtle mt-1">
            Students added here will belong to this institution.
          </p>
        </div>

        <div className="p-5 sm:p-6 flex-1 overflow-y-auto">
          {uploadMode === 'single' ? (
            <>
              <StepIndicator />
              <form onSubmit={handleSubmit}>
            {formStep === 1 && (
              <div className="space-y-6 animate-fade-in ">
                <div className="flex items-center mb-4 pb-1 border-b border-edge mb-10">
                  {/* <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div> */}
                  <h3 className="text-lg font-semibold text-fg">Personal Information</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-fg-muted mb-2">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={studentData.name}
                        onChange={handleInputChange}
                        required
                        className={`w-full px-4 py-2 border ${formErrors.name ? 'border-red-500 bg-red-50' : 'border-edge-strong'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300`}
                        placeholder="Enter full name"
                      />
                      {formErrors.name && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-fg-muted mb-2">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={studentData.email}
                        onChange={handleInputChange}
                        required
                        className={`w-full px-4 py-2 border ${formErrors.email ? 'border-red-500 bg-red-50' : 'border-edge-strong'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300`}
                        placeholder="student@example.com"
                      />
                      {formErrors.email && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.email}</p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="phoneNumber" className="block text-sm font-medium text-fg-muted mb-2">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      id="phoneNumber"
                      name="phoneNumber"
                      value={studentData.phoneNumber}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                      placeholder="+91 1234567890"
                    />
                  </div>

                  <div>
                    <label htmlFor="college" className="block text-sm font-medium text-fg-muted mb-2">
                      College
                    </label>
                    <div className="relative">
                      <select
                        id="college"
                        name="college"
                        value={studentData.college}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 appearance-none pr-10"
                      >
                        <option value="">Select College</option>
                        <option value="Engineering">Engineering</option>
                        <option value="Technology">Technology</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                        <svg className="w-5 h-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="department" className="block text-sm font-medium text-fg-muted mb-2">
                      Department
                    </label>
                    <div className="relative">
                      <select
                        id="department"
                        name="department"
                        value={studentData.department}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 appearance-none pr-10"
                      >
                        <option value="">Select Department</option>
                        <option value="CSE">Computer Science & Engineering</option>
                        <option value="IT">Information Technology</option>
                        <option value="ECE">Electronics & Communication</option>
                        <option value="EEE">Electrical & Electronics</option>
                        <option value="MECH">Mechanical Engineering</option>
                        <option value="CIVIL">Civil Engineering</option>
                        <option value="AI">AI & ML</option>
                        <option value="ADS">ADS</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                        <svg className="w-5 h-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="year" className="block text-sm font-medium text-fg-muted mb-2">
                      Year of Study
                    </label>
                    <div className="relative">
                      <select
                        id="year"
                        name="year"
                        value={studentData.year}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 appearance-none pr-10"
                      >
                        <option value="">Select Year</option>
                        <option value="1">1st Year</option>
                        <option value="2">2nd Year</option>
                        <option value="3">3rd Year</option>
                        <option value="4">4th Year</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                        <svg className="w-5 h-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="registerNumber" className="block text-sm font-medium text-fg-muted mb-2">
                      Register Number
                    </label>
                    <input
                      type="text"
                      id="registerNumber"
                      name="registerNumber"
                      value={studentData.registerNumber}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                      placeholder="REG12345"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="rollNumber" className="block text-sm font-medium text-fg-muted mb-2">
                      Roll Number
                    </label>
                    <input
                      type="text"
                      id="rollNumber"
                      name="rollNumber"
                      value={studentData.rollNumber}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                      placeholder="ROLL123"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="tenthPercentage" className="block text-sm font-medium text-fg-muted mb-2">
                      10th Percentage
                    </label>
                    <input
                      type="number"
                      id="tenthPercentage"
                      name="tenthPercentage"
                      value={studentData.tenthPercentage}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                      placeholder="85.5"
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="twelfthPercentage" className="block text-sm font-medium text-fg-muted mb-2">
                      12th Percentage
                    </label>
                    <input
                      type="number"
                      id="twelfthPercentage"
                      name="twelfthPercentage"
                      value={studentData.twelfthPercentage}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                      placeholder="90.2"
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-between gap-3 mt-8">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex items-center justify-center px-5 py-2 text-sm font-medium text-fg-muted bg-surface-2 rounded-lg hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-all duration-300"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Reset Form
                  </button>
                  <button
                    type="button"
                    onClick={() => validateForm() && setFormStep(2)}
                    className="flex items-center justify-center px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                  >
                    Continue to Coding Profiles
                    <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            
            {formStep === 2 && (
              <div className="space-y-6 animate-fade-in ">
                <div className="flex items-center mb-10 pb-1 border-b border-edge">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-fg ">
                    Coding Profiles
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pb-6">
                  <div>
                    <label htmlFor="github" className="flex items-center text-sm font-medium text-fg-muted mb-2">
                      {platformIcons.github}
                      <span className="ml-2">GitHub Profile</span>
                    </label>
                    <div className="relative mb-4">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none ">
                        <svg className="w-5 h-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        id="github"
                        name="platformUrls.github"
                        value={studentData.platformUrls.github}
                        onChange={handleInputChange}
                        className="w-full pl-10 px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                        placeholder="github.com/username"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="leetcode" className="flex items-center text-sm font-medium text-fg-muted mb-2">
                      {platformIcons.leetcode}
                      <span className="ml-2">LeetCode Profile</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg className="w-5 h-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        id="leetcode"
                        name="platformUrls.leetcode"
                        value={studentData.platformUrls.leetcode}
                        onChange={handleInputChange}
                        className="w-full pl-10 px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                        placeholder="leetcode.com/username"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="codeforces" className="flex items-center text-sm font-medium text-fg-muted mb-2">
                      {platformIcons.codeforces}
                      <span className="ml-2">Codeforces Profile</span>
                    </label>
                    <div className="relative mb-4">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg className="w-5 h-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        id="codeforces"
                        name="platformUrls.codeforces"
                        value={studentData.platformUrls.codeforces}
                        onChange={handleInputChange}
                        className="w-full pl-10 px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                        placeholder="codeforces.com/profile/username"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="atcoder" className="flex items-center text-sm font-medium text-fg-muted mb-2">
                      {platformIcons.atcoder}
                      <span className="ml-2">AtCoder Profile</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg className="w-5 h-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        id="atcoder"
                        name="platformUrls.atcoder"
                        value={studentData.platformUrls.atcoder}
                        onChange={handleInputChange}
                        className="w-full pl-10 px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                        placeholder="atcoder.jp/users/username"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="hackerrank" className="flex items-center text-sm font-medium text-fg-muted mb-2">
                      {platformIcons.hackerrank}
                      <span className="ml-2">HackerRank Profile</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg className="w-5 h-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        id="hackerrank"
                        name="platformUrls.hackerrank"
                        value={studentData.platformUrls.hackerrank}
                        onChange={handleInputChange}
                        className="w-full pl-10 px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                        placeholder="hackerrank.com/username"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="linkedin" className="flex items-center text-sm font-medium text-fg-muted mb-2">
                      {platformIcons.linkedin}
                      <span className="ml-2">LinkedIn Profile</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg className="w-5 h-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        id="linkedin"
                        name="platformUrls.linkedin"
                        value={studentData.platformUrls.linkedin}
                        onChange={handleInputChange}
                        className="w-full pl-10 px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                        placeholder="linkedin.com/in/username"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="resume" className="flex items-center text-sm font-medium text-fg-muted mb-2">
                      <svg className="w-5 h-5 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="ml-2">Resume Drive URL</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg className="w-5 h-5 text-fg-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <input
                        type="url"
                        id="resume"
                        name="platformUrls.resume"
                        value={studentData.platformUrls.resume}
                        onChange={handleInputChange}
                        className="w-full pl-10 px-4 py-2 border border-edge-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                        placeholder="drive.google.com/file/d/..."
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-between gap-3 mt-8">
                  <button
                    type="button"
                    onClick={() => setFormStep(1)}
                    className="flex items-center justify-center px-5 py-2 text-sm font-medium text-fg-muted bg-surface-2 rounded-lg hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-all duration-300"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/admin/students')}
                      className="flex items-center justify-center px-5 py-2 text-sm font-medium text-fg-muted bg-surface-2 rounded-lg hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-all duration-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex items-center justify-center px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed transition-all duration-300"
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Adding Student...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          Add Student
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
            </>
          ) : (
            /* Bulk Upload Mode */
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-fg mb-2">Bulk Student Upload</h3>
                <p className="text-sm text-fg-muted mb-6">
                  Upload an Excel file with student data. Our AI will automatically detect and map your columns.
                </p>
              </div>
              
              {!bulkFile ? (
                <div className="border-2 border-dashed border-edge-strong rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleBulkFileUpload}
                    className="hidden"
                    id="bulk-upload"
                    disabled={bulkProcessing}
                  />
                  <label htmlFor="bulk-upload" className="cursor-pointer">
                    <div className="w-12 h-12 bg-surface-2 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 h-6 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-lg font-medium text-fg mb-2">Choose Excel File</p>
                    <p className="text-sm text-fg-subtle">Supports .xlsx and .xls files</p>
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="font-medium text-green-900">{bulkFile.name}</p>
                        <p className="text-sm text-green-700">{bulkData.length} students detected</p>
                      </div>
                    </div>
                  </div>
                  
                  {bulkData.length > 0 && (
                    <div className="bg-surface-2 rounded-lg p-4">
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                        <h5 className="font-medium text-blue-900 mb-2">Raw Excel Data (First Row)</h5>
                        <div className="text-xs text-blue-800 max-h-20 overflow-y-auto">
                          {JSON.stringify(Object.keys(bulkData[0] || {}), null, 2)}
                        </div>
                      </div>
                      <h4 className="font-medium text-fg mb-3">Preview (First 3 students) - All Fields</h4>
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {bulkData.slice(0, 3).map((student, index) => (
                          <div key={index} className="bg-surface border border-edge rounded p-4 text-sm">
                            <div className="font-semibold text-blue-600 mb-2">Student {index + 1}</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div><strong>Name:</strong> {student.name || 'N/A'}</div>
                              <div><strong>Email:</strong> {student.email || 'N/A'}</div>
                              <div><strong>Phone:</strong> {student.phoneNumber || 'N/A'}</div>
                              <div><strong>Register No:</strong> {student.registerNumber || 'N/A'}</div>
                              <div><strong>Roll No:</strong> {student.rollNumber || 'N/A'}</div>
                              <div><strong>Department:</strong> {student.department || 'N/A'}</div>
                              <div><strong>Year:</strong> {student.year || 'N/A'}</div>
                              <div><strong>College:</strong> {student.college || 'N/A'}</div>
                              <div><strong>10th %:</strong> {student.tenthPercentage || 'N/A'}</div>
                              <div><strong>12th %:</strong> {student.twelfthPercentage || 'N/A'}</div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-edge">
                              <div className="font-medium text-fg-muted mb-2">Platform URLs:</div>
                              <div className="grid grid-cols-1 gap-1 text-xs">
                                <div><strong>GitHub:</strong> {student.github || 'N/A'}</div>
                                <div><strong>LeetCode:</strong> {student.leetcode || 'N/A'}</div>
                                <div><strong>Codeforces:</strong> {student.codeforces || 'N/A'}</div>
                                <div><strong>AtCoder:</strong> {student.atcoder || 'N/A'}</div>
                                <div><strong>HackerRank:</strong> {student.hackerrank || 'N/A'}</div>
                                <div><strong>LinkedIn:</strong> {student.linkedin || 'N/A'}</div>
                                <div><strong>Resume:</strong> {student.resume || 'N/A'}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {bulkData.length > 3 && (
                        <p className="text-xs text-fg-subtle mt-2">...and {bulkData.length - 3} more students</p>
                      )}
                    </div>
                  )}
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setBulkFile(null);
                        setBulkData([]);
                        setBulkResults({ success: [], failed: [] });
                      }}
                      className="flex-1 px-4 py-2 text-fg-muted bg-surface-2 rounded-lg hover:bg-surface-3 transition-colors font-medium"
                      disabled={bulkProcessing}
                    >
                      Choose Different File
                    </button>
                    <button
                      onClick={processBulkUpload}
                      disabled={bulkProcessing || bulkData.length === 0}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {bulkProcessing ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </>
                      ) : (
                        `Upload ${bulkData.length} Students`
                      )}
                    </button>
                  </div>
                </div>
              )}
              
              {bulkProcessing && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center mb-3">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <div className="flex-1">
                      <p className="font-medium text-blue-900">
                        Processing {processingProgress.current}/{processingProgress.total} students
                      </p>
                      <p className="text-sm text-blue-700">
                        Current: {processingProgress.currentStudent}
                      </p>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                      style={{ 
                        width: `${processingProgress.total > 0 ? (processingProgress.current / processingProgress.total) * 100 : 0}%` 
                      }}
                    ></div>
                  </div>
                  
                  <div className="flex justify-between text-xs text-blue-600 mt-1">
                    <span>{Math.round((processingProgress.current / processingProgress.total) * 100)}% Complete</span>
                    <span>ETA: ~{Math.max(1, Math.ceil((processingProgress.total - processingProgress.current) * 2))}s</span>
                  </div>
                </div>
              )}
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-yellow-800 mb-1">Smart Column Detection</p>
                    <p className="text-xs text-yellow-700">
                      {import.meta.env.VITE_GEMINI_API_KEY ? 
                        'AI-powered column detection with smart fallback mapping.' : 
                        'Intelligent column mapping that handles various Excel formats automatically.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 text-center text-sm text-fg-subtle border-t border-edge bg-surface-2">
          <p>After adding a student, a temporary password will be generated and stored securely.</p>
        </div>
        </div>
        
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in {
            animation: fadeIn 0.3s ease-out forwards;
          }
        `}</style>
      </div>
    </div>
  );
};

export default AdminUserCreation;