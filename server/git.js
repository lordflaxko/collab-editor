const fs = require('fs')
const path = require('path')
const simpleGit = require('simple-git')
const { roomDir, syncRoomToWorkingDir, applyWorkingDirToRoom } = require('./gitSync')
const projects = require('./projects')
const { logActivity } = require('./activityLog')
const { maybeCheckpoint } = require('./checkpoints')

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
  await maybeCheckpoint(room)
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

// Every mutating operation below derives the acting username from the
// caller's own session token (verified server-side via requireMinRole)
// rather than trusting a client-supplied "author" field -- previously
// these endpoints didn't check the caller's role at all, so a Viewer (or
// anyone unauthenticated who knew a room id) could call them directly and
// mutate the project's git history regardless of what the UI showed them.
async function _commitAll(room, message, sessionToken) {
  if (!message || !message.trim()) throw new Error('A commit message is required')
  const { username } = projects.requireMinRole(sessionToken, room, 'editor')
  await syncRoomToWorkingDir(room)
  const git = await ensureRepo(room)
  await git.add(['-A'])
  const email = `${username.replace(/[^a-zA-Z0-9_-]/g, '_')}@collab-editor.local`
  try {
    await git.commit(message.trim(), undefined, { '--author': `${username} <${email}>` })
  } catch (err) {
    throw new Error(err.message?.includes('nothing to commit') ? 'Nothing to commit' : err.message)
  }
  await logActivity(room, 'commit', username, { message: message.trim() })
  return getLog(room)
}

async function _createBranch(room, name, sessionToken) {
  if (!name || !/^[a-zA-Z0-9._/-]+$/.test(name)) {
    throw new Error('Branch names may only contain letters, numbers, and ._/-')
  }
  const { username } = projects.requireMinRole(sessionToken, room, 'editor')
  const git = await ensureRepo(room)
  await git.checkoutLocalBranch(name)
  await logActivity(room, 'branch-created', username, { name })
  return listBranches(room)
}

// Switching branches rewrites the room's live file content for everyone
// connected -- there's no such thing as a private checkout when a room is
// one shared Y.Doc. Refuses (surfacing git's own error) if there are
// uncommitted changes that would be overwritten, same as plain git.
async function _switchBranch(room, name, sessionToken) {
  const { username } = projects.requireMinRole(sessionToken, room, 'editor')
  await syncRoomToWorkingDir(room)
  const git = await ensureRepo(room)
  await git.checkout(name)
  await applyWorkingDirToRoom(room)
  await logActivity(room, 'branch-switched', username, { name })
  return listBranches(room)
}

async function _push(room, remoteUrl, token, branch, sessionToken) {
  projects.requireMinRole(sessionToken, room, 'editor')
  const git = await ensureRepo(room)
  const authUrl = buildAuthenticatedUrl(remoteUrl, token)
  await git.push(authUrl, branch, ['--set-upstream'])
}

// A pull can hit real merge conflicts. Per the project's conflict-handling
// design, those are left as standard git conflict markers in the files
// themselves -- so on conflict this still applies the (marker-containing)
// working directory back to the room rather than leaving the user stuck,
// and reports the conflict rather than throwing.
async function _pull(room, remoteUrl, token, branch, sessionToken) {
  projects.requireMinRole(sessionToken, room, 'editor')
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

// Restores the room to exactly the file set/content of an earlier commit
// (which may be a manual commit or one of the auto-checkpoints above) --
// this is the "time machine" the restore feature needs, since checkpoints
// mean even uncommitted live edits eventually become a reachable commit.
// Rather than moving the branch pointer (a hard reset, which would discard
// anything committed after the target and confuse everyone else sharing
// this room), it copies that commit's tree into the working directory,
// applies it to the live Y.Doc for every connected client, and records the
// result as a new commit on top of history -- a restore is forward-moving,
// not a rewrite of the past.
async function _restoreVersion(room, hash, sessionToken) {
  const { username } = projects.requireMinRole(sessionToken, room, 'editor')
  const git = await ensureRepo(room)
  const dir = roomDir(room)
  let fileList
  try {
    fileList = (await git.raw(['ls-tree', '-r', '--name-only', hash])).split('\n').filter(Boolean)
  } catch {
    throw new Error('That version could not be found')
  }
  for (const entry of fs.readdirSync(dir)) {
    if (entry === '.git') continue
    fs.rmSync(path.join(dir, entry), { force: true, recursive: true })
  }
  for (const name of fileList) {
    const content = await git.show([`${hash}:${name}`])
    fs.writeFileSync(path.join(dir, name), content)
  }
  await applyWorkingDirToRoom(room)
  await git.add(['-A'])
  const shortHash = hash.slice(0, 7)
  const email = `${username.replace(/[^a-zA-Z0-9_-]/g, '_')}@collab-editor.local`
  try {
    await git.commit(`Restored to ${shortHash}`, undefined, { '--author': `${username} <${email}>` })
  } catch (err) {
    // The room already matched that version, so there was nothing new to
    // commit -- not an error from the user's point of view.
    if (!err.message?.includes('nothing to commit')) throw err
  }
  await logActivity(room, 'version-restored', username, { hash: shortHash })
  return getLog(room)
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
  commitAll: (room, message, sessionToken) =>
    withRoomLock(room, () => _commitAll(room, message, sessionToken)),
  createBranch: (room, name, sessionToken) =>
    withRoomLock(room, () => _createBranch(room, name, sessionToken)),
  switchBranch: (room, name, sessionToken) =>
    withRoomLock(room, () => _switchBranch(room, name, sessionToken)),
  push: (room, remoteUrl, token, branch, sessionToken) =>
    withRoomLock(room, () => _push(room, remoteUrl, token, branch, sessionToken)),
  pull: (room, remoteUrl, token, branch, sessionToken) =>
    withRoomLock(room, () => _pull(room, remoteUrl, token, branch, sessionToken)),
  restoreVersion: (room, hash, sessionToken) =>
    withRoomLock(room, () => _restoreVersion(room, hash, sessionToken)),
}
