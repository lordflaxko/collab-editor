const fs = require('fs')
const path = require('path')
const simpleGit = require('simple-git')
const { roomDir, syncRoomToWorkingDir, applyWorkingDirToRoom } = require('./gitSync')

// Every operation below reads and/or writes the room's shared working
// directory (syncing Yjs content to disk, running git, then sometimes
// applying disk content back to Yjs). The Source Control panel routinely
// fires several of these concurrently for the same room (e.g. a status
// refresh left in flight from one action overlapping a branch switch
// triggered right after), and two such operations interleaving their
// reads/writes to the same directory silently corrupts the result -- a
// checkout's freshly-written branch content getting clobbered by a stale
// sync from an unrelated in-flight request, for instance. Chaining every
// call for a given room onto one promise queue serializes them; different
// rooms still run fully in parallel.
const roomQueues = new Map()

function withRoomLock(room, fn) {
  const previous = roomQueues.get(room) ?? Promise.resolve()
  const result = previous.then(fn, fn)
  roomQueues.set(
    room,
    result.then(
      () => {},
      () => {},
    ),
  )
  return result
}

async function ensureRepo(room) {
  const dir = roomDir(room)
  fs.mkdirSync(dir, { recursive: true })
  const git = simpleGit(dir)
  if (!fs.existsSync(path.join(dir, '.git'))) {
    await git.init()
    // A placeholder identity for the local repo config; real commits made
    // through this app override author/committer per-commit with whoever
    // is actually signed in.
    await git.addConfig('user.name', 'Collab Editor')
    await git.addConfig('user.email', 'collab-editor@localhost')
  }
  return git
}

async function getLog(room) {
  const git = await ensureRepo(room)
  try {
    const log = await git.log()
    return log.all.map((commit) => ({
      hash: commit.hash,
      message: commit.message,
      authorName: commit.author_name,
      authorEmail: commit.author_email,
      date: commit.date,
    }))
  } catch {
    // A fresh repo with no commits yet throws rather than returning empty.
    return []
  }
}

async function listBranches(room) {
  const git = await ensureRepo(room)
  try {
    const summary = await git.branchLocal()
    return { current: summary.current, all: summary.all }
  } catch {
    return { current: null, all: [] }
  }
}

function buildAuthenticatedUrl(remoteUrl, token) {
  if (!/^https:\/\//.test(remoteUrl)) {
    throw new Error('Remote URL must be an https:// GitHub URL')
  }
  return remoteUrl.replace(/^https:\/\//, `https://${encodeURIComponent(token)}@`)
}

async function _getStatus(room) {
  await syncRoomToWorkingDir(room)
  const git = await ensureRepo(room)
  const status = await git.status()
  return {
    current: status.current,
    notAdded: status.not_added,
    modified: status.modified,
    deleted: status.deleted,
    created: status.created,
    staged: status.staged,
    conflicted: status.conflicted,
    isClean: status.isClean(),
  }
}

async function _getDiff(room, filePath) {
  await syncRoomToWorkingDir(room)
  const git = await ensureRepo(room)
  const log = await getLog(room)
  if (log.length === 0) {
    // Nothing has ever been committed, so there's no HEAD to diff against --
    // the whole file is "new" relative to the (nonexistent) repo history.
    const dir = roomDir(room)
    const fullPath = path.join(dir, path.basename(filePath))
    const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
    return { diff: content, isNewFile: true }
  }
  const diff = await git.diff(['HEAD', '--', path.basename(filePath)])
  return { diff, isNewFile: false }
}

async function _commitAll(room, message, author) {
  if (!message || !message.trim()) throw new Error('A commit message is required')
  await syncRoomToWorkingDir(room)
  const git = await ensureRepo(room)
  await git.add(['-A'])
  const name = author?.name?.trim() || 'Anonymous'
  const email = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}@collab-editor.local`
  try {
    await git.commit(message.trim(), undefined, { '--author': `${name} <${email}>` })
  } catch (err) {
    throw new Error(err.message?.includes('nothing to commit') ? 'Nothing to commit' : err.message)
  }
  return getLog(room)
}

async function _createBranch(room, name) {
  if (!name || !/^[a-zA-Z0-9._/-]+$/.test(name)) {
    throw new Error('Branch names may only contain letters, numbers, and ._/-')
  }
  const git = await ensureRepo(room)
  await git.checkoutLocalBranch(name)
  return listBranches(room)
}

// Switching branches rewrites the room's live file content for everyone
// connected -- there's no such thing as a private checkout when a room is
// one shared Y.Doc. Refuses (surfacing git's own error) if there are
// uncommitted changes that would be overwritten, same as plain git.
async function _switchBranch(room, name) {
  await syncRoomToWorkingDir(room)
  const git = await ensureRepo(room)
  await git.checkout(name)
  await applyWorkingDirToRoom(room)
  return listBranches(room)
}

async function _push(room, remoteUrl, token, branch) {
  const git = await ensureRepo(room)
  const authUrl = buildAuthenticatedUrl(remoteUrl, token)
  await git.push(authUrl, branch, ['--set-upstream'])
}

// A pull can hit real merge conflicts. Per the project's conflict-handling
// design, those are left as standard git conflict markers in the files
// themselves -- so on conflict this still applies the (marker-containing)
// working directory back to the room rather than leaving the user stuck,
// and reports the conflict rather than throwing.
async function _pull(room, remoteUrl, token, branch) {
  await syncRoomToWorkingDir(room)
  const git = await ensureRepo(room)
  const authUrl = buildAuthenticatedUrl(remoteUrl, token)
  let conflict = false
  try {
    await git.pull(authUrl, branch)
  } catch (err) {
    const status = await git.status()
    if (status.conflicted.length === 0) throw err
    conflict = true
  }
  await applyWorkingDirToRoom(room)
  return { conflict }
}

// getLog/listBranches are called both directly by routes (where they need
// the lock, like everything else here) and internally by the other locked
// functions above (where taking the lock again would deadlock against
// itself, since the queue is strictly sequential). The unlocked
// getLog/listBranches above are for that internal use; these wrapped
// versions are what routes should call.
module.exports = {
  getStatus: (room) => withRoomLock(room, () => _getStatus(room)),
  getDiff: (room, filePath) => withRoomLock(room, () => _getDiff(room, filePath)),
  getLog: (room) => withRoomLock(room, () => getLog(room)),
  listBranches: (room) => withRoomLock(room, () => listBranches(room)),
  commitAll: (room, message, author) => withRoomLock(room, () => _commitAll(room, message, author)),
  createBranch: (room, name) => withRoomLock(room, () => _createBranch(room, name)),
  switchBranch: (room, name) => withRoomLock(room, () => _switchBranch(room, name)),
  push: (room, remoteUrl, token, branch) => withRoomLock(room, () => _push(room, remoteUrl, token, branch)),
  pull: (room, remoteUrl, token, branch) => withRoomLock(room, () => _pull(room, remoteUrl, token, branch)),
}
