# CodeKrack — Deployment

```
Frontend   Vercel                      (static SPA, global CDN)
Backend    Fly.io — Mumbai (bom)       (persistent: SSE + Postgres LISTEN + cron)
Database   Supabase — ap-south-1       (already live)
Scraper    GitHub Actions              (cron '0 */3 * * *')
```

**Why Fly Mumbai:** your Supabase project is `ap-south-1` (Mumbai), and every API
request makes two round trips to it — `auth.getUser()` to verify the token, then a
`SELECT` on `profiles` to resolve the role. From Singapore that's ~150ms of pure
network per request; from Mumbai, ~10ms. Co-locating is the cheapest performance
win available.

**Why not Vercel for the backend:** its functions cap execution time, which severs
SSE mid-stream and causes reconnect storms. The leaderboard would stop being live.

---

## 1. Backend → Fly.io

```bash
fly launch --no-deploy --copy-config      # keeps the fly.toml in this repo

fly secrets set \
  SUPABASE_URL="https://<ref>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service_role / Secret key>" \
  DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres" \
  EMAIL_USER="you@gmail.com" \
  EMAIL_PASS="<gmail app password>" \
  GH_API_TOKEN="<github pat>" \
  FRONTEND_URL="https://<your-app>.vercel.app"

fly deploy
fly logs
```

Expect three lines. **If any is missing, stop and fix it:**

```
Server running on port 5001
SSE: listening on Postgres channel "codekrack"
Mail transport ready (you@gmail.com)
```

`Mail transport NOT working` means students will never receive invites — and
nothing else will tell you.

### Things that are deliberate, not incidental

| | |
|---|---|
| `auto_stop_machines = false` | The weekly email is in-process `node-cron`. A stopped machine runs no cron: 09:00 Monday passes, nothing sends, nothing logs. It also drops every SSE stream. |
| `min_machines_running = 1` | Same reason. |
| `DATABASE_URL` = **Session pooler** | The direct `db.<ref>.supabase.co` host is IPv6-only and won't resolve. The app refuses to boot if you point it there. |
| **Never set** `SMTP_ALLOW_SELF_SIGNED` | It disables TLS verification for outgoing mail, and an invite link *is* a credential. Ignored in production anyway — it exists only for dev machines whose antivirus intercepts TLS. |
| Concurrency `soft_limit = 200` | SSE connections are long-lived and mostly idle — one per open admin tab. At the default (~25) a few dashboards would look like a machine at capacity. |

---

## 2. Frontend → Vercel

Import the repo. `vercel.json` sets framework/build/output already.

**Set this BEFORE the first build** (Settings → Environment Variables):

```
VITE_API_URL       = https://codekrack-api.fly.dev
VITE_SUPABASE_URL  = https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY = <anon / Publishable key>
```

> ⚠️ **`VITE_*` is compiled into the bundle at BUILD time, not read at runtime.**
> Changing it later does nothing until you **redeploy**. Set it, then build — a
> frontend built without `VITE_API_URL` silently calls `localhost:5001` in
> production and every request fails with no useful error.
>
> The anon key belongs here and is safe: it's public by design, and RLS denies it
> on every table. The **service_role key must never appear in a `VITE_` var.**

---

## 3. Supabase — the step everyone forgets

Authentication → **URL Configuration**:

- **Site URL**: `https://<your-app>.vercel.app`
- **Redirect URLs**: add `https://<your-app>.vercel.app/reset-password`

Miss this and every invite link redirects somewhere useless. The email sends, the
admin sees success, and the student cannot set a password — with nothing logged
anywhere.

---

## 4. GitHub Actions — the scraper

Repo → Settings → Secrets and variables → Actions:

```
DATABASE_URL   same Session-pooler URI as Fly
GH_API_TOKEN   same GitHub PAT
```

Delete the old `FIREBASE_*` secrets; nothing reads them.

Run it once by hand (Actions tab → *Scrape Student Platform Data* → Run workflow)
rather than waiting up to 3h for cron.

---

## 5. Verify the deploy

```bash
curl https://codekrack-api.fly.dev/health          # {"status":"ok",...}
```

Then in the browser, signed in as an admin:

1. **DevTools → Network → filter `events`** — one `/api/events` request that stays
   pending forever. That's SSE connected. If it completes or 404s, realtime is dead.
2. **Add a student with your own email** — you should receive the invite, and the
   link must point at your Vercel domain, *not* localhost.
3. **Edit a student** — exercises `PATCH`, which needs CORS to be right.

---

## Known, accepted

| | |
|---|---|
| **QueryBot** posts student data to `codetrack-my6j.onrender.com` — hardcoded, unauthenticated, third-party. Decide whether that's yours before exposing real student data. | `src/services/apii.js` |
| In-process cron **double-sends if you ever run 2 instances**. Move the weekly email to GitHub Actions before scaling. | `services/schedulerService.js` |
| No audit log: `created_by` records who created a student, nothing records who deleted one. | — |
| `/components/leaderboard` has no route guard (renders an empty shell; data still 401s). | `src/App.jsx` |
| No request body size cap beyond Express's 100kb default. | — |

Full analysis: `docs/security/security.md` (gitignored — generate locally).
