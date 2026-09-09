// Fixed-window request counters, kept in memory.
//
// In memory is the right trade here: this is a single-process server, and
// the point is to blunt signup floods and repeated expensive work from one
// source, not to enforce an exact quota. A restart forgiving everyone is
// fine for that. It would need to move to shared storage the moment the
// server runs as more than one process.

const WINDOW_CLEANUP_MS = 60_000

// Tuned per class of work rather than one global number: signing up is
// cheap for us but valuable to an abuser, while starting a container or an
// AI call costs real resources per request.
const LIMITS = {
  auth: { limit: 10, windowMs: 15 * 60_000 },
  expensive: { limit: 20, windowMs: 60_000 },
  general: { limit: 240, windowMs: 60_000 },
}

// Anything that creates an account, proves possession of one, or sends mail.
const AUTH_ROUTES = new Set([
  '/auth/signup',
  '/auth/login',
  '/auth/request-reset',
  '/auth/reset-password',
])

// Anything that starts a container, shells out, calls a paid API, makes the
// server open an outbound connection, or writes a new repo to disk.
const EXPENSIVE_ROUTES = new Set([
  '/db/query',
  '/deploy/start',
  '/ai/ask',
  '/ai/explain',
  '/format',
  '/tests/run',
  '/git/push',
  '/git/pull',
  '/git/pr/create',
  '/projects/create',
])

const counters = new Map()

let cleanupTimer = null
function scheduleCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of counters) {
      if (entry.resetAt <= now) counters.delete(key)
    }
    if (counters.size === 0) {
      clearInterval(cleanupTimer)
      cleanupTimer = null
    }
  }, WINDOW_CLEANUP_MS)
  // Don't hold the process open just to expire counters.
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref()
}

// X-Forwarded-For is attacker-controlled unless something in front of the
// server is guaranteed to rewrite it, so it is only consulted when the
// deployment explicitly says it sits behind a proxy. Otherwise a single
// client could mint a fresh identity per request and bypass every limit.
function clientKey(req) {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim()
    }
  }
  return req.socket?.remoteAddress ?? 'unknown'
}

function classify(url) {
  const path = (url ?? '').split('?')[0]
  if (AUTH_ROUTES.has(path)) return 'auth'
  if (EXPENSIVE_ROUTES.has(path)) return 'expensive'
  return 'general'
}

/**
 * Records one request and reports whether it should be allowed.
 * Returns { allowed, retryAfterSeconds }.
 */
function consume(req) {
  // The end-to-end suite signs up a fresh account for almost every spec,
  // all from one address, so the auth limit would reject most of the run.
  // Turning the limiter off is the honest way to express that rather than
  // inflating the real limits until the tests happen to fit under them.
  // Test-only: setting this on a public instance removes the protection.
  if (process.env.RATE_LIMIT_DISABLED === '1') {
    return { allowed: true, retryAfterSeconds: 0 }
  }

  const bucket = classify(req.url)
  const { limit, windowMs } = LIMITS[bucket]
  const key = `${bucket}:${clientKey(req)}`
  const now = Date.now()

  let entry = counters.get(key)
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs }
    counters.set(key, entry)
    scheduleCleanup()
  }

  entry.count += 1
  if (entry.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) }
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

function reset() {
  counters.clear()
}

module.exports = { consume, reset, LIMITS }
