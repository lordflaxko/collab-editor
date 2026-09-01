const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const simpleGit = require('simple-git')
const { getPersistence } = require('y-websocket/bin/utils')
const { getLoadedLiveDoc } = require('./yjsDoc')

const REPOS_ROOT = path.join(__dirname, 'repos')

// Room ids come straight from a URL path segment the visitor typed, so they
// can't be trusted as a filesystem path component (e.g. "../../etc").
// Hashing sidesteps path traversal and illegal-filename characters entirely
// without needing a validation allowlist.
function roomDir(room) {
  const hash = crypto.createHash('sha256').update(room).digest('hex')
  return path.join(REPOS_ROOT, hash)
}

// Reads the room's current files straight from the same leveldb persistence
// the websocket server already has open, so this never needs a client to
// re-upload file contents over HTTP. This deliberately does NOT go through
// y-websocket's getYDoc/shared-docs-map: that returns a freshly-created,
// still-empty doc immediately and loads its persisted state in the
// background without exposing a way to await completion, which raced this
// sync (a room nobody had already loaded in this process would read back as
// having zero files for the first request). Persistence.provider.getYDoc is
// the awaitable, fully-loaded read the same code uses to bind that live doc.
async function readRoomFiles(room) {
  const persistence = getPersistence()
  if (!persistence) throw new Error('Yjs persistence is not configured (YPERSISTENCE unset)')
  const ydoc = await persistence.provider.getYDoc(room)
  const filesMap = ydoc.getMap('files')
  const order = ydoc.getArray('fileOrder')
  return order
    .toArray()
    .flatMap((id) => {
      const meta = filesMap.get(id)
      if (!meta) return []
      const content = ydoc.getText(`content:${id}`).toString()
      return [{ name: meta.name, content }]
    })
}

// The file tree is flat today (no folders), but names come from Yjs state
// that any connected client could in principle set to something like
// "../../evil.txt" -- basename() strips any directory component so a
// crafted name can never escape the room's working directory.
function safeFileName(name) {
  const base = path.basename(name)
  return base === '' || base === '.' || base === '..' ? null : base
}

// Writes the room's current file set into its working directory, creating
// the directory if needed and removing any tracked file that's no longer
// part of the room's file tree (e.g. deleted since the last sync).
async function syncRoomToWorkingDir(room) {
  const dir = roomDir(room)
  fs.mkdirSync(dir, { recursive: true })

  const files = (await readRoomFiles(room))
    .map((f) => ({ ...f, name: safeFileName(f.name) }))
    .filter((f) => f.name !== null)
  const expectedNames = new Set(files.map((f) => f.name))

  for (const entry of fs.readdirSync(dir)) {
    if (entry === '.git') continue
    if (!expectedNames.has(entry)) {
      fs.rmSync(path.join(dir, entry), { force: true })
    }
  }

  for (const file of files) {
    fs.writeFileSync(path.join(dir, file.name), file.content)
  }

  return dir
}

const LANGUAGE_BY_EXTENSION = {
  '.js': 'javascript',
  '.ts': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.cpp': 'cpp',
  '.rs': 'rust',
  '.go': 'go',
}

function languageIdForFilename(name) {
  const dot = name.lastIndexOf('.')
  const ext = dot === -1 ? '' : name.slice(dot)
  return LANGUAGE_BY_EXTENSION[ext] ?? 'javascript'
}

// The reverse of syncRoomToWorkingDir: pushes whatever's currently on disk
// (e.g. after a branch checkout or a pull) back into the room's live Y.Doc,
// so every connected client's file tree and editor content updates to
// match -- this is the "branch switching is shared/global" behavior, since
// a room is one document everyone edits together, not a per-user workspace.
async function applyWorkingDirToRoom(room) {
  const dir = roomDir(room)
  const ydoc = await getLoadedLiveDoc(room)
  const filesMap = ydoc.getMap('files')
  const order = ydoc.getArray('fileOrder')

  const diskEntries = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((entry) => entry !== '.git' && fs.statSync(path.join(dir, entry)).isFile())
    : []

  // Match by filename to preserve each file's id -- and therefore its
  // Y.Text identity, language choice, and any open editor's live binding to
  // it -- across the switch wherever the new branch still has that file.
  const existingByName = new Map()
  order.toArray().forEach((id) => {
    const meta = filesMap.get(id)
    if (meta) existingByName.set(meta.name, id)
  })

  ydoc.transact(() => {
    const keepIds = new Set()

    for (const name of diskEntries) {
      const content = fs.readFileSync(path.join(dir, name), 'utf8')
      let id = existingByName.get(name)
      if (!id) {
        id = crypto.randomUUID().slice(0, 8)
        filesMap.set(id, { name, languageId: languageIdForFilename(name) })
        order.push([id])
      }
      keepIds.add(id)
      const text = ydoc.getText(`content:${id}`)
      if (text.toString() !== content) {
        text.delete(0, text.length)
        text.insert(0, content)
      }
    }

    for (let i = order.length - 1; i >= 0; i--) {
      const id = order.get(i)
      if (!keepIds.has(id)) {
        filesMap.delete(id)
        order.delete(i, 1)
        ydoc.getText(`content:${id}`).delete(0, ydoc.getText(`content:${id}`).length)
      }
    }
  })
}

// Every caller that runs a git command against a room's directory MUST go
// through this first -- simple-git, given a directory with no .git of its
// own, silently walks up to the nearest ANCESTOR repository instead of
// failing. server/repos lives inside this project's own checkout, so a git
// command issued before a room's repo has been initialized doesn't error
// out; it quietly targets this actual project's git history instead. That
// isn't hypothetical: an earlier version of the auto-checkpoint feature in
// checkpoints.js called simpleGit(roomDir(room)).commit() directly without
// this guard and committed a batch of unrelated in-progress source changes
// onto this repo's real branch. Routing every git operation through
// ensureRepo, which awaits git.init() before returning, closes that gap.
async function ensureRepo(room) {
  const dir = roomDir(room)
  fs.mkdirSync(dir, { recursive: true })
  const git = simpleGit(dir)
  if (!fs.existsSync(path.join(dir, '.git'))) {
    await git.init()
    // A placeholder identity for the local repo config; real commits made
    // through this app override author/committer per-commit with whoever
    // is actually signed in (or "Auto-checkpoint" for automatic ones).
    await git.addConfig('user.name', 'Collab Editor')
    await git.addConfig('user.email', 'collab-editor@localhost')
  }
  return git
}

module.exports = {
  roomDir,
  syncRoomToWorkingDir,
  applyWorkingDirToRoom,
  ensureRepo,
  readRoomFiles,
}
