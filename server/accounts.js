const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const STORE_PATH = path.join(__dirname, 'users.json')
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/

// Sessions are kept in memory only: restarting the server logs everyone out.
// That's an acceptable trade-off for now -- there's no security reason a
// session needs to outlive the process, and it avoids having to persist and
// garbage-collect a session store on disk.
const sessions = new Map()

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
  return { token, username }
}

function signup(username, password) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new Error('Username must be 3-20 characters: letters, numbers, _ or -')
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }
  const store = loadStore()
  if (store[username]) {
    throw new Error('That username is already taken')
  }
  store[username] = { passwordHash: hashPassword(password), createdAt: Date.now() }
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
}

function userExists(username) {
  const store = loadStore()
  return Boolean(store[username])
}

module.exports = { signup, login, getSessionUser, destroySession, userExists }
