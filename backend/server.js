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

// CORS. FRONTEND_URL is read from the environment so a deploy doesn't need a
// code change — the hard-coded list still had the old hope-portal-stjosephs
// domain in it, and no way to add the real one without editing this file.
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean),
  credentials: true,
  // PATCH matters now: students and institutions are both updated with it, and
  // omitting it here makes the browser preflight fail before the request lands.
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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
