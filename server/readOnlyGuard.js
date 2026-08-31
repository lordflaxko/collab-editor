// Shadows a WebSocket's own `.on('message', ...)` registration so that, for
// this one connection, Yjs sync messages that would mutate the shared
// document are silently dropped before y-websocket's own listener ever sees
// them -- enforced here rather than only hidden in the UI, since a viewer's
// browser could otherwise send hand-crafted sync updates directly.
//
// The Yjs websocket wire format is a leading varint message type (0 = sync,
// 1 = awareness), and for sync messages a second varint sub-type (0 =
// syncStep1, 1 = syncStep2, 2 = update). Only syncStep2 and update actually
// call Y.applyUpdate; syncStep1 just replies with the current state and
// awareness only carries cursor/presence info, so both pass through
// untouched -- a read-only viewer still gets the full live document and
// sees everyone's cursors, they just can't push edits back into it.
const MUTATING_SYNC_SUBTYPES = new Set([1, 2])

function restrictToReadOnly(ws) {
  const originalOn = ws.on.bind(ws)
  ws.on = (event, listener) => {
    if (event !== 'message') return originalOn(event, listener)
    return originalOn('message', (data, isBinary) => {
      const bytes = new Uint8Array(data)
      if (bytes[0] === 0 && MUTATING_SYNC_SUBTYPES.has(bytes[1])) return
      listener(data, isBinary)
    })
  }
  return ws
}

module.exports = { restrictToReadOnly }
