// src/components/StudentOnboardingForm.jsx
//
// Student self-registration. This replaced an embedded Google Form, and the
// difference is not cosmetic: a form response was a row in a spreadsheet that
// somebody had to read and re-key into the admin screen. This creates the
// account. The student picks their own password and signs in immediately —
// there is no approval step, no verification code and no invite email.
//
// THE COLLEGE FIELD IS A DROPDOWN, NEVER A TEXT BOX. Institutions are created
// by the super-admin, and the form submits the institution's id. A typed
// college name would give us "SJCE", "S.J.C.E", "sjce " and "St Josephs" as
// four different colleges on the same leaderboard, and nothing downstream could
// tell they were one place. Picking from the list is what makes every student at
// a college land on the same institution row.
//
// The server re-validates everything here and derives `college` from the chosen
// institution, so nothing in this file is a security control — it exists to
// catch mistakes before a round trip, not to be trusted.
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { usePublicInstitutions } from '../hooks/queries/useInstitutions';
import { studentsApi } from '../services/api';

const YEARS = [
  { value: '1', label: '1st Year' },
  { value: '2', label: '2nd Year' },
  { value: '3', label: '3rd Year' },
  { value: '4', label: '4th Year' },
];

// Same list the admin create form offers, so a self-registered student and an
// admin-created one are filterable together rather than nearly-together.
const DEPARTMENTS = [
  { value: 'CSE', label: 'Computer Science & Engineering' },
  { value: 'IT', label: 'Information Technology' },
  { value: 'ECE', label: 'Electronics & Communication' },
  { value: 'EEE', label: 'Electrical & Electronics' },
  { value: 'MECH', label: 'Mechanical Engineering' },
  { value: 'CIVIL', label: 'Civil Engineering' },
  { value: 'AI', label: 'AI & ML' },
  { value: 'ADS', label: 'ADS' },
];

const PLATFORM_FIELDS = [
  { key: 'leetcode', label: 'LeetCode', placeholder: 'leetcode.com/u/username' },
  { key: 'github', label: 'GitHub', placeholder: 'github.com/username' },
  { key: 'codeforces', label: 'Codeforces', placeholder: 'codeforces.com/profile/username' },
  { key: 'atcoder', label: 'AtCoder', placeholder: 'atcoder.jp/users/username' },
  { key: 'hackerrank', label: 'HackerRank', placeholder: 'hackerrank.com/profile/username' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/username' },
  { key: 'resume', label: 'Resume link', placeholder: 'drive.google.com/file/d/...' },
];

const MIN_PASSWORD_LENGTH = 8;

const EMPTY = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  phoneNumber: '',
  registerNumber: '',
  rollNumber: '',
  department: '',
  year: '',
  institutionId: '',
  tenthPercentage: '',
  twelfthPercentage: '',
  platformUrls: PLATFORM_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {}),
};

const Field = ({ label, error, required, children, hint }) => (
  <div>
    <label className="block text-sm font-medium text-fg-muted mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {hint && !error && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
  </div>
);

const inputCls =
  'w-full px-3 py-2 border border-edge-strong rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition bg-surface text-fg';

