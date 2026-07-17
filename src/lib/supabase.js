// src/lib/supabase.js
//
// The browser's Supabase client. It does exactly ONE job: authentication.
//
// It never queries the database. Every read and write goes through the Express
// API (src/services/api.js), which enforces institution scoping server-side.
// The database itself is unreachable from here — RLS denies the anon key on
// every table, deliberately, so a mistake in this file cannot become a data
// leak.
//
// If you find yourself reaching for supabase.from(...), that's the signal you
// need a new endpoint, not a shortcut.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env\n' +
      'Supabase dashboard -> Project Settings -> API. Restart `npm run dev` after editing .env.'
  );
}

// A publishable/anon key is meant to be public — it is constrained by RLS.
// The service_role (Secret) key is NOT, and must never reach the browser.
// This catches the paste-the-wrong-key mistake at boot instead of shipping it.
if (anonKey.startsWith('sb_secret_') || anonKey.includes('service_role')) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY looks like a service_role/Secret key.\n' +
      'That key bypasses Row Level Security and must NEVER be in frontend .env — ' +
      'every VITE_* var is bundled into public client JS.\n' +
      'Rotate it now (Settings -> API -> Rotate) and use the anon/Publishable key here.'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // MUST be true. The set-password email links back with the recovery token in
    // the URL fragment (#access_token=...&type=recovery). This is what reads that
    // fragment, exchanges it for a short-lived session and fires a
    // PASSWORD_RECOVERY event — which is the only way ResetPassword can let
    // someone set a password without already knowing the old one.
    // With this false, every invite link lands on a page that can do nothing.
    detectSessionInUrl: true,
  },
});

/**
 * The current access token, refreshed if it is close to expiring.
 * Returns null when signed out — callers must treat that as "not authenticated"
 * rather than retrying.
 */
export const getAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session) return null;
  return data.session.access_token;
};

export default supabase;
