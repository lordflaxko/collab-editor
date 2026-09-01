const simpleGit = require('simple-git')
const { roomDir, syncRoomToWorkingDir } = require('./gitSync')
const { logActivity } = require('./activityLog')

const CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000
const lastCheckpointAt = new Map()

// "Restore previous versions" is required to reach back into live edits
// nobody has manually committed yet, not just committed git history -- so
// uncommitted work needs to periodically become a real commit on its own,
// without anyone asking for one. Rather than run a per-room timer/interval
// for that, this piggybacks on git.js's existing operations (every status
// refresh, branch switch, pull, or commit already touches the room's
// working directory): each one gives this a chance to notice uncommitted
// changes have been sitting for a while and snapshot them. The interval
// gate keeps that from committing on every single call.
async function maybeCheckpoint(room) {
  const last = lastCheckpointAt.get(room) ?? 0
  if (Date.now() - last < CHECKPOINT_INTERVAL_MS) return

  await syncRoomToWorkingDir(room)
  const git = simpleGit(roomDir(room))
  let status
  try {
    status = await git.status()
  } catch {
    return
  }
  if (status.isClean()) {
    lastCheckpointAt.set(room, Date.now())
    return
  }

  await git.add(['-A'])
  await git.commit('Auto-checkpoint', undefined, {
    '--author': 'Auto-checkpoint <checkpoint@collab-editor.local>',
  })
  lastCheckpointAt.set(room, Date.now())
  await logActivity(room, 'checkpoint', 'Auto-checkpoint', {})
}

module.exports = { maybeCheckpoint }
