// backend/server.js
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";

import emailRoutes from "./routes/emailRoutes.js";
import institutionRoutes from "./routes/institutionRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import eventsRoutes from "./routes/eventsRoutes.js";
import schedulerService from "./services/schedulerService.js";
import { startRealtime, stopRealtime } from "./services/realtime.js";
import { verifyMailer } from "./services/mailer.js";

import errorHandler from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import logger from "./utils/logger.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Required for rate limiting to work behind a load balancer (Render/Railway/Fly).
// Without it req.ip is the proxy's address, so every user shares one bucket and
// the limiter throttles everyone at once.
//
// `1` = trust exactly one hop, not `true`. Trusting the whole X-Forwarded-For
// chain lets a caller prepend a fake IP and evade the limit entirely — which
// would make the limiter worse than useless, since it would still throttle
// honest traffic while ignoring the abuse it exists to stop.
app.set("trust proxy", 1);

// CORS. FRONTEND_URL comes from the environment so a deploy needs no code change
// — the hard-coded list used to carry the old hope-portal-stjosephs domain with
// no way to add the real one without editing this file.
const isProd = process.env.NODE_ENV === "production";

if (isProd && !process.env.FRONTEND_URL) {
  // Refuse to boot rather than start a server your own site cannot call. Without
  // this the allow-list silently degrades to localhost only, every browser
  // request fails CORS, and the app looks broken for reasons nothing logs.
  throw new Error(
    "FRONTEND_URL must be set in production. Without it, CORS allows only " +
      "localhost and your deployed frontend cannot reach this API."
  );
}

// A browser's Origin header NEVER has a trailing slash or a path — it is exactly
// scheme://host[:port]. So `FRONTEND_URL=https://www.codekrack.in/` would not
// match `Origin: https://www.codekrack.in`, and every request from your own site
// would be blocked. That mistake is nearly invisible: inviteService.js strips the
// slash before building links, so invite emails would keep working perfectly
// while the whole app failed CORS — the two would disagree about the same value.
//
// Normalising here means the env var can be pasted with or without a slash.
const FRONTEND_ORIGIN = (() => {
  const raw = process.env.FRONTEND_URL;
  if (!raw) return null;
  try {
    // new URL().origin drops any trailing slash, path, query and fragment, which
    // is precisely the normalisation the Origin header does.
    return new URL(raw).origin;
  } catch {
    throw new Error(
      `FRONTEND_URL is not a valid URL: "${raw}". It must be an absolute origin, ` +
        'e.g. https://www.codekrack.in — scheme included, no trailing path.'
    );
  }
})();

const corsOptions = {
  origin: [
    FRONTEND_ORIGIN,
    // Dev origins only. In production these are dead weight at best, and at
    // worst let a page served from someone's localhost call your live API.
    ...(isProd ? [] : ["http://localhost:5173", "http://localhost:3000"]),
  ].filter(Boolean),
  credentials: true,
  // PATCH matters: students and institutions are both updated with it, and
  // omitting it makes the browser preflight fail before the request lands.
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Middleware
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
app.use(cors(corsOptions)); // Enable CORS with specific origins
app.use(express.json()); // Parse JSON bodies
app.use(morgan("dev")); // HTTP request logger

// ---- Routes -----------------------------------------------------------------
// Every route below is Supabase-backed and enforces institution scoping in SQL.
//
// Deleted in the Firebase purge, along with the modules behind them:
//   /api/auth/*         Supabase Auth handles sign-in directly from the browser;
//                       the role is resolved from the DB on every request, so
//                       there is nothing left for a login endpoint to do.
//   /api/users/*        duplicated /api/students against the old database.
//   /api/admin/*        /users + /stats duplicated /api/students and
//                       /api/dashboard/stats. Its two most-called endpoints
//                       (/delete-student, /bulk-delete-students) never existed —
//                       every deletion 404'd and orphaned an Auth login.
//   /api/achievements/* the achievements UI ranked students by a field nothing
//                       ever wrote, so every rank was computed from 0.
// SSE is mounted BEFORE the rate limiter, deliberately.
//
// /api/events is one long-lived stream per client that reconnects on a 3s
// backoff. During a backend restart a single legitimate browser can burn ~100
// reconnects in a few minutes — and rate-limiting it would lock that browser out
// of the exact endpoint it needs to recover, turning a 5-second blip into a
// permanent-looking outage. One connection is not a burst of requests.
app.use("/api/events", eventsRoutes);

// Everything below is rate limited (SEC-02): 300 req / 15 min per IP.
app.use("/api", apiLimiter);

app.use("/api/institutions", institutionRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/email", emailRoutes);

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date() });
});

// The API root says what it is.
//
// This container holds NO html, css or js — the frontend is a separate Vercel
// deployment, and this image is `npm ci --omit=dev` + server.js. Opening this
// host in a browser used to return a bare {"message":"Route not found"} from the
// catch-all below, which reads like a broken deploy rather than "you are at the
// wrong address". Saying so plainly here turns a confusing hunt into one glance.
//
// This is NOT an SPA fallback and must not become one. If you want index.html
// served from here, that is a deliberate architecture change (static middleware
// + the frontend built into the image + VITE_* as build args) — not a route.
app.get("/", (req, res) => {
  res.status(200).json({
    service: "codekrack-api",
    status: "ok",
    message:
      "This is the CodeKrack JSON API. It serves no HTML or static assets — " +
      "the web app is deployed separately and calls this API over CORS.",
    app: process.env.FRONTEND_URL || null,
    endpoints: { health: "/health", api: "/api/*", events: "/api/events (SSE)" },
  });
});

// Error handling
app.use(errorHandler);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);

  // Open the dedicated Postgres LISTEN connection that drives SSE.
  startRealtime();

  // Check SMTP at boot. Mail failures are otherwise INVISIBLE: the send throws
  // inside a request, the admin sees a toast at most, and the first real signal
  // is a student saying they never got their invite. This surfaces a broken mail
  // setup in the startup log, where someone will actually see it.
  verifyMailer();

  // Start the weekly email scheduler
  setTimeout(() => {
    schedulerService.startScheduler();
  }, 2000); // Wait 2 seconds for server to fully start
});

// SSE connections are long-lived by design, so Node's default 2-minute socket
// timeout would sever them mid-stream. Disable it at the server level; ordinary
// requests are still bounded by their own handlers.
server.setTimeout(0);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000; // must exceed keepAliveTimeout, or Node 502s

// Close SSE streams and the listener before dying, so clients get a clean end
// and reconnect deliberately instead of hanging on a half-open socket.
const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down`);
  await stopRealtime();
  server.close(() => process.exit(0));
  // Don't let a stuck connection block the exit forever.
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error("UNHANDLED REJECTION! 💥 Shutting down...");
  logger.error(err.name, err.message);
  process.exit(1);
});

export default app;
