const crypto = require('crypto')
const { getLoadedLiveDoc } = require('./yjsDoc')

// Lives as a Y.Array inside the project's own document (same pattern as
// chat/comments), so it persists and syncs live to connected clients for
// free -- no separate REST polling needed for the activity panel.
async function logActivity(projectId, type, actor, details = {}) {
  const ydoc = await getLoadedLiveDoc(projectId)
  ydoc.getArray('activity').push([
    { id: crypto.randomUUID(), type, actor, timestamp: Date.now(), details },
  ])
}

module.exports = { logActivity }