const StudentOnboardingForm = ({ isOpen = true, onClose, onSignIn }) => {
  const navigate = useNavigate();
  const {
    data: institutions = [],
    isLoading: institutionsLoading,
    error: institutionsError,
  } = usePublicInstitutions({ enabled: isOpen });

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [done, setDone] = useState(false);

  // A field no human sees and no browser autofills. Anything in it came from a
  // bot walking the DOM, and the server drops the request. Hidden with inert
  // styling rather than type="hidden" so a naive form-filler still finds it.
  const [honeypot, setHoneypot] = useState('');

  // The college picker is a search box over the list, not a bare <select>: with
  // a few dozen colleges onboarded, scrolling a native dropdown on a phone is
  // the step people give up on. What gets submitted is still an id from the
  // list — typing filters, it never creates.
  const [collegeQuery, setCollegeQuery] = useState('');
  const [collegeOpen, setCollegeOpen] = useState(false);

  const selectedInstitution = useMemo(
    () => institutions.find((i) => i.id === form.institutionId) || null,
    [institutions, form.institutionId]
  );

  const filteredInstitutions = useMemo(() => {
    const q = collegeQuery.trim().toLowerCase();
    if (!q) return institutions;
    return institutions.filter((i) => i.name.toLowerCase().includes(q));
  }, [institutions, collegeQuery]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const setPlatform = (key, value) =>
    setForm((f) => ({ ...f, platformUrls: { ...f.platformUrls, [key]: value } }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = 'Enter a valid email address';

    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < MIN_PASSWORD_LENGTH)
      e.password = `At least ${MIN_PASSWORD_LENGTH} characters`;
    if (form.confirmPassword !== form.password) e.confirmPassword = 'Passwords do not match';

    if (!form.institutionId) e.institutionId = 'Select your college from the list';
    if (!form.department) e.department = 'Select your department';
    if (!form.year) e.year = 'Select your year';

    if (form.phoneNumber && !/^[0-9+\-\s()]{6,20}$/.test(form.phoneNumber.trim()))
      e.phoneNumber = 'Enter a valid phone number';

    for (const key of ['tenthPercentage', 'twelfthPercentage']) {
      const raw = String(form[key] ?? '').trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) e[key] = 'Enter a percentage between 0 and 100';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      // Only non-empty platform URLs are sent, so an untouched field doesn't
      // create a platform_stats row that will sit 'pending' forever.
      const platformUrls = Object.fromEntries(
        Object.entries(form.platformUrls).filter(([, v]) => String(v).trim() !== '')
      );

      await studentsApi.register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phoneNumber: form.phoneNumber.trim(),
        registerNumber: form.registerNumber.trim(),
        rollNumber: form.rollNumber.trim(),
        department: form.department,
        year: form.year,
        // The id, not the name. The server reads the college name off this row.
        institutionId: form.institutionId,
        tenthPercentage: form.tenthPercentage,
        twelfthPercentage: form.twelfthPercentage,
        platformUrls,
        website: honeypot,
      });

      // Nothing sensitive survives the success screen.
      setForm(EMPTY);
      setHoneypot('');
      setDone(true);
    } catch (err) {
      setSubmitError(err.message || 'Could not create your account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const goToSignIn = () => {
    if (onSignIn) {
      onSignIn();
      return;
    }
    onClose?.();
    navigate('/signin');
  };

  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => onClose?.()}
    >
      <motion.div
        className="bg-surface rounded-2xl w-full max-w-3xl shadow-elite-lg my-8 relative"
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-edge">
          <div>
            <h2 className="font-display text-xl font-bold text-fg">Create your account</h2>
            <p className="text-sm text-fg-subtle">
              Register once, then sign in with your email and password.
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-fg-subtle hover:text-fg hover:bg-black/5 transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {done ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
              <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-display text-xl font-bold text-fg mb-2">
              Account created successfully
            </h3>
            <p className="text-fg-subtle mb-6">
              You can now log in using your email and password.
            </p>
            <button onClick={goToSignIn} className="btn-accent px-8 py-3 font-semibold">
              Go to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-8" noValidate>
            {/* ---- Account ------------------------------------------------ */}
            <section className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-fg-subtle">
                Your account
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full name" error={errors.name} required>
                  <input
                    className={inputCls}
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    autoComplete="name"
                    placeholder="Your full name"
                  />
                </Field>
                <Field label="Email address" error={errors.email} required>
                  <input
                    className={inputCls}
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </Field>
                <Field
                  label="Password"
                  error={errors.password}
                  required
                  hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
                >
                  <input
                    className={inputCls}
                    type="password"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Confirm password" error={errors.confirmPassword} required>
                  <input
                    className={inputCls}
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => set('confirmPassword', e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
              </div>
            </section>

            {/* ---- College ------------------------------------------------ */}
            <section className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-fg-subtle">
                Your college
              </h3>

              <Field
                label="College / Institution"
                error={errors.institutionId}
                required
                hint="Start typing to search. If your college isn't listed, ask your placement cell to have it onboarded."
              >
                {institutionsError ? (
                  <p className="text-sm text-red-600">
                    Could not load the list of colleges. Please refresh and try again.
                  </p>
                ) : (
                  <div className="relative">
                    <input
                      className={inputCls}
                      value={collegeOpen ? collegeQuery : selectedInstitution?.name || ''}
                      onChange={(e) => {
                        setCollegeQuery(e.target.value);
                        setCollegeOpen(true);
                        // Typing after choosing clears the choice, so what is
                        // submitted always matches what the box shows.
                        if (form.institutionId) set('institutionId', '');
                      }}
                      onFocus={() => {
                        setCollegeOpen(true);
                        setCollegeQuery('');
                      }}
                      // A blur that fires before the click would close the list
                      // out from under the option being clicked.
                      onBlur={() => setTimeout(() => setCollegeOpen(false), 150)}
                      placeholder={institutionsLoading ? 'Loading colleges…' : 'Search your college'}
                      disabled={institutionsLoading}
                      autoComplete="off"
                      role="combobox"
                      aria-expanded={collegeOpen}
                      aria-autocomplete="list"
                    />
                    {collegeOpen && (
                      <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-edge-strong bg-surface shadow-lg">
                        {filteredInstitutions.length === 0 ? (
                          <li className="px-3 py-2.5 text-sm text-fg-subtle">
                            No college matches “{collegeQuery}”.
                          </li>
                        ) : (
                          filteredInstitutions.map((inst) => (
                            <li key={inst.id}>
                              <button
                                type="button"
                                className="w-full px-3 py-2.5 text-left text-sm text-fg hover:bg-black/5"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  set('institutionId', inst.id);
                                  setCollegeQuery('');
                                  setCollegeOpen(false);
                                }}
                              >
                                {inst.name}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Department" error={errors.department} required>
                  <select
                    className={inputCls}
                    value={form.department}
                    onChange={(e) => set('department', e.target.value)}
                  >
                    <option value="">Select department</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Year of study" error={errors.year} required>
                  <select
                    className={inputCls}
                    value={form.year}
                    onChange={(e) => set('year', e.target.value)}
                  >
                    <option value="">Select year</option>
                    {YEARS.map((y) => (
                      <option key={y.value} value={y.value}>
                        {y.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Register number" error={errors.registerNumber}>
                  <input
                    className={inputCls}
                    value={form.registerNumber}
                    onChange={(e) => set('registerNumber', e.target.value)}
                  />
                </Field>
                <Field label="Roll number" error={errors.rollNumber}>
                  <input
                    className={inputCls}
                    value={form.rollNumber}
                    onChange={(e) => set('rollNumber', e.target.value)}
                  />
                </Field>
                <Field label="Phone number" error={errors.phoneNumber}>
                  <input
                    className={inputCls}
                    value={form.phoneNumber}
                    onChange={(e) => set('phoneNumber', e.target.value)}
                    autoComplete="tel"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="10th %" error={errors.tenthPercentage}>
                    <input
                      className={inputCls}
                      inputMode="decimal"
                      value={form.tenthPercentage}
                      onChange={(e) => set('tenthPercentage', e.target.value)}
                    />
                  </Field>
                  <Field label="12th %" error={errors.twelfthPercentage}>
                    <input
                      className={inputCls}
                      inputMode="decimal"
                      value={form.twelfthPercentage}
                      onChange={(e) => set('twelfthPercentage', e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </section>

            {/* ---- Profiles ----------------------------------------------- */}
            <section className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-fg-subtle">
                Your coding profiles
              </h3>
              <p className="text-sm text-fg-subtle -mt-2">
                Optional, and you can add them later from your profile. Whatever you add here starts
                being tracked on the next scraper run.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PLATFORM_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <input
                      className={inputCls}
                      value={form.platformUrls[f.key]}
                      onChange={(e) => setPlatform(f.key, e.target.value)}
                      placeholder={f.placeholder}
                    />
                  </Field>
                ))}
              </div>
            </section>

            {/* Honeypot — off-screen, not display:none, so bots still fill it. */}
            <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            {submitError && (
              <div role="alert" className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {submitError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-2 border-t border-edge">
              <p className="text-sm text-fg-subtle">
                Already registered?{' '}
                <button type="button" onClick={goToSignIn} className="font-semibold text-blue-600 hover:underline">
                  Sign in
                </button>
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="btn-accent px-8 py-3 font-semibold justify-center disabled:opacity-60"
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
};

export default StudentOnboardingForm;
