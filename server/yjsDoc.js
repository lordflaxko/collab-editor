const Y = require('yjs')
const { getPersistence, getYDoc } = require('y-websocket/bin/utils')

// getYDoc's automatic persistence load (bindState) happens in the
// background with no way to await it, so a doc nobody has loaded in this
// process yet can briefly look empty. Re-applying the fully-loaded snapshot
// here is safe even if bindState is also mid-flight or already finished --
// Yjs updates are per-operation and idempotent, so merging in an
// already-known state is a no-op, not a rollback. Any code that needs to
// WRITE into a room's doc (not just read it) must go through this rather
// than persistence.provider.getYDoc alone: that returns a fresh, detached
// Y.Doc reconstructed from storage, so mutating it doesn't persist or
// broadcast to anyone -- this returns the actual live, shared instance.
async function getLoadedLiveDoc(room) {
  const doc = getYDoc(room)
  const persistence = getPersistence()
  if (persistence) {
    const persistedYdoc = await persistence.provider.getYDoc(room)
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(persistedYdoc))
  }
  return doc
}

module.exports = { getLoadedLiveDoc }
