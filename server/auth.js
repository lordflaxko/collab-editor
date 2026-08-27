const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const STORE_PATH = path.join(__dirname, 'passphrases.json')

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

function hashPassphrase(passphrase, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(passphrase, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassphrase(passphrase, stored) {
  const [salt, hash] = stored.split(':')
  const candidate = crypto.scryptSync(passphrase, salt, 64).toString('hex')
  const candidateBuf = Buffer.from(candidate, 'hex')
  const storedBuf = Buffer.from(hash, 'hex')
  return candidateBuf.length === storedBuf.length && crypto.timingSafeEqual(candidateBuf, storedBuf)
}

/**
 * The first connection ever made to a docName registers its passphrase
 * (an empty string means the document has no passphrase). Every later
 * connection must match what was registered.
 */
function authorize(docName, passphrase) {
  const store = loadStore()
  const stored = store[docName]
  if (stored === undefined) {
    store[docName] = hashPassphrase(passphrase)
    saveStore(store)
    return true
  }
  return verifyPassphrase(passphrase, stored)
}

module.exports = { authorize }
