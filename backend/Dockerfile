# backend/Dockerfile — CodeKrack API
#
# Build context is the REPO ROOT (see fly.toml: build.dockerfile), not backend/,
# so the paths below are backend/*. That's deliberate: it keeps `fly deploy`
# runnable from the repo root like every other command.
#
# Multi-stage so the shipped image carries production dependencies only — no npm
# cache, no dev tooling, no source you don't run.

# ---- deps -------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Copy manifests alone first. Docker caches this layer on their checksum, so
# editing application code doesn't reinstall node_modules on every deploy.
COPY backend/package.json backend/package-lock.json ./

# `npm ci` (not `npm install`): installs exactly what the lockfile says, fails if
# the two disagree, and never silently upgrades. A deploy should build the code
# you tested, not whatever was published this morning.
# --omit=dev: puppeteer is a devDependency (the browser test) — ~300MB of Chromium
# that has no business in a production image.
RUN npm ci --omit=dev


# ---- runtime ----------------------------------------------------------------
# Node 22 (current LTS). Both stages MUST use the same major — node_modules is
# built in `deps` and copied here, and a version skew between build and runtime
# is how you get a module that installed cleanly but throws at import. 22 also
# matches the local/CI Node the app is tested on, so the image runs what you
# verified rather than a different runtime.
FROM node:22-alpine AS runtime

# mailer.js and scripts/scrape.js use the global fetch (Node 18+), so node-fetch
# was dropped when the scraper moved server-side.
ENV NODE_ENV=production

# dumb-init makes the container respect signals. Without a real init, Node runs as
# PID 1 and PID 1 ignores SIGTERM by default — so `fly deploy` would hard-kill the
# process after its grace period instead of letting server.js close SSE streams
# and the LISTEN connection cleanly. Every client would see a severed stream
# rather than a clean end.
RUN apk add --no-cache dumb-init

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./

# Don't run as root. If anything in the process is ever exploited, it should not
# own the filesystem it's standing on.
RUN addgroup -g 1001 -S nodejs \
 && adduser -S codekrack -u 1001 -G nodejs \
 && chown -R codekrack:nodejs /app
USER codekrack

EXPOSE 5001

# Fly health-checks /health over HTTP (fly.toml); this HEALTHCHECK is for anyone
# running the image directly (docker run, Railway, a VPS).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
