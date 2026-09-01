const { syncRoomToWorkingDir, ensureRepo } = require('./gitSync')
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
  const last = lastCheckpointAt.get(room)
  // The first time a room is seen, just start its clock rather than treating
  // "never checkpointed" as "checkpoint overdue" -- otherwise a file you
  // haven't even had a chance to look at in the Changes tab yet gets
  // auto-committed out from under you the moment the panel first loads.
  if (last === undefined) {
    lastCheckpointAt.set(room, Date.now())
    return
  }
  if (Date.now() - last < CHECKPOINT_INTERVAL_MS) return

  await syncRoomToWorkingDir(room)
  // Must go through ensureRepo, not a bare simpleGit(roomDir(room)) --
  // see the comment on ensureRepo in gitSync.js for why that distinction
  // matters here specifically.
  const git = await ensureRepo(room)
  const status = await git.status()
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
