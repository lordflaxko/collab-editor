const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const STORE_PATH = path.join(__dirname, 'users.json')
const SESSIONS_PATH = path.join(__dirname, 'sessions.json')
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const RESET_TTL_MS = 30 * 60 * 1000 // 30 minutes
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Sessions live on disk so a restart doesn't sign everyone out. They were
// in-memory originally, which was fine while the server only ever restarted
// on a developer's machine -- but deploying made every update log out every
// signed-in user, since deploys restart the process.
//
// Garbage collection is free here: each session already carries an expiry,
// so expired ones are simply dropped when the file is read back.
function loadSessions() {
  try {
    const raw = JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'))
    const now = Date.now()
    return new Map(
      Object.entries(raw).filter(([, session]) => session && session.expiresAt > now),
    )
  } catch {
    return new Map()
  }
}

const sessions = loadSessions()

// Called only when a session is created or destroyed -- logins and logouts,
// not requests -- so rewriting the whole file each time costs nothing.
function saveSessions() {
  try {
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify(Object.fromEntries(sessions), null, 2))
  } catch {
    // A failed write shouldn't break signing in: the session still works for
    // the life of this process, it just won't survive a restart.
  }
}

// Reset tokens are similarly in-memory and short-lived -- a reset link is
// only ever meant to be useful for a few minutes after it's requested, so
// nothing is lost by not persisting these across a restart.
const resetTokens = new Map()

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex')
  const candidateBuf = Buffer.from(candidate, 'hex')
  const storedBuf = Buffer.from(hash, 'hex')
  return candidateBuf.length === storedBuf.length && crypto.timingSafeEqual(candidateBuf, storedBuf)
}

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS })
  saveSessions()
  return { token, username }
}

function findUsernameByEmail(store, email) {
  const target = email.trim().toLowerCase()
  return Object.keys(store).find((name) => store[name].email?.toLowerCase() === target) ?? null
}

function signup(username, password, email) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new Error('Username must be 3-20 characters: letters, numbers, _ or -')
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    throw new Error('A valid email address is required')
  }
  const store = loadStore()
  if (store[username]) {
    throw new Error('That username is already taken')
  }
  if (findUsernameByEmail(store, email)) {
    throw new Error('That email is already registered')
  }
  store[username] = { passwordHash: hashPassword(password), email: email.trim(), createdAt: Date.now() }
  saveStore(store)
  return createSession(username)
}

function login(username, password) {
  const store = loadStore()
  const record = store[username]
  if (!record || !verifyPassword(password, record.passwordHash)) {
    throw new Error('Incorrect username or password')
  }
  return createSession(username)
}

function getSessionUser(token) {
  if (!token) return null
  const session = sessions.get(token)
  if (!session) return null
  if (session.expiresAt < Date.now()) {
    sessions.delete(token)
    return null
  }
  return session.username
}

function destroySession(token) {
  sessions.delete(token)
  saveSessions()
}

function userExists(username) {
  const store = loadStore()
  return Boolean(store[username])
}

// Returns null (rather than throwing) when the email has no matching
// account, so the HTTP route can always respond with the same generic
// message -- telling a caller "no account uses that email" would let
// someone probe which emails are registered.
function requestPasswordReset(email) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    throw new Error('A valid email address is required')
  }
  const store = loadStore()
  const username = findUsernameByEmail(store, email)
  if (!username) return null
  const token = crypto.randomBytes(32).toString('hex')
  resetTokens.set(token, { username, expiresAt: Date.now() + RESET_TTL_MS })
  return { username, email: store[username].email, token }
}

function resetPassword(token, newPassword) {
  const entry = resetTokens.get(token)
  if (!entry || entry.expiresAt < Date.now()) {
    resetTokens.delete(token)
    throw new Error('This reset link is invalid or has expired')
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }
  const store = loadStore()
  const record = store[entry.username]
  if (!record) {
    resetTokens.delete(token)
    throw new Error('This reset link is invalid or has expired')
  }
  record.passwordHash = hashPassword(newPassword)
  saveStore(store)
  resetTokens.delete(token)
  // A password reset should log out every existing session for the
  // account, not just add a new one alongside whatever session(s) someone
  // else might already be holding with the old password.
  for (const [sessionToken, session] of sessions) {
    if (session.username === entry.username) sessions.delete(sessionToken)
  }
  return createSession(entry.username)
}

module.exports = {
  signup,
  login,
  getSessionUser,
  destroySession,
  userExists,
  requestPasswordReset,
  resetPassword,
}
