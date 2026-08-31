const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const accounts = require('./accounts')

const STORE_PATH = path.join(__dirname, 'notifications.json')
const MAX_PER_USER = 200

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

// Only ever notify a real, registered account -- and never yourself. The
// response doesn't distinguish "not a real account" from "notified", so
// this can't be used to probe which usernames are registered.
function addMention({ targetUsername, fromName, room, text }) {
  if (!targetUsername || targetUsername === fromName) return
  if (!accounts.userExists(targetUsername)) return
  const store = loadStore()
  const list = store[targetUsername] ?? []
  list.push({
    id: crypto.randomUUID(),
    fromName: fromName ?? 'Someone',
    room,
    text: String(text ?? '').slice(0, 200),
    createdAt: Date.now(),
    read: false,
  })
  store[targetUsername] = list.slice(-MAX_PER_USER)
  saveStore(store)
}

function getNotifications(username) {
  const store = loadStore()
  return store[username] ?? []
}

function markAllRead(username) {
  const store = loadStore()
  const list = store[username]
  if (!list) return
  for (const notification of list) notification.read = true
  saveStore(store)
}

module.exports = { addMention, getNotifications, markAllRead }
