// backend/config/supabase.js
//
// The Supabase ADMIN client — used for Auth operations only (create user, set
// password, delete user). All data access goes through config/db.js (real SQL),
// because this app needs joins, aggregates and transactions that PostgREST
// makes awkward.
//
// 🔴 This client holds the service_role key and BYPASSES ROW LEVEL SECURITY.
//    It must never be imported into anything that ships to the browser.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env.\n' +
      'Supabase dashboard -> Project Settings -> API.'
  );
}

// Fail loudly at boot if the anon key was pasted into the service_role slot.
// Without this the app boots fine and then every query silently returns nothing
// (RLS denies the anon key), which looks like "the database is empty" and is
// miserable to debug.
const assertServiceRole = (key) => {
  const parts = key.split('.');
  if (parts.length !== 3) return; // sb_secret_* format — not a JWT, can't inspect
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    if (payload.role && payload.role !== 'service_role') {
      throw new Error(
        `SUPABASE_SERVICE_ROLE_KEY holds a "${payload.role}" key, not service_role.\n` +
          'You have probably pasted the anon/publishable key. The backend needs the\n' +
          'service_role (Secret) key — Project Settings -> API.'
      );
    }
  } catch (e) {
    if (e.message.includes('service_role')) throw e; // our own error — re-raise
    // Unparseable payload: let it through, the first real call will fail clearly.
  }
};
assertServiceRole(SUPABASE_SERVICE_ROLE_KEY);

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default supabaseAdmin;
